// The tent's simulation core: pure and DOM-free, so spec/game.test.ts can
// exercise the game's rules directly without a browser. main.ts is the only
// thing that touches a canvas or a pointer event.

export type MaterialKind = "peg" | "rock";

export interface Anchor {
  /** Fixed position along the tent's base: -1 (far left) .. 1 (far right). */
  side: number;
  /** How loose/lifted this corner currently is. Exceeding TEAR_STRAIN rips it free. */
  strain: number;
  strainVelocity: number;
  material: MaterialKind | null;
}

export interface TentState {
  /** Seconds since this run started. */
  time: number;
  anchors: Anchor[];
  stock: Record<MaterialKind, number>;
}

/** Fixed base points a tent is staked at, left to right. */
const SIDES = [-1, -0.35, 0.35, 1];

/** Exceeding this strain on any one anchor tears it free: the loss condition. */
export const TEAR_STRAIN = 0.5;

/** Surviving to this many seconds without any anchor tearing is the win condition. */
export const SURVIVE_TIME = 35;

/** Fewer materials than anchors — same "budget forces a real decision" shape as before. */
export const MATERIAL_STOCK: Record<MaterialKind, number> = { peg: 2, rock: 1 };

const RAMP_TIME = 26;
const STORM_MIN = 0.15;
const STORM_MAX = 1.4;
const BASE_STIFFNESS = 1.4;
const DAMPING = 0.4;
const PEG_STIFFNESS = 1.5;
const ROCK_STIFFNESS = 4.0;
/** How sharply a freshly-staked material cuts the anchor's current lift on contact. */
const MATERIAL_VELOCITY_CUT = 0.25;

/** How aligned an anchor's fixed side needs to be with the wind to feel full force. */
const EXPOSURE_BASE = 0.15;
const EXPOSURE_AMP = 0.85;

/** Wind direction cycle: how often the storm's lean swings fully side to side. */
const WIND_DIR_FREQ = 0.35;

export function initialState(): TentState {
  return {
    time: 0,
    anchors: SIDES.map((side) => ({ side, strain: 0, strainVelocity: 0, material: null })),
    stock: { ...MATERIAL_STOCK },
  };
}

export function stormMagnitude(time: number): number {
  return time >= RAMP_TIME
    ? STORM_MAX
    : STORM_MIN + (STORM_MAX - STORM_MIN) * (time / RAMP_TIME);
}

/** -1 (leaning hard left) .. 1 (leaning hard right); deterministic, not random. */
export function windDirection(time: number): number {
  return Math.sin(time * WIND_DIR_FREQ);
}

function exposure(anchor: Anchor, time: number): number {
  return EXPOSURE_BASE + EXPOSURE_AMP * Math.max(0, anchor.side * windDirection(time));
}

function stiffness(anchor: Anchor): number {
  if (anchor.material === "peg") return BASE_STIFFNESS + PEG_STIFFNESS;
  if (anchor.material === "rock") return BASE_STIFFNESS + ROCK_STIFFNESS;
  return BASE_STIFFNESS;
}

export function step(state: TentState, dt: number): TentState {
  const magnitude = stormMagnitude(state.time);
  const anchors = state.anchors.map((anchor) => {
    const torque = magnitude * exposure(anchor, state.time);
    const k = stiffness(anchor);
    const strainAcceleration = torque - k * anchor.strain - DAMPING * anchor.strainVelocity;
    const strainVelocity = anchor.strainVelocity + strainAcceleration * dt;
    const strain = anchor.strain + strainVelocity * dt;
    return { ...anchor, strain, strainVelocity };
  });
  return { ...state, anchors, time: state.time + dt };
}

export function placeMaterial(
  state: TentState,
  anchorIndex: number,
  material: MaterialKind,
): TentState {
  const anchor = state.anchors[anchorIndex];
  if (!anchor || anchor.material !== null || state.stock[material] <= 0) return state;
  const anchors = state.anchors.map((a, i) =>
    i === anchorIndex
      ? { ...a, material, strainVelocity: a.strainVelocity * MATERIAL_VELOCITY_CUT }
      : a,
  );
  return { ...state, anchors, stock: { ...state.stock, [material]: state.stock[material] - 1 } };
}

export function hasCollapsed(state: TentState): boolean {
  return state.anchors.some((a) => Math.abs(a.strain) > TEAR_STRAIN);
}

export function hasSurvived(state: TentState): boolean {
  return state.time >= SURVIVE_TIME && !hasCollapsed(state);
}
