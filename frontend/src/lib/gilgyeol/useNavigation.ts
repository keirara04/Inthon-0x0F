"use client";

// Navigation engine: compass -> direction state, step progress, off-route detection, checkpoints, re-routing.
// It does not vibrate or speak by itself: the store already pulses from `dir` and owns cue()/say(),
// so wire those into the callbacks instead (onStep, onOffRoute, onArrive, onReroute).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiCheckpointResult, ApiRoute, ApiStep } from "@/types/api";
import { fetchRoute, postCheckpoint } from "./api";
import { routeSummary } from "./routeSummary";
import { stepCompletion } from "./floorTransition";
import { BUILDING } from "./data";
import { circularMean, corrected, delta as angleDelta, dirState, headingFromEvent, offsetFor, OFF_ROUTE_RESET, trackOffRoute } from "./navMath";

/**
 * Per-building north offset: route headings are drawn with the sign's "up" as north, which rarely matches
 * the real compass. Saved on this device after one on-site calibration.
 */
const NORTH_KEY = `gilgyeol-north:${BUILDING}`;
function readOffset(): number | null {
  try {
    const v = typeof window === "undefined" ? null : window.localStorage.getItem(NORTH_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

export type NavStatus = "idle" | "guiding" | "checking" | "offroute" | "awaiting_map" | "arrived";

export interface NavCallbacks {
  /** New step started (also the first one in start()). Speak step.text, play the turn/floor pattern. */
  onStep?: (step: ApiStep, index: number) => void;
  /** Facing away from the route for 5 s. Play the "off" pattern, offer a sign scan. */
  onOffRoute?: () => void;
  onFloorArrival?: (step: Exclude<ApiStep, { kind: "walk" }>, index: number) => void;
  onArrive?: (route: ApiRoute) => void;
  /** Checkpoint showed the user somewhere else; a new route from there is now active. */
  onReroute?: (route: ApiRoute) => void;
}

type IOSOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

const SMOOTHING = 8; // compass samples averaged
const RENDER_MS = 150; // max heading re-render rate

export function useNavigation(callbacks: NavCallbacks = {}) {
  const [route, setRoute] = useState<ApiRoute | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [status, setStatus] = useState<NavStatus>("idle");
  const [rawHeading, setHeading] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(readOffset);
  const heading = rawHeading === null ? null : corrected(rawHeading, offset ?? 0);

  // Latest values for event handlers and async actions (avoids stale closures).
  const cb = useRef(callbacks);
  const live = useRef({ route, stepIndex, status });
  const off = useRef(OFF_ROUTE_RESET);
  const fixedHeading = useRef<number | null>(null); // dev override from ?heading=
  useEffect(() => {
    cb.current = callbacks;
  });

  const set = useCallback((patch: Partial<typeof live.current>) => {
    live.current = { ...live.current, ...patch };
    if (patch.route !== undefined) setRoute(patch.route);
    if (patch.stepIndex !== undefined) setStepIndex(patch.stepIndex);
    if (patch.status !== undefined) setStatus(patch.status);
  }, []);

  const enter = useCallback(
    (r: ApiRoute, i: number) => {
      off.current = OFF_ROUTE_RESET;
      set({ route: r, stepIndex: i, status: "guiding" });
      cb.current.onStep?.(r.steps[i], i);
    },
    [set],
  );

  const arrive = useCallback(() => {
    set({ status: "arrived" });
    if (live.current.route) cb.current.onArrive?.(live.current.route);
  }, [set]);

  const step = route?.steps[stepIndex] ?? null;
  const target = step?.kind === "walk" ? step.heading_deg : null;
  const delta = heading !== null && target !== null ? angleDelta(heading, target) : null;

  // Compass. Runs while guiding; `?heading=120` in the URL fixes the heading for desktop testing (see start()).
  useEffect(() => {
    if (status === "idle" || status === "arrived" || status === "awaiting_map" || fixedHeading.current !== null) return;
    const samples: number[] = [];
    let last = 0;
    const onOrient = (e: Event) => {
      const h = headingFromEvent(e as CompassEvent);
      if (h === null) return;
      samples.push(h);
      if (samples.length > SMOOTHING) samples.shift();
      const now = Date.now();
      if (now - last < RENDER_MS) return;
      last = now;
      setHeading(circularMean(samples));
    };
    window.addEventListener("deviceorientationabsolute", onOrient);
    window.addEventListener("deviceorientation", onOrient);
    return () => {
      window.removeEventListener("deviceorientationabsolute", onOrient);
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [status]);

  // Off-route: only while guiding a walk step, and only after the user has faced the target once.
  // Ticks every second, so a phone held still facing away still trips the 5 s timer.
  const deltaRef = useRef(delta);
  useEffect(() => {
    deltaRef.current = delta;
  });
  const isWalk = step?.kind === "walk";
  useEffect(() => {
    if (status !== "guiding" || !isWalk) return;
    const check = () => {
      off.current = trackOffRoute(off.current, deltaRef.current, Date.now());
      if (off.current.off && live.current.status === "guiding") {
        set({ status: "offroute" });
        cb.current.onOffRoute?.();
      }
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [status, isWalk, stepIndex, set]);

  /** Load a route (e.g. after search). Guidance waits for start(). */
  const load = useCallback(
    (r: ApiRoute | null) => {
      off.current = OFF_ROUTE_RESET;
      set({ route: r, stepIndex: 0, status: "idle" });
    },
    [set],
  );

  /** Jump to any step (demo shortcuts, re-entering guidance after a sign check). Fires onStep like next(). */
  const goTo = useCallback(
    (index: number) => {
      const r = live.current.route;
      if (!r || index < 0 || index >= r.steps.length) return;
      enter(r, index);
    },
    [enter],
  );

  /** Call from a tap handler: iOS only grants compass access inside a user gesture. */
  const start = useCallback(async () => {
    const r = live.current.route;
    if (!r) return;
    if (routeSummary(r).alreadyThere) {
      arrive();
      return;
    }
    if (r.steps.length === 0) return;
    const fixed = new URLSearchParams(window.location.search).get("heading");
    fixedHeading.current = fixed === null ? null : Number(fixed);
    if (fixedHeading.current !== null) setHeading(fixedHeading.current);
    enter(r, 0); // first, so the first spoken step still counts as the user gesture
    const IOS = DeviceOrientationEvent as IOSOrientation;
    if (typeof IOS?.requestPermission === "function") {
      try {
        await IOS.requestPermission();
      } catch {
        // denied or unsupported: heading stays null, dir = "unstable", guidance continues by voice
      }
    }
  }, [arrive, enter]);

  /**
   * "지금 이 방향이 맞아요": the user faces along the current walk step's corridor, so the raw compass
   * reading there is that step's map heading. Returns false when there's no reading or no target.
   */
  const calibrate = useCallback((): boolean => {
    const st = live.current.route?.steps[live.current.stepIndex];
    const t = st?.kind === "walk" ? st.heading_deg : null;
    if (rawHeading === null || t === null || t === undefined) return false;
    const next = offsetFor(rawHeading, t);
    setOffset(next);
    try {
      window.localStorage.setItem(NORTH_KEY, String(next));
    } catch {} // private mode: still applies for this visit
    return true;
  }, [rawHeading]);

  const resetCalibration = useCallback(() => {
    setOffset(null);
    try {
      window.localStorage.removeItem(NORTH_KEY);
    } catch {}
  }, []);

  const completeStep = useCallback((mapConfirmed = false) => {
    const { route: r, stepIndex: i, status: current } = live.current;
    if (!r || !r.steps[i] || current === "arrived" || current === "idle") return;
    if (current === "awaiting_map" && !mapConfirmed) return;
    const step = r.steps[i];
    const action = stepCompletion(step.kind, i + 1 >= r.steps.length, mapConfirmed);
    if (action === "floorMap" && step.kind !== "walk") {
      set({ status: "awaiting_map" });
      cb.current.onFloorArrival?.(step, i);
    } else if (action === "arrive") arrive();
    else enter(r, i + 1);
  }, [arrive, enter, set]);

  /** Manual and checkpoint completion both pause at floor changes. */
  const next = useCallback(() => completeStep(), [completeStep]);
  const continueAfterFloorMap = useCallback(() => {
    if (live.current.status === "awaiting_map") completeStep(true);
  }, [completeStep]);

  /** Back to guiding after an off-route warning the user dismissed. */
  const resume = useCallback(() => {
    off.current = OFF_ROUTE_RESET;
    if (live.current.status === "offroute") set({ status: "guiding" });
  }, [set]);

  /**
   * Sends a camera frame for the current step's end node.
   * matched -> next step, mismatch -> new route from where the camera is, unknown -> nothing changes (ask for another photo).
   */
  const confirmCheckpoint = useCallback(
    async (image: Blob): Promise<ApiCheckpointResult> => {
      const { route: r, stepIndex: i, status: before } = live.current;
      if (!r) throw new Error("경로가 없어요");
      set({ status: "checking" });
      try {
        const res = await postCheckpoint(image, r.steps[i].to);
        if (res.status === "matched") {
          next();
        } else if (res.status === "mismatch" && res.node) {
          if (res.node.id === r.arrived.node) {
            arrive();
          } else {
            const fresh = await fetchRoute(res.node.id, r.arrived.node);
            enter(fresh, 0);
            cb.current.onReroute?.(fresh);
          }
        } else {
          set({ status: before });
        }
        return res;
      } catch (err) {
        set({ status: before });
        throw err;
      }
    },
    [arrive, enter, next, set],
  );

  return {
    route,
    step,
    stepIndex,
    status,
    /** Smoothed compass heading after the north calibration, 0 = the map's up. null until the first reading. */
    heading,
    /** Whether this device has a saved north calibration for the building. */
    calibrated: offset !== null,
    calibrate,
    resetCalibration,
    /** Target heading for this step (walk steps only). */
    target,
    /** Signed turn from heading to target, positive = turn right. */
    delta,
    /** Drop-in for AppState.dir: aligned / near / far, "unstable" without compass or target. */
    dir: dirState(delta),
    load,
    start,
    next,
    continueAfterFloorMap,
    goTo,
    resume,
    confirmCheckpoint,
  };
}
