import { isKnownAnimal } from "./animals";
import { isDictionaryWord } from "./dictionary";
import { isKnownPlace } from "./places";

export type Category = "name" | "place" | "animal" | "thing";
export const CATEGORIES: Category[] = ["name", "place", "animal", "thing"];
export const ROUND_DURATION = 25; // seconds

// A completed round's words, kept for display so a player can look back at
// what they've already said this session instead of it vanishing the moment
// the next round starts.
export interface RoundRecord {
  letter: string;
  entries: Record<Category, string>;
}

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
  // Ten points per accepted word, whether or not its round is ever completed
  // -- this is the number shown to the player as their score.
  score: number;
  // One entry per *completed* round, most recent last.
  history: RoundRecord[];
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
    score: 0,
    history: [],
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

// A single letter ("T") technically starts with the round's letter and has
// never been used, but it isn't a word — found by actually typing one in.
const MIN_WORD_LENGTH = 2;
const POINTS_PER_WORD = 10;

export function isValidWord(
  state: GameState,
  category: Category,
  word: string,
): boolean {
  if (state.phase !== "active" || !state.letter) return false;
  if (state.entries[category] !== null) return false; // already locked in
  const normalized = normalize(word);
  if (normalized.length < MIN_WORD_LENGTH) return false;
  if (normalized[0] !== state.letter.toLowerCase()) return false;
  if (state.usedWords[category].has(normalized)) return false;
  // "Place" is the one category tied to a real-world checklist rather than
  // free association — it must name an actual geographic place. A general
  // English dictionary won't do here: country and city names are proper
  // nouns, so a plain dictionary check would reject almost every real one.
  if (category === "place" && !isKnownPlace(normalized)) return false;
  // "Animal" accepts animals, birds, and insects — checked against both a
  // real dictionary (so it's an actual word, not just letters) and a
  // curated list of real creatures (so it's actually one of those three).
  if (
    category === "animal" &&
    (!isDictionaryWord(normalized) || !isKnownAnimal(normalized))
  ) {
    return false;
  }
  // "Thing" has no category-specific list of its own, so a real dictionary
  // is what keeps it from being any arbitrary string — plus it's explicitly
  // not a name, a place, or an animal: reject a "thing" that just reuses
  // this round's own name/place/animal answer, or that happens to be a
  // recognised place name.
  if (
    category === "thing" &&
    (!isDictionaryWord(normalized) ||
      isKnownPlace(normalized) ||
      normalized === state.entries.name ||
      normalized === state.entries.place ||
      normalized === state.entries.animal)
  ) {
    return false;
  }
  return true;
}

function isRoundComplete(state: GameState): boolean {
  return CATEGORIES.every((category) => state.entries[category] !== null);
}

// Used both when all four are in (submitWord) and when the clock ran out
// with only three (tick) — a blank field is recorded as "" rather than
// asserted non-null.
function completeRound(state: GameState): GameState {
  const record: RoundRecord = {
    letter: state.letter!,
    entries: {
      name: state.entries.name ?? "",
      place: state.entries.place ?? "",
      animal: state.entries.animal ?? "",
      thing: state.entries.thing ?? "",
    },
  };
  return {
    ...state,
    phase: "idle",
    letter: null,
    timeRemaining: ROUND_DURATION,
    entries: emptyEntries(),
    roundsCompleted: state.roundsCompleted + 1,
    history: [...state.history, record],
  };
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
  const next = { ...state, usedWords, entries, score: state.score + POINTS_PER_WORD };
  // The fourth word completes the round the instant it lands — no reason to
  // make the player wait out a clock that's already been beaten.
  return {
    state: isRoundComplete(next) ? completeRound(next) : next,
    accepted: true,
  };
}

// By the time this is called with time already at zero, a round with all
// four filled has already left "active" via submitWord above — so reaching
// zero here always means at least one category was left blank. Three out of
// four is close enough to let through: the round still ends and its points
// (already banked by submitWord) stand, but only fewer than three costs the
// game.
export function tick(state: GameState, dt: number): GameState {
  if (state.phase !== "active") return state;
  const timeRemaining = Math.max(0, state.timeRemaining - dt);
  if (timeRemaining > 0) return { ...state, timeRemaining };
  const filledCount = CATEGORIES.filter(
    (category) => state.entries[category] !== null,
  ).length;
  if (filledCount < 3) return { ...state, timeRemaining: 0, phase: "lost" };
  return completeRound({ ...state, timeRemaining: 0 });
}

export function hasLost(state: GameState): boolean {
  return state.phase === "lost";
}
