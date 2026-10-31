// Pure navigation math for useNavigation. No React, no browser APIs, so it runs under `node --test`.
import type { DirectionState } from "./types";

/** Signed turn from heading `from` to `to`, in (-180, 180]. Positive = clockwise (right). */
export function delta(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Average of compass headings on a circle: 359° and 1° average to 0°, not 180°. */
export function circularMean(headings: number[]): number | null {
  if (headings.length === 0) return null;
  let x = 0;
  let y = 0;
  for (const h of headings) {
    x += Math.cos((h * Math.PI) / 180);
    y += Math.sin((h * Math.PI) / 180);
  }
  if (Math.hypot(x, y) < 1e-9) return null; // readings cancel out: no usable direction
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** A raw compass reading turned by the saved north offset, so 0 = the map's "up" (0–360). */
export function corrected(raw: number, offset: number): number {
  return (((raw - offset) % 360) + 360) % 360;
}

/** The offset that makes `raw` read as `target`: calibrate while facing along a corridor of known heading. */
export function offsetFor(raw: number, target: number): number {
  return (((raw - target) % 360) + 360) % 360;
}

export const ALIGNED_DEG = 20;
export const NEAR_DEG = 60;
export const OFF_ROUTE_DEG = 60;
export const OFF_ROUTE_MS = 5000;

/** Maps the gap to the target heading onto the store's DirectionState. null = no compass / no target. */
export function dirState(d: number | null): DirectionState {
  if (d === null) return "unstable";
  const a = Math.abs(d);
  if (a <= ALIGNED_DEG) return "aligned";
  if (a <= NEAR_DEG) return "near";
  return "far";
}

export interface OffRouteState {
  /** Set once the user has faced the target on this step; before that, turning around to find it is not "off route". */
  armed: boolean;
  /** When the current run of >= OFF_ROUTE_DEG started, or null. */
  since: number | null;
  off: boolean;
}

export const OFF_ROUTE_RESET: OffRouteState = { armed: false, since: null, off: false };

/** Advances off-route detection by one compass reading. Reset with OFF_ROUTE_RESET on every new step. */
export function trackOffRoute(s: OffRouteState, d: number | null, now: number): OffRouteState {
  if (d === null) return { ...s, since: null };
  const a = Math.abs(d);
  const armed = s.armed || a <= ALIGNED_DEG;
  if (!armed || a < OFF_ROUTE_DEG) return { armed, since: null, off: false };
  const since = s.since ?? now;
  return { armed, since, off: s.off || now - since >= OFF_ROUTE_MS };
}

/** A direction in the earth frame: x = east, y = north, z = up. */
type Vec3 = [number, number, number];
/** The phone's top edge and camera (out of the back) as earth-frame directions. */
export type Axes = { top: Vec3; back: Vec3 };

/**
 * Heading of whichever axis lies flatter: the top edge when the phone is held low, the camera when it is held
 * up. They agree whenever the phone isn't rolled sideways, and the switch falls at 45° tilt, where both are
 * equally noisy. Plain `360 - alpha` is the top edge alone, which goes jittery and then locks near upright.
 */
export function headingFromAxes({ top, back }: Axes): number {
  const [x, y] = Math.hypot(top[0], top[1]) >= Math.hypot(back[0], back[1]) ? top : back;
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** Axes from deviceorientation angles (W3C rotation Z-X'-Y''; `back` is the spec's "compass heading" Vx/Vy). */
export function axesFromEuler(alpha: number, beta: number, gamma: number): Axes {
  const r = Math.PI / 180;
  const [cZ, sZ, cX, sX, cY, sY] = [Math.cos(alpha * r), Math.sin(alpha * r), Math.cos(beta * r), Math.sin(beta * r), Math.cos(gamma * r), Math.sin(gamma * r)];
  return {
    top: [-sZ * cX, cZ * cX, sX],
    back: [-cZ * sY - sZ * sX * cY, -sZ * sY + cZ * sX * cY, -cX * cY],
  };
}

/** Axes from an AbsoluteOrientationSensor quaternion [x, y, z, w] (device -> earth). */
export function axesFromQuaternion([x, y, z, w]: readonly number[]): Axes {
  return {
    top: [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    back: [-2 * (x * z + y * w), -2 * (y * z - x * w), -(1 - 2 * (x * x + y * y))],
  };
}

/** Compass heading (0 = north, clockwise) from a deviceorientation event, or null. */
export function headingFromEvent(e: {
  alpha: number | null;
  beta?: number | null;
  gamma?: number | null;
  absolute?: boolean;
  webkitCompassHeading?: number;
}): number | null {
  if (typeof e.webkitCompassHeading === "number") return e.webkitCompassHeading; // iOS, already tilt-compensated
  if (e.absolute && e.alpha !== null) return headingFromAxes(axesFromEuler(e.alpha, e.beta ?? 0, e.gamma ?? 0)); // Android
  return null;
}
