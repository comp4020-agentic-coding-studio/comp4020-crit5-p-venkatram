import {
  addBrace,
  hasSnapped,
  hasWon,
  initialState,
  step,
  windTorque,
  MAX_BRACES,
  SNAP_ANGLE,
  WIN_TIME,
  type MastState,
} from "./physics";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("missing #scene canvas");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

let width = 0;
let height = 0;
function resize() {
  width = canvas!.clientWidth;
  height = canvas!.clientHeight;
  const ratio = window.devicePixelRatio || 1;
  canvas!.width = width * ratio;
  canvas!.height = height * ratio;
  ctx!.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

// --- layout: the mast pivots at groundY, on the vertical centre line ---
function groundY() {
  return height * 0.82;
}
function mastX() {
  return width * 0.5;
}
function mastLength() {
  // Height-relative so the mast reads as a proper structure rather than a
  // tick mark on a large desktop viewport (found by playing it at the real
  // 1920x1080 marking viewport, not visible when testing at a smaller window).
  return Math.min(height * 0.6, 600);
}

type Phase = "practice" | "playing" | "snapped" | "won";

/**
 * How long a first-time player gets to try the mechanic with no way to
 * lose, before the real escalating run begins. Ends early the moment they
 * place a brace on their own. Not a spec rule, so it lives here rather than
 * in physics.ts: it's paced by wall-clock feel, not by a testable outcome.
 */
const PRACTICE_DURATION = 6;

let state: MastState = initialState();
let phase: Phase = "practice";
let phaseChangedAt = 0;
let now = 0;
let shakeUntil = 0;
let flashUntil = 0;

function pointOnMast(fraction: number, s: MastState) {
  const len = mastLength() * fraction;
  const x = mastX() + Math.sin(s.angle) * len;
  const y = groundY() - Math.cos(s.angle) * len;
  return { x, y };
}

// --- audio: a single generated thud on snap, no asset files ---
let audioCtx: AudioContext | null = null;
function playSnapThud() {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    // audio is a nice-to-have; a browser that blocks it shouldn't break the game
  }
}

// A short rising chime marking the practice window ending and the real,
// losable run beginning — pairs with the visual flash for the same moment.
function playStartChime() {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(640, audioCtx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.35, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.22);
  } catch {
    // same rationale as playSnapThud
  }
}

// --- input: drag from the mast to the ground plants a brace ---
interface DragState {
  active: boolean;
  /** Height along the mast (0..1) where the drag grabbed it, if it did. */
  grabFraction: number | null;
  x: number;
  y: number;
}
const drag: DragState = { active: false, grabFraction: null, x: 0, y: 0 };

// A drag that misses the landing zone still gets a visible response: the
// attempted line fades out instead of just silently vanishing.
let failedDrop: { anchor: { x: number; y: number }; end: { x: number; y: number } } | null =
  null;
let failedDropUntil = 0;

function distanceToMast(x: number, y: number, s: MastState): number {
  // sample the mast as a short polyline and take the nearest distance
  let best = Infinity;
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const p = pointOnMast(i / steps, s);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best) best = d;
  }
  return best;
}

function heightFractionNear(x: number, y: number, s: MastState): number {
  let best = 0;
  let bestDist = Infinity;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const p = pointOnMast(f, s);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = f;
    }
  }
  return best;
}

canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (phase === "snapped" || phase === "won") {
    // any click on a finished run starts a fresh one — straight into the
    // real run, since this player has already had their practice window
    state = initialState();
    phase = "playing";
    phaseChangedAt = now;
    return;
  }

  if (distanceToMast(x, y, state) < 40) {
    drag.active = true;
    drag.grabFraction = heightFractionNear(x, y, state);
    drag.x = x;
    drag.y = y;
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener("pointermove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (drag.active) {
    drag.x = x;
    drag.y = y;
    return;
  }

  // hovering near the mast (not yet dragging) still gets a cursor cue —
  // the only pre-click signal that it's the thing to grab
  const nearMast = (phase === "playing" || phase === "practice") && distanceToMast(x, y, state) < 40;
  canvas.style.cursor = nearMast ? "grab" : "pointer";
});

canvas.addEventListener("pointerup", () => {
  if (!drag.active) return;
  drag.active = false;
  canvas.style.cursor = "pointer";

  const anchor =
    drag.grabFraction !== null ? pointOnMast(drag.grabFraction, state) : { x: drag.x, y: drag.y };

  if (
    (phase === "playing" || phase === "practice") &&
    drag.grabFraction !== null &&
    state.braces.length < MAX_BRACES &&
    Math.abs(drag.y - groundY()) < 90
  ) {
    state = addBrace(state, drag.grabFraction);
  } else {
    // the drag didn't land — show it fading instead of just vanishing
    failedDrop = { anchor, end: { x: drag.x, y: drag.y } };
    failedDropUntil = now + 0.35;
  }
  drag.grabFraction = null;
});

// --- render ---
function draw() {
  ctx!.clearRect(0, 0, width, height);

  const shake =
    now < shakeUntil
      ? { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 6 }
      : { x: 0, y: 0 };
  ctx!.save();
  ctx!.translate(shake.x, shake.y);

  drawSky();
  drawWindParticles();
  drawGround();
  drawBraces();
  drawMast();
  drawActiveDrag();
  drawFailedDrop();
  drawBraceBudget();
  drawFlash();

  ctx!.restore();
}

function skyProgress(): number {
  if (phase === "won") return Math.min(1, (now - phaseChangedAt) / 2.5) * 0.5 + 0.5;
  return Math.min(0.5, state.time / WIN_TIME) ;
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

function drawSky() {
  if (phase === "practice") {
    // A calmer dusk tint than the real run's night sky — the only signal
    // (wordless) that nothing here can actually go wrong yet.
    const grad = ctx!.createLinearGradient(0, 0, 0, groundY());
    grad.addColorStop(0, "rgb(48, 52, 82)");
    grad.addColorStop(1, "rgb(80, 68, 96)");
    ctx!.fillStyle = grad;
    ctx!.fillRect(0, 0, width, groundY());
    return;
  }

  const t = skyProgress();
  const nightTop: [number, number, number] = [10, 14, 30];
  const nightBottom: [number, number, number] = [30, 34, 55];
  const dawnTop: [number, number, number] = [255, 200, 140];
  const dawnBottom: [number, number, number] = [255, 235, 205];

  const grad = ctx!.createLinearGradient(0, 0, 0, groundY());
  grad.addColorStop(0, lerpColor(nightTop, dawnTop, t));
  grad.addColorStop(1, lerpColor(nightBottom, dawnBottom, t));
  ctx!.fillStyle = grad;
  ctx!.fillRect(0, 0, width, groundY());
}

// A brief white flash marking the exact instant practice ends and the real,
// losable run takes over — paired with playStartChime().
function drawFlash() {
  if (now >= flashUntil) return;
  const alpha = Math.max(0, (flashUntil - now) / 0.25) * 0.5;
  ctx!.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx!.fillRect(0, 0, width, height);
}

function drawGround() {
  const grad = ctx!.createLinearGradient(0, groundY(), 0, height);
  grad.addColorStop(0, "#8a7248");
  grad.addColorStop(1, "#5a4a2e");
  ctx!.fillStyle = grad;
  ctx!.fillRect(0, groundY(), width, height - groundY());
}

let particles: { x: number; y: number; speed: number }[] = [];
function ensureParticles() {
  if (particles.length) return;
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * groundY(),
      speed: 0.5 + Math.random(),
    });
  }
}
function drawWindParticles() {
  ensureParticles();
  const wind =
    phase === "playing" || phase === "practice" ? windTorque(state.time) : 0.15;
  ctx!.strokeStyle = "rgba(255,255,255,0.25)";
  ctx!.lineWidth = 1;
  for (const p of particles) {
    const len = 12 + wind * 20;
    ctx!.beginPath();
    ctx!.moveTo(p.x, p.y);
    ctx!.lineTo(p.x - len, p.y + len * 0.15);
    ctx!.stroke();
    p.x -= wind * 60 * p.speed * (1 / 60);
    if (p.x < -20) {
      p.x = width + 20;
      p.y = Math.random() * groundY();
    }
  }
}

function drawBraces() {
  ctx!.strokeStyle = "rgba(210,190,150,0.9)";
  ctx!.lineWidth = 4;
  for (const brace of state.braces) {
    const anchor = pointOnMast(brace.heightFraction, state);
    // ground point on whichever side the anchor leans away from centre
    const side = anchor.x >= mastX() ? -1 : 1;
    const groundPoint = { x: mastX() + side * mastLength() * 0.35, y: groundY() };
    ctx!.beginPath();
    ctx!.moveTo(anchor.x, anchor.y);
    ctx!.lineTo(groundPoint.x, groundPoint.y);
    ctx!.stroke();
  }
}

function drawMast() {
  const base = { x: mastX(), y: groundY() };
  const top = pointOnMast(1, state);

  const nearSnap = Math.abs(state.angle) / SNAP_ANGLE;
  const hue = phase === "snapped" ? 0 : 40;
  ctx!.strokeStyle = phase === "snapped" ? "#3a2a20" : `hsl(${hue}, 30%, ${25 + nearSnap * 10}%)`;
  ctx!.lineWidth = 14;
  ctx!.lineCap = "round";

  if (phase === "snapped") {
    const breakPoint = pointOnMast(0.55, state);
    ctx!.beginPath();
    ctx!.moveTo(base.x, base.y);
    ctx!.lineTo(breakPoint.x, breakPoint.y);
    ctx!.stroke();

    const fallProgress = Math.min(1, (now - phaseChangedAt) / 1.2);
    const fallAngle = state.angle + fallProgress * 1.2 * Math.sign(state.angle || 1);
    const len = mastLength() * 0.45;
    const tip = {
      x: breakPoint.x + Math.sin(fallAngle) * len,
      y: breakPoint.y - Math.cos(fallAngle) * len,
    };
    ctx!.beginPath();
    ctx!.moveTo(breakPoint.x, breakPoint.y);
    ctx!.lineTo(tip.x, tip.y);
    ctx!.stroke();
  } else {
    ctx!.beginPath();
    ctx!.moveTo(base.x, base.y);
    ctx!.lineTo(top.x, top.y);
    ctx!.stroke();
  }
}

// A dragging player sees the attempted brace line immediately, before it's
// committed — the thing that was silently missing before this fix. Colour
// flips to a warning red once the release point is outside the landing zone.
function drawActiveDrag() {
  if (!drag.active || drag.grabFraction === null) return;
  const anchor = pointOnMast(drag.grabFraction, state);
  const valid = Math.abs(drag.y - groundY()) < 90;
  ctx!.strokeStyle = valid ? "rgba(255,235,205,0.95)" : "rgba(255,120,120,0.85)";
  ctx!.lineWidth = 3;
  ctx!.setLineDash([6, 6]);
  ctx!.beginPath();
  ctx!.moveTo(anchor.x, anchor.y);
  ctx!.lineTo(drag.x, drag.y);
  ctx!.stroke();
  ctx!.setLineDash([]);
  ctx!.beginPath();
  ctx!.arc(drag.x, drag.y, 6, 0, Math.PI * 2);
  ctx!.fillStyle = valid ? "rgba(255,235,205,0.95)" : "rgba(255,120,120,0.85)";
  ctx!.fill();
}

// A drop that missed the landing zone still leaves a brief mark: the
// attempted line fades out over failedDropUntil instead of vanishing outright.
function drawFailedDrop() {
  if (!failedDrop || now >= failedDropUntil) return;
  const alpha = Math.max(0, (failedDropUntil - now) / 0.35) * 0.8;
  ctx!.strokeStyle = `rgba(255,120,120,${alpha})`;
  ctx!.lineWidth = 3;
  ctx!.setLineDash([6, 6]);
  ctx!.beginPath();
  ctx!.moveTo(failedDrop.anchor.x, failedDrop.anchor.y);
  ctx!.lineTo(failedDrop.end.x, failedDrop.end.y);
  ctx!.stroke();
  ctx!.setLineDash([]);
}

function drawBraceBudget() {
  const remaining = MAX_BRACES - state.braces.length;
  const dotRadius = 5;
  const gap = 16;
  const startX = mastX() - ((MAX_BRACES - 1) * gap) / 2;
  const y = groundY() + 26;
  for (let i = 0; i < MAX_BRACES; i++) {
    ctx!.beginPath();
    ctx!.arc(startX + i * gap, y, dotRadius, 0, Math.PI * 2);
    ctx!.fillStyle = i < remaining ? "rgba(255,235,205,0.9)" : "rgba(255,235,205,0.25)";
    ctx!.fill();
  }
}

// --- loop ---
let last = performance.now();
function frame(t: number) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  now = t / 1000;

  if (phase === "practice") {
    state = step(state, dt);
    // never allowed to snap here — a safe window to try the mechanic —
    // and it ends the moment the player braces on their own, or after a
    // fixed window if they haven't
    if (state.braces.length > 0 || state.time >= PRACTICE_DURATION) {
      state = initialState();
      phase = "playing";
      phaseChangedAt = now;
      flashUntil = now + 0.25;
      playStartChime();
    }
  } else if (phase === "playing") {
    state = step(state, dt);
    if (hasSnapped(state)) {
      phase = "snapped";
      phaseChangedAt = now;
      shakeUntil = now + 0.4;
      playSnapThud();
    } else if (hasWon(state)) {
      phase = "won";
      phaseChangedAt = now;
    }
  }

  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
