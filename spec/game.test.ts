// This week's contract: "it can be lost — a wrong move is possible, and play
// ends somewhere." The focused rule under test is the tear threshold, since
// it's the one thing that actually ends a run in a loss. The other tests
// aren't required by the spec, but they guard the difficulty curve: a tent
// with no intervention must be losable, and which anchor gets which material
// must matter, or the one mechanic the whole game hangs on wouldn't mean
// anything.
import { describe, expect, it } from "vitest";
import {
  hasCollapsed,
  hasSurvived,
  initialState,
  placeMaterial,
  step,
  SURVIVE_TIME,
  TEAR_STRAIN,
  type TentState,
} from "../src/scripts/physics";

function anchorState(overrides: Partial<TentState["anchors"][number]>): TentState {
  const state = initialState();
  state.anchors[0] = { ...state.anchors[0], ...overrides };
  return state;
}

describe("the tear rule (play can be lost)", () => {
  it("does not tear an anchor within its safe strain", () => {
    expect(hasCollapsed(anchorState({ strain: TEAR_STRAIN - 0.01 }))).toBe(false);
  });

  it("tears an anchor that exceeds the threshold, in either direction", () => {
    expect(hasCollapsed(anchorState({ strain: TEAR_STRAIN + 0.01 }))).toBe(true);
    expect(hasCollapsed(anchorState({ strain: -(TEAR_STRAIN + 0.01) }))).toBe(true);
  });

  it("tears the whole tent if even one of several anchors gives way", () => {
    const state = initialState();
    state.anchors[2] = { ...state.anchors[2], strain: TEAR_STRAIN + 0.05 };
    expect(hasCollapsed(state)).toBe(true);
  });
});

describe("difficulty curve", () => {
  const dt = 1 / 60;

  it("tears an unpinned tent well before the run is won", () => {
    let state = initialState();
    while (state.time < SURVIVE_TIME && !hasCollapsed(state)) {
      state = step(state, dt);
    }
    expect(hasCollapsed(state)).toBe(true);
    expect(state.time).toBeLessThan(SURVIVE_TIME / 2);
  });

  it("survives when both exposed far corners are staked, even leaving a middle bare", () => {
    let state = initialState();
    state = placeMaterial(state, 0, "rock"); // side -1
    state = placeMaterial(state, 1, "peg"); // side -0.35
    state = placeMaterial(state, 3, "peg"); // side 1
    // side 0.35 (index 2) stays bare — a middle anchor, lower peak exposure.
    while (state.time < SURVIVE_TIME) {
      state = step(state, dt);
      if (hasCollapsed(state)) break;
    }
    expect(hasCollapsed(state)).toBe(false);
    expect(hasSurvived(state)).toBe(true);
  });

  it("still tears if a far corner is left bare, even with both middles staked", () => {
    let state = initialState();
    state = placeMaterial(state, 1, "rock"); // side -0.35 (a middle)
    state = placeMaterial(state, 2, "peg"); // side 0.35 (a middle)
    state = placeMaterial(state, 3, "peg"); // side 1 (a far corner)
    // side -1 (index 0), a far corner, stays bare.
    while (state.time < SURVIVE_TIME && !hasCollapsed(state)) {
      state = step(state, dt);
    }
    expect(hasCollapsed(state)).toBe(true);
  });
});

describe("placement feedback", () => {
  it("cuts an anchor's current lift the instant a material lands", () => {
    const swaying = anchorState({ strainVelocity: 1.2 });
    const staked = placeMaterial(swaying, 0, "peg");
    expect(Math.abs(staked.anchors[0].strainVelocity)).toBeLessThan(1.2);
  });

  it("a rock stiffens an anchor more than a peg does, under the same storm", () => {
    let withPeg = placeMaterial(initialState(), 0, "peg");
    let withRock = placeMaterial(initialState(), 0, "rock");
    const dt = 1 / 60;
    // Both start at time 0 and feel the identical torque profile, so any gap
    // in resulting strain comes only from the material's stiffness.
    for (let i = 0; i < 300; i++) {
      withPeg = step(withPeg, dt);
      withRock = step(withRock, dt);
    }
    expect(Math.abs(withRock.anchors[0].strain)).toBeLessThan(Math.abs(withPeg.anchors[0].strain));
  });

  it("does not place a material on an already-staked anchor, or beyond stock", () => {
    let state = initialState();
    state = placeMaterial(state, 0, "rock");
    const stockAfterFirst = state.stock.rock;
    state = placeMaterial(state, 0, "peg"); // anchor 0 already has a rock
    expect(state.anchors[0].material).toBe("rock");
    expect(state.stock.rock).toBe(stockAfterFirst);

    state = placeMaterial(state, 1, "rock"); // out of rocks now
    expect(state.anchors[1].material).toBeNull();
  });
});
