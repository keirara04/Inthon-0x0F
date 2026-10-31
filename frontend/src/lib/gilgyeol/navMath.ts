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

/** Compass heading (0 = north, clockwise) from a deviceorientation event, or null. */
export function headingFromEvent(e: { alpha: number | null; absolute?: boolean; webkitCompassHeading?: number }): number | null {
  if (typeof e.webkitCompassHeading === "number") return e.webkitCompassHeading; // iOS
  if (e.absolute && e.alpha !== null) return (360 - e.alpha) % 360; // Android deviceorientationabsolute
  return null;
}
