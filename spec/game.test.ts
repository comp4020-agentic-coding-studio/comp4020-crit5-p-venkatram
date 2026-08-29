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
  type Category,
  type GameState,
} from "../src/scripts/game";

function activeState(letter = "A"): GameState {
  return startRound(initialState(), letter);
}

// "place" and "animal" are each checked against a real-world list, and
// "thing" against a real dictionary, so synthetic "A-place"/"A-animal"/
// "A-thing" words won't do — only "name" stays free-form.
function wordFor(category: Category, letter: string): string {
  if (category === "place") {
    return letter.toUpperCase() === "A" ? "Argentina" : "Athens";
  }
  if (category === "animal") {
    return letter.toUpperCase() === "A" ? "Ant" : "Antelope";
  }
  if (category === "thing") {
    return letter.toUpperCase() === "A" ? "Anchor" : "Axe";
  }
  return `${letter}-${category}`;
}

describe("the loss rule (play can be lost)", () => {
  it("does not lose a round with time still on the clock", () => {
    const state = tick(activeState(), 1);
    expect(hasLost(state)).toBe(false);
  });

  it("loses the game if the timer runs out with two or more categories still blank", () => {
    let state = activeState();
    state = submitWord(state, "name", "Apple").state;
    // "place", "animal", "thing" left blank
    state = tick(state, ROUND_DURATION);
    expect(hasLost(state)).toBe(true);
  });

  it("does not lose for one field left blank — three in before time's up still ends the round cleanly", () => {
    let state = activeState();
    state = submitWord(state, "name", "Apple").state;
    state = submitWord(state, "place", "Athens").state;
    state = submitWord(state, "animal", "Ant").state;
    // "thing" left blank
    state = tick(state, ROUND_DURATION);
    expect(hasLost(state)).toBe(false);
    expect(state.phase).toBe("idle");
    expect(state.roundsCompleted).toBe(1);
    expect(state.score).toBe(30); // the three accepted words still count
  });

  it("completes the round immediately once all four are filled, before time runs out", () => {
    let state = activeState();
    for (const category of CATEGORIES) {
      state = submitWord(state, category, wordFor(category, "A")).state;
    }
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

  it("rejects a single letter as too short to be a word", () => {
    const state = activeState("T");
    const result = submitWord(state, "name", "T");
    expect(result.accepted).toBe(false);
    expect(result.state.entries.name).toBeNull();
  });

  it("rejects a word already used for that category, case-insensitively", () => {
    let state = activeState("A");
    for (const category of CATEGORIES) {
      state = submitWord(state, category, wordFor(category, "A")).state; // completes round 1
    }
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

  it("rejects a place that isn't a real geographic name, even though other categories accept anything", () => {
    const state = activeState("A");
    const place = submitWord(state, "place", "Applesauce");
    expect(place.accepted).toBe(false);
    const name = submitWord(state, "name", "Applesauce");
    expect(name.accepted).toBe(true);
  });

  it("accepts a real country or city for the place category", () => {
    const state = activeState("A");
    expect(submitWord(state, "place", "Argentina").accepted).toBe(true);
  });

  it("accepts a real city missing from an earlier, narrower place list", () => {
    const state = activeState("B");
    expect(submitWord(state, "place", "Bangalore").accepted).toBe(true);
  });

  it("rejects an animal that isn't a real animal, bird, or insect", () => {
    const state = activeState("U");
    expect(submitWord(state, "animal", "Uru").accepted).toBe(false);
  });

  it("accepts a real animal, bird, or insect for the animal category", () => {
    const state = activeState("U");
    expect(submitWord(state, "animal", "Urial").accepted).toBe(true);
  });

  it("rejects a thing that duplicates this round's own name, place, or animal", () => {
    let state = activeState("A");
    state = submitWord(state, "name", "Apple").state;
    const result = submitWord(state, "thing", "Apple");
    expect(result.accepted).toBe(false);
  });

  it("rejects a thing that is actually a recognised place", () => {
    const state = activeState("A");
    const result = submitWord(state, "thing", "Argentina");
    expect(result.accepted).toBe(false);
  });

  it("rejects a thing that is actually a color", () => {
    const state = activeState("Y");
    const result = submitWord(state, "thing", "Yellow");
    expect(result.accepted).toBe(false);
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
      state = submitWord(state, category, wordFor(category, "A")).state; // completes round 1
    }
    state = startRound(state, "A");
    const result = submitWord(state, "name", "A-name");
    expect(result.accepted).toBe(false);
  });
});

describe("scoring and history", () => {
  it("awards ten points per accepted word, even if the round is never completed", () => {
    let state = activeState("A");
    state = submitWord(state, "name", "Apple").state;
    state = submitWord(state, "place", "Athens").state;
    expect(state.score).toBe(20);
    state = tick(state, ROUND_DURATION); // "animal"/"thing" left blank -> loss
    expect(hasLost(state)).toBe(true);
    expect(state.score).toBe(20); // points already earned survive the loss
  });

  it("does not award a point for a rejected word", () => {
    const state = activeState("B");
    const result = submitWord(state, "name", "Apple"); // wrong letter
    expect(result.accepted).toBe(false);
    expect(result.state.score).toBe(0);
  });

  it("records a completed round in history with its letter and all four words", () => {
    let state = activeState("A");
    for (const category of CATEGORIES) {
      state = submitWord(state, category, wordFor(category, "A")).state;
    }
    expect(state.history).toEqual([
      {
        letter: "A",
        entries: { name: "a-name", place: "argentina", animal: "ant", thing: "anchor" },
      },
    ]);
  });

  it("records a near-miss round (three of four filled) with the blank field as an empty string", () => {
    let state = activeState("A");
    state = submitWord(state, "name", "Apple").state;
    state = submitWord(state, "place", "Athens").state;
    state = submitWord(state, "animal", "Ant").state;
    state = tick(state, ROUND_DURATION);
    expect(state.history).toEqual([
      {
        letter: "A",
        entries: { name: "apple", place: "athens", animal: "ant", thing: "" },
      },
    ]);
  });

  it("does not record a round in history if it ends in a loss", () => {
    let state = activeState("A");
    state = submitWord(state, "name", "Apple").state;
    state = tick(state, ROUND_DURATION);
    expect(hasLost(state)).toBe(true);
    expect(state.history).toEqual([]);
  });
});
