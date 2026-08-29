// The rig's simulation core: pure and DOM-free, so spec/game.test.ts can
// exercise the game's rules directly without a browser. main.ts is the only
// thing that touches a canvas or a pointer event.

export type MaterialKind = "bolt" | "weld";

export interface Mount {
  /** Fixed position along the engine's base: -1 (far left) .. 1 (far right). */
  side: number;
  /** How loose this mount currently is. Exceeding STRIP_STRAIN shakes it free. */
  strain: number;
  strainVelocity: number;
  material: MaterialKind | null;
}

export interface RigState {
  /** Seconds since this test run started. */
  time: number;
  mounts: Mount[];
  stock: Record<MaterialKind, number>;
}

/** Fixed mount points along the engine's base, left to right. */
const SIDES = [-1, -0.35, 0.35, 1];

/** Exceeding this strain on any one mount shakes it loose: the failure condition. */
export const STRIP_STRAIN = 0.5;

/** Holding for this many seconds with no mount stripped is the pass condition. */
export const TEST_DURATION = 35;

/** Fewer materials than mounts — same "budget forces a real decision" shape as before. */
export const MATERIAL_STOCK: Record<MaterialKind, number> = { bolt: 2, weld: 1 };

const RAMP_TIME = 26;
const THROTTLE_MIN = 0.15;
const THROTTLE_MAX = 1.4;
const BASE_STIFFNESS = 1.4;
const DAMPING = 0.4;
const BOLT_STIFFNESS = 1.5;
const WELD_STIFFNESS = 4.0;
/** How sharply a freshly-fastened material cuts the mount's current shake on contact. */
const MATERIAL_VELOCITY_CUT = 0.25;

/** How aligned a mount's fixed side needs to be with the wobble to feel full force. */
const EXPOSURE_BASE = 0.15;
const EXPOSURE_AMP = 0.85;

/** Wobble direction cycle: how often the engine's imbalance swings fully side to side. */
const WOBBLE_DIR_FREQ = 0.35;

export function initialState(): RigState {
  return {
    time: 0,
    mounts: SIDES.map((side) => ({ side, strain: 0, strainVelocity: 0, material: null })),
    stock: { ...MATERIAL_STOCK },
  };
}

export function throttleMagnitude(time: number): number {
  return time >= RAMP_TIME
    ? THROTTLE_MAX
    : THROTTLE_MIN + (THROTTLE_MAX - THROTTLE_MIN) * (time / RAMP_TIME);
}

/** -1 (wobbling hard left) .. 1 (wobbling hard right); deterministic, not random. */
export function wobbleDirection(time: number): number {
  return Math.sin(time * WOBBLE_DIR_FREQ);
}

function exposure(mount: Mount, time: number): number {
  return EXPOSURE_BASE + EXPOSURE_AMP * Math.max(0, mount.side * wobbleDirection(time));
}

function stiffness(mount: Mount): number {
  if (mount.material === "bolt") return BASE_STIFFNESS + BOLT_STIFFNESS;
  if (mount.material === "weld") return BASE_STIFFNESS + WELD_STIFFNESS;
  return BASE_STIFFNESS;
}

export function step(state: RigState, dt: number): RigState {
  const magnitude = throttleMagnitude(state.time);
  const mounts = state.mounts.map((mount) => {
    const torque = magnitude * exposure(mount, state.time);
    const k = stiffness(mount);
    const strainAcceleration = torque - k * mount.strain - DAMPING * mount.strainVelocity;
    const strainVelocity = mount.strainVelocity + strainAcceleration * dt;
    const strain = mount.strain + strainVelocity * dt;
    return { ...mount, strain, strainVelocity };
  });
  return { ...state, mounts, time: state.time + dt };
}

export function fastenMaterial(
  state: RigState,
  mountIndex: number,
  material: MaterialKind,
): RigState {
  const mount = state.mounts[mountIndex];
  if (!mount || mount.material !== null || state.stock[material] <= 0) return state;
  const mounts = state.mounts.map((m, i) =>
    i === mountIndex
      ? { ...m, material, strainVelocity: m.strainVelocity * MATERIAL_VELOCITY_CUT }
      : m,
  );
  return { ...state, mounts, stock: { ...state.stock, [material]: state.stock[material] - 1 } };
}

export function hasFailed(state: RigState): boolean {
  return state.mounts.some((m) => Math.abs(m.strain) > STRIP_STRAIN);
}

export function hasPassed(state: RigState): boolean {
  return state.time >= TEST_DURATION && !hasFailed(state);
}
