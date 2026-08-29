import {
  CATEGORIES,
  hasLost,
  initialState,
  ROUND_DURATION,
  startRound,
  submitWord,
  tick,
  type Category,
  type GameState,
} from "./game";

const STORAGE_KEY = "npat-game-v1";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const REEL_REPEATS = 8;
const IDLE_SPEED_PX_S = 22;
const SPIN_DURATION_MS = 1400;
const RING_CIRCUMFERENCE = 2 * Math.PI * 45;

// --- persistence -----------------------------------------------------

interface StoredState {
  phase: GameState["phase"];
  letter: string | null;
  timeRemaining: number;
  entries: GameState["entries"];
  usedWords: Record<Category, string[]>;
  roundsCompleted: number;
}

function serialize(state: GameState): string {
  const stored: StoredState = {
    ...state,
    usedWords: {
      name: [...state.usedWords.name],
      place: [...state.usedWords.place],
      animal: [...state.usedWords.animal],
      thing: [...state.usedWords.thing],
    },
  };
  return JSON.stringify(stored);
}

function deserialize(raw: string): GameState {
  const stored = JSON.parse(raw) as StoredState;
  return {
    ...stored,
    usedWords: {
      name: new Set(stored.usedWords.name),
      place: new Set(stored.usedWords.place),
      animal: new Set(stored.usedWords.animal),
      thing: new Set(stored.usedWords.thing),
    },
  };
}

function load(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return deserialize(raw);
  } catch {
    return initialState();
  }
}

function save(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch {
    // storage unavailable — the game still works, just unsaved
  }
}

// --- audio -------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function ensureAudio(): void {
  if (!audioCtx) audioCtx = new AudioContext();
}

function playTone(freq: number, duration: number, type: OscillatorType): void {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playAccept(): void {
  playTone(660, 0.12, "sine");
}

function playReject(): void {
  playTone(140, 0.18, "square");
}

function playLoss(): void {
  playTone(220, 0.5, "sawtooth");
}

document.addEventListener("pointerdown", ensureAudio, { once: true });
document.addEventListener("keydown", ensureAudio, { once: true });

// --- DOM references ------------------------------------------------------

const app = document.getElementById("app") as HTMLDivElement;
const reel = document.getElementById("reel") as HTMLButtonElement;
const reelStrip = document.getElementById("reel-strip") as HTMLDivElement;
const hubLetter = document.getElementById("hub-letter") as HTMLSpanElement;
const ringProgress = document.getElementById(
  "ring-progress",
) as unknown as SVGCircleElement;
const scoreEl = document.getElementById("score") as HTMLSpanElement;
const lostBanner = document.getElementById("lost-banner") as HTMLButtonElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;

const nodes = new Map<Category, HTMLDivElement>();
const inputs = new Map<Category, HTMLInputElement>();
document.querySelectorAll<HTMLDivElement>(".node").forEach((node) => {
  const category = node.dataset.category as Category;
  nodes.set(category, node);
  inputs.set(category, node.querySelector("input") as HTMLInputElement);
});

ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);

// --- reel setup ------------------------------------------------------

for (let i = 0; i < REEL_REPEATS; i++) {
  for (const letter of ALPHABET) {
    const span = document.createElement("span");
    span.textContent = letter;
    reelStrip.appendChild(span);
  }
}

let letterHeight = 0;
let reelOffset = 0;
let spinning = false;
let spinFrom = 0;
let spinTo = 0;
let spinStart = 0;
let pendingLetter: string | null = null;

function measureLetterHeight(): void {
  const first = reelStrip.firstElementChild as HTMLElement | null;
  letterHeight = first ? first.getBoundingClientRect().height : 0;
}

function applyReelTransform(offset: number): void {
  reelStrip.style.transform = `translateY(-${offset}px)`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function startSpin(): void {
  if (spinning || state.phase !== "idle" || letterHeight === 0) return;
  spinning = true;
  reel.disabled = true;
  const letterIndex = Math.floor(Math.random() * ALPHABET.length);
  pendingLetter = ALPHABET[letterIndex];
  const cycleHeight = ALPHABET.length * letterHeight;
  const currentInCycle = reelOffset % cycleHeight;
  const targetInCycle = letterIndex * letterHeight;
  const delta = (targetInCycle - currentInCycle + cycleHeight) % cycleHeight;
  spinFrom = reelOffset;
  spinTo = reelOffset + cycleHeight * 3 + delta;
  spinStart = performance.now();
}

reel.addEventListener("click", startSpin);

// --- rendering ------------------------------------------------------

function updateRing(gs: GameState): void {
  if (gs.phase === "active") {
    const fraction = gs.timeRemaining / ROUND_DURATION;
    ringProgress.style.strokeDashoffset = String(
      RING_CIRCUMFERENCE * (1 - fraction),
    );
    ringProgress.style.stroke = fraction < 0.25 ? "#f87171" : "#4ade80";
  } else {
    ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  }
}

function render(gs: GameState): void {
  app.classList.toggle("lost", gs.phase === "lost");
  reel.disabled = gs.phase !== "idle" || spinning;
  hubLetter.textContent = gs.letter ?? "";
  scoreEl.textContent = String(gs.roundsCompleted);
  updateRing(gs);

  for (const category of CATEGORIES) {
    const node = nodes.get(category)!;
    const input = inputs.get(category)!;
    const entry = gs.entries[category];
    const locked = entry !== null;
    node.classList.toggle("locked", locked);
    node.classList.remove("rejected");
    input.disabled = gs.phase !== "active" || locked;
    if (document.activeElement !== input) {
      input.value = entry ?? "";
    }
  }
}

function flashRejected(category: Category): void {
  const node = nodes.get(category)!;
  const input = inputs.get(category)!;
  node.classList.remove("rejected");
  input.value = "";
  // Force reflow so the animation restarts if it's still running.
  void node.offsetWidth;
  node.classList.add("rejected");
}

// --- input handling ------------------------------------------------------

function attemptSubmit(category: Category, input: HTMLInputElement): void {
  const value = input.value.trim();
  if (!value || state.phase !== "active") return;
  const result = submitWord(state, category, value);
  if (result.accepted) {
    state = result.state;
    playAccept();
  } else {
    playReject();
    flashRejected(category);
  }
  save(state);
  render(state);
}

for (const [category, input] of inputs) {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") attemptSubmit(category, input);
  });
  input.addEventListener("blur", () => attemptSubmit(category, input));
}

// --- reset ------------------------------------------------------

function resetGame(): void {
  spinning = false;
  pendingLetter = null;
  state = initialState();
  localStorage.removeItem(STORAGE_KEY);
  render(state);
}

refreshButton.addEventListener("click", resetGame);
lostBanner.addEventListener("click", resetGame);

// --- main loop ------------------------------------------------------

let state: GameState = load();
let lastFrame = performance.now();
let lastSave = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  if (letterHeight === 0) measureLetterHeight();

  if (spinning) {
    const elapsed = now - spinStart;
    const t = Math.min(1, elapsed / SPIN_DURATION_MS);
    reelOffset = spinFrom + (spinTo - spinFrom) * easeOutCubic(t);
    applyReelTransform(reelOffset);
    if (t >= 1) {
      spinning = false;
      const cycleHeight = ALPHABET.length * letterHeight;
      reelOffset = reelOffset % cycleHeight;
      applyReelTransform(reelOffset);
      if (pendingLetter) {
        state = startRound(state, pendingLetter);
        pendingLetter = null;
      }
      save(state);
      render(state);
    }
  } else if (state.phase === "idle" && letterHeight > 0) {
    const cycleHeight = ALPHABET.length * letterHeight;
    reelOffset = (reelOffset + IDLE_SPEED_PX_S * dt) % cycleHeight;
    applyReelTransform(reelOffset);
  }

  if (state.phase === "active") {
    const wasActive = true;
    state = tick(state, dt);
    if (wasActive && hasLost(state)) {
      playLoss();
    }
    updateRing(state);
    scoreEl.textContent = String(state.roundsCompleted);
    if (now - lastSave > 1000) {
      save(state);
      lastSave = now;
    }
    if (hasLost(state)) render(state);
  }
}

render(state);
requestAnimationFrame(frame);
