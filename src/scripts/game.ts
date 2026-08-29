export type Category = "name" | "place" | "animal" | "thing";
export const CATEGORIES: Category[] = ["name", "place", "animal", "thing"];
export const ROUND_DURATION = 25; // seconds

export interface GameState {
  phase: "idle" | "active" | "lost";
  letter: string | null;
  timeRemaining: number;
  entries: Record<Category, string | null>;
  // Normalized (trimmed, lowercased) words, kept per category for the whole
  // session — this is what makes a word's re-use permanently forbidden for
  // that category rather than just within one round.
  usedWords: Record<Category, Set<string>>;
  roundsCompleted: number;
}

function emptyEntries(): Record<Category, string | null> {
  return { name: null, place: null, animal: null, thing: null };
}

export function initialState(): GameState {
  return {
    phase: "idle",
    letter: null,
    timeRemaining: ROUND_DURATION,
    entries: emptyEntries(),
    usedWords: {
      name: new Set(),
      place: new Set(),
      animal: new Set(),
      thing: new Set(),
    },
    roundsCompleted: 0,
  };
}

// Letter is chosen by the caller (the reel spin) so this stays pure and
// deterministic for tests, the same way fastenMaterial took its material
// as an argument rather than picking one itself.
export function startRound(state: GameState, letter: string): GameState {
  return {
    ...state,
    phase: "active",
    letter: letter.toUpperCase(),
    timeRemaining: ROUND_DURATION,
    entries: emptyEntries(),
  };
}

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

export function isValidWord(
  state: GameState,
  category: Category,
  word: string,
): boolean {
  if (state.phase !== "active" || !state.letter) return false;
  if (state.entries[category] !== null) return false; // already locked in
  const normalized = normalize(word);
  if (!normalized) return false;
  if (normalized[0] !== state.letter.toLowerCase()) return false;
  if (state.usedWords[category].has(normalized)) return false;
  return true;
}

export function submitWord(
  state: GameState,
  category: Category,
  word: string,
): { state: GameState; accepted: boolean } {
  if (!isValidWord(state, category, word)) return { state, accepted: false };
  const normalized = normalize(word);
  const usedWords = {
    ...state.usedWords,
    [category]: new Set(state.usedWords[category]).add(normalized),
  };
  const entries = { ...state.entries, [category]: normalized };
  return { state: { ...state, usedWords, entries }, accepted: true };
}

function isRoundComplete(state: GameState): boolean {
  return CATEGORIES.every((category) => state.entries[category] !== null);
}

export function tick(state: GameState, dt: number): GameState {
  if (state.phase !== "active") return state;
  const timeRemaining = Math.max(0, state.timeRemaining - dt);
  if (timeRemaining > 0) return { ...state, timeRemaining };
  if (isRoundComplete(state)) {
    return {
      ...state,
      phase: "idle",
      letter: null,
      timeRemaining: ROUND_DURATION,
      entries: emptyEntries(),
      roundsCompleted: state.roundsCompleted + 1,
    };
  }
  return { ...state, timeRemaining: 0, phase: "lost" };
}

export function hasLost(state: GameState): boolean {
  return state.phase === "lost";
}
