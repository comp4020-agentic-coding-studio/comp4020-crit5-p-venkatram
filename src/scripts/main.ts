import {
  abandonRound,
  CATEGORIES,
  hasLost,
  initialState,
  ROUND_DURATION,
  startRound,
  submitWord,
  tick,
  type Category,
  type GameState,
  type RoundRecord,
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
  score: number;
  history: RoundRecord[];
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

// One tick per letter the reel passes, exactly like a real slot machine's
// mechanical click — reusing the animation's own easing means the ticks
// naturally decelerate into the landing instead of needing a separate timer.
function playTick(): void {
  playTone(900, 0.03, "square");
}

function playLanding(): void {
  playTone(523, 0.08, "triangle");
  setTimeout(() => playTone(784, 0.15, "triangle"), 70);
}

document.addEventListener("pointerdown", ensureAudio, { once: true });
document.addEventListener("keydown", ensureAudio, { once: true });

// --- DOM references ------------------------------------------------------

const app = document.getElementById("app") as HTMLDivElement;
// The hub circle doubles as the letter picker: clicking it spins the strip
// of letters inside it, exactly like pulling a slot machine's lever.
const hub = document.getElementById("hub") as HTMLButtonElement;
const reelStrip = document.getElementById("reel-strip") as HTMLDivElement;
const ringProgress = document.getElementById(
  "ring-progress",
) as unknown as SVGCircleElement;
const scoreEl = document.getElementById("score") as HTMLSpanElement;
const scoreLive = document.getElementById("score-live") as HTMLSpanElement;
const historyList = document.getElementById("history-list") as HTMLOListElement;
const lostBanner = document.getElementById("lost-banner") as HTMLButtonElement;
const refreshButton = document.getElementById("refresh") as HTMLButtonElement;
const endButton = document.getElementById("end-game") as HTMLButtonElement;

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
let pendingLetterIndex = 0;
let lastTickIndex = 0;

// Row height is viewport-relative (clamp(...vmin...)), so it isn't a
// one-time constant — a resize (or a mobile browser's chrome hiding, or a
// font swap right after the very first measurement) changes the real row
// height while the reel keeps using the old one, and the landing offset
// then points at a pixel between two rows instead of a row itself. Re-snap
// whenever the measured height actually changes, not just the first time.
function measureLetterHeight(): void {
  const first = reelStrip.firstElementChild as HTMLElement | null;
  const measured = first ? first.getBoundingClientRect().height : 0;
  if (measured === letterHeight || measured === 0) return;
  letterHeight = measured;
  if (spinning) return; // mid-spin math already targets a row count, not a pixel offset
  const index =
    state.phase === "idle" ? 0 : Math.max(0, ALPHABET.indexOf(state.letter ?? ""));
  reelOffset = index * letterHeight;
  applyReelTransform(reelOffset);
}

window.addEventListener("resize", () => {
  measureLetterHeight();
});

function applyReelTransform(offset: number): void {
  reelStrip.style.transform = `translateY(-${offset}px)`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function startSpin(): void {
  if (spinning || state.phase !== "idle" || letterHeight === 0) return;
  spinning = true;
  hub.disabled = true;
  const letterIndex = Math.floor(Math.random() * ALPHABET.length);
  pendingLetter = ALPHABET[letterIndex];
  pendingLetterIndex = letterIndex;
  const cycleHeight = ALPHABET.length * letterHeight;
  const currentInCycle = reelOffset % cycleHeight;
  const targetInCycle = letterIndex * letterHeight;
  const delta = (targetInCycle - currentInCycle + cycleHeight) % cycleHeight;
  spinFrom = reelOffset;
  spinTo = reelOffset + cycleHeight * 3 + delta;
  spinStart = performance.now();
  lastTickIndex = Math.floor(spinFrom / letterHeight);
}

hub.addEventListener("click", startSpin);

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

// Words are stored lowercased (that's what keeps "Apple"/"apple" the same
// entry for dedup purposes) — capitalized only at the point of display.
function displayWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

let renderedHistoryLength = -1;

function renderHistory(gs: GameState): void {
  if (gs.history.length === renderedHistoryLength) return;
  renderedHistoryLength = gs.history.length;
  historyList.innerHTML = "";
  for (const record of [...gs.history].reverse()) {
    const item = document.createElement("li");
    item.className = "history-item";

    const badge = document.createElement("span");
    badge.className = "history-letter";
    badge.textContent = record.letter;
    item.appendChild(badge);

    for (const category of CATEGORIES) {
      const cell = document.createElement("span");
      cell.className = "history-cell";
      const word = displayWord(record.entries[category]);
      cell.textContent = word;
      // Longer place names (e.g. "Papua New Guinea") get ellipsised in the
      // narrow grid column — the full word is still there on hover.
      if (word) cell.title = word;
      item.appendChild(cell);
    }

    historyList.appendChild(item);
  }
}

function render(gs: GameState): void {
  app.classList.toggle("lost", gs.phase === "lost");
  app.classList.toggle("active", gs.phase === "active");
  hub.disabled = gs.phase !== "idle" || spinning;
  scoreEl.textContent = String(gs.score);
  scoreLive.textContent = String(gs.score);
  renderHistory(gs);
  updateRing(gs);

  for (const category of CATEGORIES) {
    const node = nodes.get(category)!;
    const input = inputs.get(category)!;
    const entry = gs.entries[category];
    const locked = entry !== null;
    node.classList.toggle("locked", locked);
    input.disabled = gs.phase !== "active" || locked;
    if (document.activeElement !== input) {
      input.value = entry !== null ? displayWord(entry) : "";
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
  node.addEventListener(
    "animationend",
    () => node.classList.remove("rejected"),
    { once: true },
  );
}

// --- input handling ------------------------------------------------------

// Found by actually playing a timed round rather than reading the code: with
// four separate boxes and a 25s clock, having to reach for the mouse and
// click into each next box in turn burns real seconds and breaks the flow of
// typing. Advancing focus on acceptance keeps a round playable end-to-end
// from the keyboard.
function focusNext(gs: GameState): void {
  if (gs.phase === "active") {
    const next = CATEGORIES.find((category) => gs.entries[category] === null);
    if (next) inputs.get(next)!.focus();
  } else if (gs.phase === "idle") {
    hub.focus();
  }
}

function attemptSubmit(category: Category, input: HTMLInputElement): void {
  const value = input.value.trim();
  // A just-accepted word disables its input (see render, above), and a
  // disabled input is forced to blur — which fires this same handler again
  // a frame later. Without this guard that second call always finds the
  // category already locked and flashes a spurious rejection on the word
  // that was just accepted.
  if (!value || state.phase !== "active" || state.entries[category] !== null) {
    return;
  }
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
  // Deferred a frame: disabling the just-locked input (inside render, above)
  // blurs it back to <body> as a separate step, which would otherwise stomp
  // on a focus() called synchronously here.
  if (result.accepted) {
    const finishedState = state;
    requestAnimationFrame(() => focusNext(finishedState));
  }
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

// Only a round in progress has anything worth losing — the timer's already
// autosaving it every second, so refreshing from "idle" or "lost" just
// starts clean with nothing to confirm.
function handleRefreshClick(): void {
  if (
    state.phase === "active" &&
    !window.confirm("Abandon this round and lose your unsaved progress?")
  ) {
    return;
  }
  resetGame();
}

refreshButton.addEventListener("click", handleRefreshClick);
lostBanner.addEventListener("click", resetGame);

// The dedicated "End" control always ends the session — the choice it
// offers is whether that session survives to be resumed, not whether to
// end at all (that's what Cancel on the confirm below is for).
function handleEndClick(): void {
  if (!window.confirm("End the game now?")) return;
  if (window.confirm("Save your progress before ending?")) {
    state = abandonRound(state);
    save(state);
    render(state);
  } else {
    resetGame();
  }
}

endButton.addEventListener("click", handleEndClick);

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
    const tickIndex = Math.floor(reelOffset / letterHeight);
    if (tickIndex !== lastTickIndex) {
      lastTickIndex = tickIndex;
      playTick();
    }
    if (t >= 1) {
      spinning = false;
      // Snap to the exact letter row rather than trusting the eased
      // interpolation's final float — the slot has to land on a precise
      // letter, never a pixel between two.
      reelOffset = pendingLetterIndex * letterHeight;
      applyReelTransform(reelOffset);
      playLanding();
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
    state = tick(state, dt);
    if (hasLost(state)) {
      playLoss();
    }
    updateRing(state);
    if (now - lastSave > 1000) {
      save(state);
      lastSave = now;
    }
    // The clock can end a round two ways: a loss, or a clean near-miss
    // completion (3 of 4 filled). Either way phase leaves "active", and the
    // hub/inputs/history all need to catch up — not just on a loss, or the
    // hub stays disabled forever after a near-miss completion.
    if (state.phase !== "active") render(state);
  }
}

render(state);
requestAnimationFrame(frame);
