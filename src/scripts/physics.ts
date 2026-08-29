// The mast's simulation core: pure and DOM-free, so spec/game.test.ts can
// exercise the game's rules directly without a browser. main.ts is the only
// thing that touches a canvas or a pointer event.

export interface Brace {
  /** 0 = anchored at the mast's base, 1 = anchored at its top. */
  heightFraction: number;
}

export interface MastState {
  /** Radians. 0 = upright; sign is the lean direction. */
  angle: number;
  angularVelocity: number;
  /** Seconds since this run started. */
  time: number;
  braces: Brace[];
}

/** Exceeding this lean angle snaps the mast: the loss condition. */
export const SNAP_ANGLE = 0.5;

/** Braces available per run, shown as a row of dots. */
export const MAX_BRACES = 4;

/** Surviving to this many seconds without snapping is the win condition. */
export const WIN_TIME = 35;

const RAMP_TIME = 26;
const WIND_MIN = 0.15;
const WIND_MAX = 1.4;
const BASE_STIFFNESS = 1.0;
const DAMPING = 0.4;
const BRACE_STIFFNESS = 2.5;
/** How sharply a freshly-planted brace cuts the current sway on contact. */
const BRACE_VELOCITY_CUT = 0.25;

export function initialState(): MastState {
  return { angle: 0, angularVelocity: 0, time: 0, braces: [] };
}

/**
 * Wind torque at a point in time: ramps from WIND_MIN to WIND_MAX over
 * RAMP_TIME, then holds at the plateau, with a small deterministic gust
 * riding on top (a fixed function of time, not Math.random, so a run is
 * reproducible and testable).
 */
export function windTorque(time: number): number {
  const level =
    time >= RAMP_TIME
      ? WIND_MAX
      : WIND_MIN + (WIND_MAX - WIND_MIN) * (time / RAMP_TIME);
  const gust = level * (0.15 * Math.sin(time * 1.3) + 0.08 * Math.sin(time * 3.7 + 1));
  return level + gust;
}

function stiffness(braces: Brace[]): number {
  return braces.reduce(
    (total, brace) => total + BRACE_STIFFNESS * brace.heightFraction ** 2,
    BASE_STIFFNESS,
  );
}

/** Advances the simulation by dt seconds (semi-implicit Euler). */
export function step(state: MastState, dt: number): MastState {
  const torque = windTorque(state.time);
  const k = stiffness(state.braces);
  const angularAcceleration =
    torque - k * state.angle - DAMPING * state.angularVelocity;
  const angularVelocity = state.angularVelocity + angularAcceleration * dt;
  const angle = state.angle + angularVelocity * dt;
  return { angle, angularVelocity, time: state.time + dt, braces: state.braces };
}

/**
 * Plants a brace at the given height along the mast (0..1). Cuts the
 * current sway sharply, the taut line catching the mast, on top of adding
 * lasting stiffness — a brace placed higher up counters more torque.
 */
export function addBrace(state: MastState, heightFraction: number): MastState {
  const clamped = Math.min(1, Math.max(0, heightFraction));
  return {
    ...state,
    angularVelocity: state.angularVelocity * BRACE_VELOCITY_CUT,
    braces: [...state.braces, { heightFraction: clamped }],
  };
}

export function hasSnapped(state: MastState): boolean {
  return Math.abs(state.angle) > SNAP_ANGLE;
}

export function hasWon(state: MastState): boolean {
  return state.time >= WIN_TIME && !hasSnapped(state);
}
