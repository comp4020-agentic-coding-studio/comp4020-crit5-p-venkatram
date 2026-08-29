import {
  fastenMaterial,
  hasFailed,
  hasPassed,
  initialState,
  step,
  throttleMagnitude,
  MATERIAL_STOCK,
  STRIP_STRAIN,
  TEST_DURATION,
  type MaterialKind,
  type RigState,
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

// --- layout: the engine's four mounts sit along the rig, palette to the left ---
function floorY() {
  return height * 0.82;
}
function paletteWidth() {
  return Math.min(width * 0.16, 140);
}
function engineSpan() {
  // Height-relative so the engine reads as a real object on a large desktop
  // viewport rather than a tiny box (found by playing the build at the real
  // 1920x1080 marking viewport) — but capped by available width too, or the
  // two outer mounts run off a narrow phone screen entirely.
  return Math.min(height * 0.65, (width - paletteWidth()) * 0.85, 640);
}
function engineCenterX() {
  return paletteWidth() + (width - paletteWidth()) * 0.5;
}
function blockTopY() {
  return floorY() - engineSpan() * 0.32;
}

const MOUNT_ORDER: number[] = [0, 1, 2, 3];

function mountX(side: number) {
  return engineCenterX() + side * engineSpan() * 0.5;
}

type Phase = "practice" | "playing" | "failed" | "passed";

/**
 * How long a first-time player gets to try the mechanic with no way to
 * lose, before the real escalating throttle begins. Ends early the moment
 * they fasten a material on their own. Not a spec rule, so it lives here
 * rather than in physics.ts: it's paced by wall-clock feel, not a testable
 * outcome.
 */
const PRACTICE_DURATION = 6;

let state: RigState = initialState();
let phase: Phase = "practice";
let phaseChangedAt = 0;
let now = 0;
let shakeUntil = 0;
let flashUntil = 0;

// --- audio: generated tones only, no asset files ---
let audioCtx: AudioContext | null = null;
function playFailThud() {
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
// failable test run beginning — pairs with the visual flash for the same moment.
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
    // same rationale as playFailThud
  }
}

// A short metallic clack when a material successfully fastens onto a mount.
function playFastenClack() {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(180, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.22, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch {
    // same rationale as playFailThud
  }
}

// --- input: drag a material from the palette onto a mount to fasten it ---
interface DragState {
  active: boolean;
  material: MaterialKind | null;
  originX: number;
  originY: number;
  x: number;
  y: number;
}
const drag: DragState = { active: false, material: null, originX: 0, originY: 0, x: 0, y: 0 };

// A drop that misses every mount still gets a visible response: the
// attempted line fades out instead of just silently vanishing.
let failedDrop: { origin: { x: number; y: number }; end: { x: number; y: number } } | null = null;
let failedDropUntil = 0;

function paletteSlotY(material: MaterialKind) {
  return material === "weld" ? floorY() - 160 : floorY() - 60;
}
function paletteSlotX() {
  return paletteWidth() * 0.5;
}

function paletteHit(x: number, y: number): MaterialKind | null {
  for (const material of ["bolt", "weld"] as MaterialKind[]) {
    if (state.stock[material] <= 0) continue;
    const sx = paletteSlotX();
    const sy = paletteSlotY(material);
    if (Math.hypot(x - sx, y - sy) < 30) return material;
  }
  return null;
}

/** Nearest mount index to a point, and how far away it is. */
function nearestMount(x: number, y: number): { index: number; distance: number } {
  let best = 0;
  let bestDist = Infinity;
  for (const i of MOUNT_ORDER) {
    const mx = mountX(state.mounts[i].side);
    const d = Math.hypot(mx - x, floorY() - y);
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

  if (phase === "failed" || phase === "passed") {
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
  const hoverable = (phase === "playing" || phase === "practice") && paletteHit(x, y) !== null;
  canvas.style.cursor = hoverable ? "grab" : "pointer";
});

canvas.addEventListener("pointerup", () => {
  if (!drag.active) return;
  drag.active = false;
  canvas.style.cursor = "pointer";

  const material = drag.material;
  const { index, distance } = nearestMount(drag.x, drag.y);
  const mount = state.mounts[index];
  const validTarget = distance < 50 && mount.material === null;

  if ((phase === "playing" || phase === "practice") && material && validTarget) {
    state = fastenMaterial(state, index, material);
    playFastenClack();
  } else {
    failedDrop = {
      origin: { x: drag.originX, y: drag.originY },
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

  drawGarage();
  drawSparks();
  drawFloor();
  drawEngine();
  drawMounts();
  drawActiveDrag();
  drawFailedDrop();
  drawPalette();
  drawFlash();

  ctx!.restore();
}

function testProgress(): number {
  if (phase === "passed") return Math.min(1, (now - phaseChangedAt) / 2.5) * 0.5 + 0.5;
  return Math.min(0.5, state.time / TEST_DURATION);
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
}

function drawGarage() {
  if (phase === "practice") {
    // A calmer, evenly-lit garage tone than the real run's hazard lighting —
    // the only signal (wordless) that nothing here can actually go wrong yet.
    const grad = ctx!.createLinearGradient(0, 0, 0, floorY());
    grad.addColorStop(0, "rgb(58, 60, 68)");
    grad.addColorStop(1, "rgb(74, 74, 80)");
    ctx!.fillStyle = grad;
    ctx!.fillRect(0, 0, width, floorY());
    drawPegboard(0.5);
    return;
  }

  const t = testProgress();
  const hazardTop: [number, number, number] = [42, 24, 24];
  const hazardBottom: [number, number, number] = [58, 40, 38];
  const calmTop: [number, number, number] = [200, 210, 218];
  const calmBottom: [number, number, number] = [222, 226, 228];

  const grad = ctx!.createLinearGradient(0, 0, 0, floorY());
  grad.addColorStop(0, lerpColor(hazardTop, calmTop, t));
  grad.addColorStop(1, lerpColor(hazardBottom, calmBottom, t));
  ctx!.fillStyle = grad;
  ctx!.fillRect(0, 0, width, floorY());
  drawPegboard(t);
}

// A row of hanging-tool silhouettes on the back wall — pure texture, no
// meaning attached to any one shape.
function drawPegboard(t: number) {
  const y = floorY() * 0.18;
  const startX = paletteWidth() + (width - paletteWidth()) * 0.15;
  const gap = 46;
  ctx!.strokeStyle = `rgba(20,20,24,${0.25 + t * 0.1})`;
  ctx!.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const x = startX + i * gap;
    ctx!.beginPath();
    if (i % 2 === 0) {
      // wrench-like hook
      ctx!.moveTo(x, y);
      ctx!.lineTo(x, y + 26);
      ctx!.moveTo(x - 6, y + 26);
      ctx!.lineTo(x + 6, y + 26);
    } else {
      // screwdriver-like hook
      ctx!.moveTo(x, y);
      ctx!.lineTo(x, y + 18);
      ctx!.arc(x, y + 22, 4, 0, Math.PI * 2);
    }
    ctx!.stroke();
  }
}

// A brief white flash marking the exact instant practice ends and the real,
// failable run takes over — paired with playStartChime().
function drawFlash() {
  if (now >= flashUntil) return;
  const alpha = Math.max(0, (flashUntil - now) / 0.25) * 0.5;
  ctx!.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx!.fillRect(0, 0, width, height);
}

function drawFloor() {
  const grad = ctx!.createLinearGradient(0, floorY(), 0, height);
  grad.addColorStop(0, "#4a4a4e");
  grad.addColorStop(1, "#2c2c2e");
  ctx!.fillStyle = grad;
  ctx!.fillRect(0, floorY(), width, height - floorY());
}

interface Spark {
  x: number;
  y: number;
  angle: number;
  speed: number;
}
let sparks: Spark[] = [];
function ensureSparks() {
  if (sparks.length) return;
  for (let i = 0; i < 50; i++) {
    sparks.push({
      x: engineCenterX() + (Math.random() - 0.5) * engineSpan() * 0.6,
      y: floorY() - Math.random() * engineSpan() * 0.5,
      angle: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
    });
  }
}
// Scattering sparks around the rig stand in for the mast's rain: their
// count and speed track throttleMagnitude, the same escalating-danger read.
function drawSparks() {
  ensureSparks();
  const intensity =
    phase === "playing" || phase === "practice" ? throttleMagnitude(state.time) : 0.15;
  ctx!.fillStyle = "rgba(255,190,90,0.7)";
  for (const spark of sparks) {
    if (Math.random() < intensity * 0.02) {
      ctx!.beginPath();
      ctx!.arc(spark.x, spark.y, 1.6, 0, Math.PI * 2);
      ctx!.fill();
    }
    spark.x += Math.cos(spark.angle) * intensity * spark.speed * 1.5;
    spark.y += Math.sin(spark.angle) * intensity * spark.speed * 1.5 + intensity * 0.6;
    if (spark.y > floorY() || spark.x < 0 || spark.x > width) {
      spark.x = engineCenterX() + (Math.random() - 0.5) * engineSpan() * 0.6;
      spark.y = floorY() - engineSpan() * 0.5;
      spark.angle = Math.random() * Math.PI * 2;
    }
  }
}

function drawEngine() {
  const base = state.mounts.map((m) => ({ x: mountX(m.side), y: floorY() }));
  const top = blockTopY();

  ctx!.fillStyle = phase === "failed" ? "rgba(50,50,52,0.5)" : "rgba(120,124,130,0.9)";
  ctx!.strokeStyle = "rgba(30,30,32,0.9)";
  ctx!.lineWidth = 2;

  if (phase === "failed") {
    const fallProgress = Math.min(1, (now - phaseChangedAt) / 1.2);
    const tiltedTop = top + (floorY() - top) * fallProgress;
    ctx!.beginPath();
    ctx!.moveTo(base[0].x, base[0].y);
    ctx!.lineTo(base[0].x, tiltedTop);
    ctx!.lineTo(base[3].x, tiltedTop);
    ctx!.lineTo(base[3].x, base[3].y);
    ctx!.closePath();
    ctx!.fill();
    ctx!.stroke();
    return;
  }

  // main block body, flat-topped between the two outer mounts
  ctx!.beginPath();
  ctx!.moveTo(base[0].x, base[0].y);
  ctx!.lineTo(base[0].x, top);
  ctx!.lineTo(base[3].x, top);
  ctx!.lineTo(base[3].x, base[3].y);
  ctx!.closePath();
  ctx!.fill();
  ctx!.stroke();

  // a raised manifold hump between the two inner mounts, for silhouette
  const humpLeft = base[1].x;
  const humpRight = base[2].x;
  const humpTop = top - engineSpan() * 0.14;
  ctx!.fillStyle = "rgba(90,94,100,0.9)";
  ctx!.beginPath();
  ctx!.moveTo(humpLeft, top);
  ctx!.lineTo(humpLeft, humpTop);
  ctx!.lineTo(humpRight, humpTop);
  ctx!.lineTo(humpRight, top);
  ctx!.closePath();
  ctx!.fill();
  ctx!.stroke();
}

// Each mount's colour and jitter reflect its own live strain — the
// wordless "what's going wrong" feedback: a calm mount sits still and
// pale, a strained one reddens and shakes before it ever strips.
function drawMounts() {
  if (phase === "failed") return;
  for (const mount of state.mounts) {
    const t = Math.min(1, Math.abs(mount.strain) / STRIP_STRAIN);
    const jitter = t > 0.5 ? (Math.random() - 0.5) * 6 * (t - 0.5) * 2 : 0;
    const x = mountX(mount.side) + jitter;
    const y = floorY();
    ctx!.beginPath();
    ctx!.arc(x, y, 8, 0, Math.PI * 2);
    ctx!.fillStyle = lerpColor([190, 190, 195], [210, 40, 30], t);
    ctx!.fill();
    if (mount.material === "bolt") {
      drawHex(x, y, 4, "#c9c9cf");
    } else if (mount.material === "weld") {
      ctx!.fillStyle = "#ff9a3d";
      ctx!.beginPath();
      ctx!.arc(x, y, 4, 0, Math.PI * 2);
      ctx!.fill();
    }
  }
}

function drawHex(cx: number, cy: number, r: number, fill: string) {
  ctx!.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    if (i === 0) ctx!.moveTo(px, py);
    else ctx!.lineTo(px, py);
  }
  ctx!.closePath();
  ctx!.fillStyle = fill;
  ctx!.fill();
}

function drawPalette() {
  ctx!.fillStyle = "rgba(20,20,24,0.4)";
  ctx!.fillRect(0, 0, paletteWidth(), height);

  for (const material of ["weld", "bolt"] as MaterialKind[]) {
    const x = paletteSlotX();
    const y = paletteSlotY(material);
    const remaining = state.stock[material];
    const isDragging = drag.active && drag.material === material;

    ctx!.globalAlpha = remaining > 0 && !isDragging ? 1 : 0.25;
    if (material === "bolt") {
      drawHex(x, y, 18, "#c9c9cf");
    } else {
      // a welded joint: a short rod plus a small spark burst
      ctx!.strokeStyle = "#8a8a90";
      ctx!.lineWidth = 8;
      ctx!.beginPath();
      ctx!.moveTo(x - 16, y + 10);
      ctx!.lineTo(x + 16, y - 10);
      ctx!.stroke();
      ctx!.strokeStyle = "#ff9a3d";
      ctx!.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5;
        ctx!.beginPath();
        ctx!.moveTo(x, y);
        ctx!.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
        ctx!.stroke();
      }
    }
    ctx!.globalAlpha = 1;

    // remaining stock shown as a small row of dots, same language as the
    // brace-budget dots the mast version used
    const dotGap = 10;
    const startX = x - ((MATERIAL_STOCK[material] - 1) * dotGap) / 2;
    for (let i = 0; i < MATERIAL_STOCK[material]; i++) {
      ctx!.beginPath();
      ctx!.arc(startX + i * dotGap, y + 34, 3, 0, Math.PI * 2);
      ctx!.fillStyle = i < remaining ? "rgba(230,230,235,0.9)" : "rgba(230,230,235,0.25)";
      ctx!.fill();
    }
  }
}

// A dragging player sees the attempted fastening line immediately, before
// it's committed. Colour flips to a warning red once the release point
// isn't over a valid, empty mount.
function drawActiveDrag() {
  if (!drag.active || !drag.material) return;
  const { distance, index } = nearestMount(drag.x, drag.y);
  const valid = distance < 50 && state.mounts[index].material === null;
  ctx!.strokeStyle = valid ? "rgba(230,230,235,0.95)" : "rgba(255,120,120,0.85)";
  ctx!.lineWidth = 3;
  ctx!.setLineDash([6, 6]);
  ctx!.beginPath();
  ctx!.moveTo(drag.originX, drag.originY);
  ctx!.lineTo(drag.x, drag.y);
  ctx!.stroke();
  ctx!.setLineDash([]);
  ctx!.beginPath();
  ctx!.arc(drag.x, drag.y, 6, 0, Math.PI * 2);
  ctx!.fillStyle = valid ? "rgba(230,230,235,0.95)" : "rgba(255,120,120,0.85)";
  ctx!.fill();
}

// A drop that missed every mount still leaves a brief mark: the attempted
// line fades out over failedDropUntil instead of vanishing outright.
function drawFailedDrop() {
  if (!failedDrop || now >= failedDropUntil) return;
  const alpha = Math.max(0, (failedDropUntil - now) / 0.35) * 0.8;
  ctx!.strokeStyle = `rgba(255,120,120,${alpha})`;
  ctx!.lineWidth = 3;
  ctx!.setLineDash([6, 6]);
  ctx!.beginPath();
  ctx!.moveTo(failedDrop.origin.x, failedDrop.origin.y);
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
    // never allowed to fail here — a safe window to try the mechanic — and
    // it ends the moment the player fastens a material on their own, or
    // after a fixed window if they haven't
    const fastened = state.mounts.some((m) => m.material !== null);
    if (fastened || state.time >= PRACTICE_DURATION) {
      state = initialState();
      phase = "playing";
      phaseChangedAt = now;
      flashUntil = now + 0.25;
      playStartChime();
    }
  } else if (phase === "playing") {
    state = step(state, dt);
    if (hasFailed(state)) {
      phase = "failed";
      phaseChangedAt = now;
      shakeUntil = now + 0.4;
      playFailThud();
    } else if (hasPassed(state)) {
      phase = "passed";
      phaseChangedAt = now;
    }
  }

  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
