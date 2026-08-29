// This week's contract: "it can be lost — a wrong move is possible, and play
// ends somewhere." The focused rule under test is the strip threshold, since
// it's the one thing that actually ends a run in failure. The other tests
// aren't required by the spec, but they guard the difficulty curve: an
// engine with no intervention must be failable, and which mount gets which
// material must matter, or the one mechanic the whole game hangs on
// wouldn't mean anything.
import { describe, expect, it } from "vitest";
import {
  fastenMaterial,
  hasFailed,
  hasPassed,
  initialState,
  step,
  STRIP_STRAIN,
  TEST_DURATION,
  type RigState,
} from "../src/scripts/physics";

function mountState(overrides: Partial<RigState["mounts"][number]>): RigState {
  const state = initialState();
  state.mounts[0] = { ...state.mounts[0], ...overrides };
  return state;
}

describe("the strip rule (play can be lost)", () => {
  it("does not strip a mount within its safe strain", () => {
    expect(hasFailed(mountState({ strain: STRIP_STRAIN - 0.01 }))).toBe(false);
  });

  it("strips a mount that exceeds the threshold, in either direction", () => {
    expect(hasFailed(mountState({ strain: STRIP_STRAIN + 0.01 }))).toBe(true);
    expect(hasFailed(mountState({ strain: -(STRIP_STRAIN + 0.01) }))).toBe(true);
  });

  it("fails the whole test if even one of several mounts gives way", () => {
    const state = initialState();
    state.mounts[2] = { ...state.mounts[2], strain: STRIP_STRAIN + 0.05 };
    expect(hasFailed(state)).toBe(true);
  });
});

describe("difficulty curve", () => {
  const dt = 1 / 60;

  it("strips an unfastened engine well before the test is passed", () => {
    let state = initialState();
    while (state.time < TEST_DURATION && !hasFailed(state)) {
      state = step(state, dt);
    }
    expect(hasFailed(state)).toBe(true);
    expect(state.time).toBeLessThan(TEST_DURATION / 2);
  });

  it("passes when both exposed far mounts are fastened, even leaving a middle bare", () => {
    let state = initialState();
    state = fastenMaterial(state, 0, "weld"); // side -1
    state = fastenMaterial(state, 1, "bolt"); // side -0.35
    state = fastenMaterial(state, 3, "bolt"); // side 1
    // side 0.35 (index 2) stays bare — a middle mount, lower peak exposure.
    while (state.time < TEST_DURATION) {
      state = step(state, dt);
      if (hasFailed(state)) break;
    }
    expect(hasFailed(state)).toBe(false);
    expect(hasPassed(state)).toBe(true);
  });

  it("still strips if a far mount is left bare, even with both middles fastened", () => {
    let state = initialState();
    state = fastenMaterial(state, 1, "weld"); // side -0.35 (a middle)
    state = fastenMaterial(state, 2, "bolt"); // side 0.35 (a middle)
    state = fastenMaterial(state, 3, "bolt"); // side 1 (a far mount)
    // side -1 (index 0), a far mount, stays bare.
    while (state.time < TEST_DURATION && !hasFailed(state)) {
      state = step(state, dt);
    }
    expect(hasFailed(state)).toBe(true);
  });
});

describe("fastening feedback", () => {
  it("cuts a mount's current shake the instant a material lands", () => {
    const shaking = mountState({ strainVelocity: 1.2 });
    const fastened = fastenMaterial(shaking, 0, "bolt");
    expect(Math.abs(fastened.mounts[0].strainVelocity)).toBeLessThan(1.2);
  });

  it("a weld stiffens a mount more than a bolt does, under the same throttle", () => {
    let withBolt = fastenMaterial(initialState(), 0, "bolt");
    let withWeld = fastenMaterial(initialState(), 0, "weld");
    const dt = 1 / 60;
    // Both start at time 0 and feel the identical torque profile, so any gap
    // in resulting strain comes only from the material's stiffness.
    for (let i = 0; i < 300; i++) {
      withBolt = step(withBolt, dt);
      withWeld = step(withWeld, dt);
    }
    expect(Math.abs(withWeld.mounts[0].strain)).toBeLessThan(Math.abs(withBolt.mounts[0].strain));
  });

  it("does not fasten a material on an already-fastened mount, or beyond stock", () => {
    let state = initialState();
    state = fastenMaterial(state, 0, "weld");
    const stockAfterFirst = state.stock.weld;
    state = fastenMaterial(state, 0, "bolt"); // mount 0 already has a weld
    expect(state.mounts[0].material).toBe("weld");
    expect(state.stock.weld).toBe(stockAfterFirst);

    state = fastenMaterial(state, 1, "weld"); // out of welds now
    expect(state.mounts[1].material).toBeNull();
  });
});
