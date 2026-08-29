import {
  hasCollapsed,
  hasSurvived,
  initialState,
  placeMaterial,
  step,
  stormMagnitude,
  MATERIAL_STOCK,
  SURVIVE_TIME,
  TEAR_STRAIN,
  type MaterialKind,
  type TentState,
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

// --- layout: the tent's four anchors sit along the base, palette to the left ---
function groundY() {
  return height * 0.82;
}
function paletteWidth() {
  return Math.min(width * 0.16, 140);
}
function tentSpan() {
  // Height-relative so the tent reads as a real structure on a large desktop
  // viewport rather than a tiny triangle (the mast had the same problem,
  // found by playing the build at the real 1920x1080 marking viewport).
  return Math.min(height * 0.65, 640);
}
function tentCenterX() {
  return paletteWidth() + (width - paletteWidth()) * 0.55;
}
function peakY() {
  return groundY() - tentSpan() * 0.42;
}

const ANCHOR_ORDER: number[] = [0, 1, 2, 3];

function anchorX(side: number) {
  return tentCenterX() + side * tentSpan() * 0.5;
}

type Phase = "practice" | "playing" | "collapsed" | "survived";

/**
 * How long a first-time player gets to try the mechanic with no way to
 * lose, before the real escalating storm begins. Ends early the moment they
 * place a material on their own. Not a spec rule, so it lives here rather
 * than in physics.ts: it's paced by wall-clock feel, not by a testable outcome.
 */
const PRACTICE_DURATION = 6;

let state: TentState = initialState();
let phase: Phase = "practice";
let phaseChangedAt = 0;
let now = 0;
let shakeUntil = 0;
let flashUntil = 0;

// --- audio: generated tones only, no asset files ---
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

// A soft, low click when a material successfully lands on an anchor.
function playPlaceClick() {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch {
    // same rationale as playSnapThud
  }
}

// --- input: drag a material from the palette onto an anchor to stake it ---
interface DragState {
  active: boolean;
  material: MaterialKind | null;
  originX: number;
  originY: number;
  x: number;
  y: number;
}
const drag: DragState = { active: false, material: null, originX: 0, originY: 0, x: 0, y: 0 };

// A drop that misses every anchor still gets a visible response: the
// attempted line fades out instead of just silently vanishing.
let failedDrop: { anchor: { x: number; y: number }; end: { x: number; y: number } } | null =
  null;
let failedDropUntil = 0;

function paletteSlotY(material: MaterialKind) {
  return material === "rock" ? groundY() - 160 : groundY() - 60;
}
function paletteSlotX() {
  return paletteWidth() * 0.5;
}

function paletteHit(x: number, y: number): MaterialKind | null {
  for (const material of ["peg", "rock"] as MaterialKind[]) {
    if (state.stock[material] <= 0) continue;
    const sx = paletteSlotX();
    const sy = paletteSlotY(material);
    if (Math.hypot(x - sx, y - sy) < 30) return material;
  }
  return null;
}

/** Nearest anchor index to a point, and how far away it is. */
function nearestAnchor(x: number, y: number): { index: number; distance: number } {
  let best = 0;
  let bestDist = Infinity;
  for (const i of ANCHOR_ORDER) {
    const ax = anchorX(state.anchors[i].side);
    const d = Math.hypot(ax - x, groundY() - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return { index: best, distance: bestDist };
}

canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (phase === "collapsed" || phase === "survived") {
    // any click on a finished run starts a fresh one — straight into the
    // real run, since this player has already had their practice window
    state = initialState();
    phase = "playing";
    phaseChangedAt = now;
    return;
  }

  const material = paletteHit(x, y);
  if (material) {
    drag.active = true;
    drag.material = material;
    drag.originX = paletteSlotX();
    drag.originY = paletteSlotY(material);
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

  // hovering near a pickable palette item still gets a cursor cue — the
  // only pre-click signal that it's the thing to grab
  const hoverable =
    (phase === "playing" || phase === "practice") && paletteHit(x, y) !== null;
  canvas.style.cursor = hoverable ? "grab" : "pointer";
});

canvas.addEventListener("pointerup", () => {
  if (!drag.active) return;
  drag.active = false;
  canvas.style.cursor = "pointer";

  const material = drag.material;
  const { index, distance } = nearestAnchor(drag.x, drag.y);
  const anchor = state.anchors[index];
  const validTarget = distance < 50 && anchor.material === null;

  if ((phase === "playing" || phase === "practice") && material && validTarget) {
    state = placeMaterial(state, index, material);
    playPlaceClick();
  } else {
    failedDrop = {
      anchor: { x: drag.originX, y: drag.originY },
      end: { x: drag.x, y: drag.y },
    };
    failedDropUntil = now + 0.35;
  }
  drag.material = null;
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
  drawRain();
  drawGround();
  drawTent();
  drawAnchors();
  drawActiveDrag();
  drawFailedDrop();
  drawPalette();
  drawFlash();

  ctx!.restore();
}

function skyProgress(): number {
  if (phase === "survived") return Math.min(1, (now - phaseChangedAt) / 2.5) * 0.5 + 0.5;
  return Math.min(0.5, state.time / SURVIVE_TIME);
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

function drawSky() {
  if (phase === "practice") {
    // A calmer dusk tint than the real run's storm sky — the only signal
    // (wordless) that nothing here can actually go wrong yet.
    const grad = ctx!.createLinearGradient(0, 0, 0, groundY());
    grad.addColorStop(0, "rgb(48, 52, 82)");
    grad.addColorStop(1, "rgb(80, 68, 96)");
    ctx!.fillStyle = grad;
    ctx!.fillRect(0, 0, width, groundY());
    return;
  }

  const t = skyProgress();
  const stormTop: [number, number, number] = [24, 26, 34];
  const stormBottom: [number, number, number] = [44, 46, 58];
  const calmTop: [number, number, number] = [180, 205, 225];
  const calmBottom: [number, number, number] = [225, 235, 235];

  const grad = ctx!.createLinearGradient(0, 0, 0, groundY());
  grad.addColorStop(0, lerpColor(stormTop, calmTop, t));
  grad.addColorStop(1, lerpColor(stormBottom, calmBottom, t));
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

interface RainDrop {
  x: number;
  y: number;
  speed: number;
}
let rain: RainDrop[] = [];
function ensureRain() {
  if (rain.length) return;
  for (let i = 0; i < 60; i++) {
    rain.push({
      x: paletteWidth() + Math.random() * (width - paletteWidth()),
      y: Math.random() * groundY(),
      speed: 0.6 + Math.random(),
    });
  }
}
function drawRain() {
  ensureRain();
  const intensity = phase === "playing" || phase === "practice" ? stormMagnitude(state.time) : 0.15;
  ctx!.strokeStyle = "rgba(220,230,255,0.35)";
  ctx!.lineWidth = 1;
  for (const drop of rain) {
    const len = 10 + intensity * 22;
    ctx!.beginPath();
    ctx!.moveTo(drop.x, drop.y);
    ctx!.lineTo(drop.x - len * 0.25, drop.y + len);
    ctx!.stroke();
    drop.y += intensity * 90 * drop.speed * (1 / 60);
    drop.x -= intensity * 20 * drop.speed * (1 / 60);
    if (drop.y > groundY()) {
      drop.y = -10;
      drop.x = paletteWidth() + Math.random() * (width - paletteWidth());
    }
  }
}

function drawTent() {
  const base = state.anchors.map((a) => ({ x: anchorX(a.side), y: groundY() }));
  const peak = { x: tentCenterX(), y: peakY() };

  ctx!.fillStyle = phase === "collapsed" ? "rgba(60,45,35,0.5)" : "rgba(150,110,70,0.85)";
  ctx!.strokeStyle = "rgba(90,65,40,0.9)";
  ctx!.lineWidth = 2;

  if (phase === "collapsed") {
    const fallProgress = Math.min(1, (now - phaseChangedAt) / 1.2);
    const collapsedPeak = { x: peak.x, y: peak.y + (groundY() - peak.y) * fallProgress };
    ctx!.beginPath();
    ctx!.moveTo(base[0].x, base[0].y);
    ctx!.lineTo(collapsedPeak.x, collapsedPeak.y);
    ctx!.lineTo(base[3].x, base[3].y);
    ctx!.closePath();
    ctx!.fill();
    ctx!.stroke();
    return;
  }

  // two fabric faces, front pair and back pair, meeting at the shared peak
  ctx!.beginPath();
  ctx!.moveTo(base[0].x, base[0].y);
  ctx!.lineTo(peak.x, peak.y);
  ctx!.lineTo(base[1].x, base[1].y);
  ctx!.closePath();
  ctx!.fill();
  ctx!.stroke();

  ctx!.beginPath();
  ctx!.moveTo(base[2].x, base[2].y);
  ctx!.lineTo(peak.x, peak.y);
  ctx!.lineTo(base[3].x, base[3].y);
  ctx!.closePath();
  ctx!.fill();
  ctx!.stroke();

  ctx!.beginPath();
  ctx!.moveTo(peak.x, peak.y);
  ctx!.lineTo(tentCenterX(), groundY());
  ctx!.stroke();
}

// Each anchor's colour and jitter reflect its own live strain — the
// wordless "what's going wrong" feedback: a calm anchor sits still and
// pale, a strained one reddens and shakes before it ever tears.
function drawAnchors() {
  if (phase === "collapsed") return;
  for (const anchor of state.anchors) {
    const t = Math.min(1, Math.abs(anchor.strain) / TEAR_STRAIN);
    const jitter = t > 0.5 ? (Math.random() - 0.5) * 6 * (t - 0.5) * 2 : 0;
    const x = anchorX(anchor.side) + jitter;
    const y = groundY();
    ctx!.beginPath();
    ctx!.arc(x, y, 8, 0, Math.PI * 2);
    ctx!.fillStyle = lerpColor([210, 190, 150], [200, 40, 30], t);
    ctx!.fill();
    if (anchor.material) {
      ctx!.fillStyle = anchor.material === "rock" ? "#6b6b6b" : "#c9a24a";
      ctx!.beginPath();
      ctx!.arc(x, y, 4, 0, Math.PI * 2);
      ctx!.fill();
    }
  }
}

function drawPalette() {
  ctx!.fillStyle = "rgba(20,20,30,0.35)";
  ctx!.fillRect(0, 0, paletteWidth(), height);

  for (const material of ["rock", "peg"] as MaterialKind[]) {
    const x = paletteSlotX();
    const y = paletteSlotY(material);
    const remaining = state.stock[material];
    const isDragging = drag.active && drag.material === material;

    ctx!.globalAlpha = remaining > 0 && !isDragging ? 1 : 0.25;
    ctx!.fillStyle = material === "rock" ? "#6b6b6b" : "#c9a24a";
    ctx!.beginPath();
    if (material === "rock") {
      ctx!.arc(x, y, 18, 0, Math.PI * 2);
    } else {
      ctx!.fillRect(x - 6, y - 20, 12, 40);
    }
    ctx!.fill();
    ctx!.globalAlpha = 1;

    // remaining stock shown as a small row of dots, same language as the
    // brace-budget dots the mast version used
    const dotGap = 10;
    const startX = x - ((MATERIAL_STOCK[material] - 1) * dotGap) / 2;
    for (let i = 0; i < MATERIAL_STOCK[material]; i++) {
      ctx!.beginPath();
      ctx!.arc(startX + i * dotGap, y + 34, 3, 0, Math.PI * 2);
      ctx!.fillStyle = i < remaining ? "rgba(255,235,205,0.9)" : "rgba(255,235,205,0.25)";
      ctx!.fill();
    }
  }
}

// A dragging player sees the attempted placement line immediately, before
// it's committed. Colour flips to a warning red once the release point
// isn't over a valid, empty anchor.
function drawActiveDrag() {
  if (!drag.active || !drag.material) return;
  const { distance, index } = nearestAnchor(drag.x, drag.y);
  const valid = distance < 50 && state.anchors[index].material === null;
  ctx!.strokeStyle = valid ? "rgba(255,235,205,0.95)" : "rgba(255,120,120,0.85)";
  ctx!.lineWidth = 3;
  ctx!.setLineDash([6, 6]);
  ctx!.beginPath();
  ctx!.moveTo(drag.originX, drag.originY);
  ctx!.lineTo(drag.x, drag.y);
  ctx!.stroke();
  ctx!.setLineDash([]);
  ctx!.beginPath();
  ctx!.arc(drag.x, drag.y, 6, 0, Math.PI * 2);
  ctx!.fillStyle = valid ? "rgba(255,235,205,0.95)" : "rgba(255,120,120,0.85)";
  ctx!.fill();
}

// A drop that missed every anchor still leaves a brief mark: the attempted
// line fades out over failedDropUntil instead of vanishing outright.
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

// --- loop ---
let last = performance.now();
function frame(t: number) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  now = t / 1000;

  if (phase === "practice") {
    state = step(state, dt);
    // never allowed to collapse here — a safe window to try the mechanic —
    // and it ends the moment the player places a material on their own, or
    // after a fixed window if they haven't
    const placed = state.anchors.some((a) => a.material !== null);
    if (placed || state.time >= PRACTICE_DURATION) {
      state = initialState();
      phase = "playing";
      phaseChangedAt = now;
      flashUntil = now + 0.25;
      playStartChime();
    }
  } else if (phase === "playing") {
    state = step(state, dt);
    if (hasCollapsed(state)) {
      phase = "collapsed";
      phaseChangedAt = now;
      shakeUntil = now + 0.4;
      playSnapThud();
    } else if (hasSurvived(state)) {
      phase = "survived";
      phaseChangedAt = now;
    }
  }

  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
