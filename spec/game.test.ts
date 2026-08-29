// This week's contract: "it can be lost — a wrong move is possible, and play
// ends somewhere." The focused rule under test is the blank-category loss,
// since it's the one thing that actually ends a run. The other tests aren't
// required by the spec, but they guard the two rules the whole game hangs
// on: a word must fit the letter, and a word can never be reused for the
// same category — without those, "no repeats" would just be a suggestion.
import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  hasLost,
  initialState,
  ROUND_DURATION,
  startRound,
  submitWord,
  tick,
  type GameState,
} from "../src/scripts/game";

function activeState(letter = "A"): GameState {
  return startRound(initialState(), letter);
}

describe("the loss rule (play can be lost)", () => {
  it("does not lose a round with time still on the clock", () => {
    const state = tick(activeState(), 1);
    expect(hasLost(state)).toBe(false);
  });

  it("loses the game if the timer runs out with any category still blank", () => {
    let state = activeState();
    state = submitWord(state, "name", "Apple").state;
    state = submitWord(state, "place", "Athens").state;
    state = submitWord(state, "animal", "Ant").state;
    // "thing" left blank
    state = tick(state, ROUND_DURATION);
    expect(hasLost(state)).toBe(true);
  });

  it("does not lose, and starts a fresh round, if all four are filled before time runs out", () => {
    let state = activeState();
    for (const category of CATEGORIES) {
      state = submitWord(state, category, `A-${category}`).state;
    }
    state = tick(state, ROUND_DURATION);
    expect(hasLost(state)).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.roundsCompleted).toBe(1);
  });
});

describe("word validation", () => {
  it("rejects a word that does not start with the round's letter", () => {
    const state = activeState("B");
    const result = submitWord(state, "name", "Apple");
    expect(result.accepted).toBe(false);
    expect(result.state.entries.name).toBeNull();
  });

  it("rejects a word already used for that category, case-insensitively", () => {
    let state = activeState("A");
    for (const category of CATEGORIES) {
      state = submitWord(state, category, `A-${category}`).state;
    }
    state = tick(state, ROUND_DURATION); // completes round 1
    state = startRound(state, "A");
    const result = submitWord(state, "name", "A-NAME");
    expect(result.accepted).toBe(false);
  });

  it("still allows the same word for a different category", () => {
    const state = activeState("A");
    const result = submitWord(state, "thing", "Apple");
    expect(submitWord(state, "name", "Apple").accepted).toBe(true);
    expect(result.accepted).toBe(true);
  });

  it("locks a category the instant a word is accepted, rejecting any further submission", () => {
    let state = activeState("A");
    state = submitWord(state, "name", "Apple").state;
    const result = submitWord(state, "name", "Anchor");
    expect(result.accepted).toBe(false);
    expect(result.state.entries.name).toBe("apple");
  });
});

describe("session bookkeeping", () => {
  it("only increments roundsCompleted on a full, successful round", () => {
    let state = activeState("A");
    state = submitWord(state, "name", "Apple").state;
    state = tick(state, ROUND_DURATION); // incomplete round -> loss, not a completion
    expect(state.roundsCompleted).toBe(0);
    expect(hasLost(state)).toBe(true);
  });

  it("carries usedWords across rounds, not just within one", () => {
    let state = activeState("A");
    for (const category of CATEGORIES) {
      state = submitWord(state, category, `A-${category}`).state;
    }
    state = tick(state, ROUND_DURATION);
    state = startRound(state, "A");
    const result = submitWord(state, "name", "A-name");
    expect(result.accepted).toBe(false);
  });
});
