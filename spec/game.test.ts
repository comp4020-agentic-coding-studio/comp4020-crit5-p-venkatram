// This week's contract: "it can be lost — a wrong move is possible, and play
// ends somewhere." The focused rule under test is the snap threshold, since
// it's the one thing that actually ends a run in a loss. The other two tests
// aren't required by the spec, but they guard the difficulty curve: a mast
// with no intervention must be losable, and where you plant a brace must
// matter, or the one mechanic the whole game hangs on wouldn't mean anything.
import { describe, expect, it } from "vitest";
import {
  addBrace,
  hasSnapped,
  hasWon,
  initialState,
  step,
  MAX_BRACES,
  SNAP_ANGLE,
  WIN_TIME,
} from "../src/scripts/physics";

describe("the snap rule (play can be lost)", () => {
  it("does not snap a mast within the safe lean", () => {
    const state = { ...initialState(), angle: SNAP_ANGLE - 0.01 };
    expect(hasSnapped(state)).toBe(false);
  });

  it("snaps a mast that leans past the threshold, in either direction", () => {
    expect(hasSnapped({ ...initialState(), angle: SNAP_ANGLE + 0.01 })).toBe(true);
    expect(hasSnapped({ ...initialState(), angle: -(SNAP_ANGLE + 0.01) })).toBe(true);
  });
});

describe("difficulty curve", () => {
  it("snaps an unbraced mast well before the run is won", () => {
    let state = initialState();
    const dt = 1 / 60;
    while (state.time < WIN_TIME && !hasSnapped(state)) {
      state = step(state, dt);
    }
    expect(hasSnapped(state)).toBe(true);
    expect(state.time).toBeLessThan(WIN_TIME / 2);
  });

  it("lets a mast fully braced high on the mast survive to a win", () => {
    let state = initialState();
    const dt = 1 / 60;
    while (state.time < WIN_TIME) {
      state = step(state, dt);
      if (hasSnapped(state)) break;
      if (Math.abs(state.angle) > 0.6 * SNAP_ANGLE && state.braces.length < MAX_BRACES) {
        state = addBrace(state, 0.8);
      }
    }
    expect(hasSnapped(state)).toBe(false);
    expect(hasWon(state)).toBe(true);
  });

  it("does not let the same number of low braces save the mast", () => {
    let state = initialState();
    const dt = 1 / 60;
    while (state.time < WIN_TIME) {
      state = step(state, dt);
      if (hasSnapped(state)) break;
      if (Math.abs(state.angle) > 0.6 * SNAP_ANGLE && state.braces.length < MAX_BRACES) {
        state = addBrace(state, 0.3);
      }
    }
    expect(hasSnapped(state)).toBe(true);
  });
});

describe("bracing feedback", () => {
  it("cuts the mast's current sway the instant a brace lands", () => {
    const swaying = { ...initialState(), angularVelocity: 1.2 };
    const braced = addBrace(swaying, 0.7);
    expect(Math.abs(braced.angularVelocity)).toBeLessThan(Math.abs(swaying.angularVelocity));
  });
});
