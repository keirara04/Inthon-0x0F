"use client";

// Navigation engine: compass -> direction state, step progress, off-route detection, checkpoints, re-routing.
// It does not vibrate or speak by itself: the store already pulses from `dir` and owns cue()/say(),
// so wire those into the callbacks instead (onStep, onOffRoute, onArrive, onReroute).
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiCheckpointResult, ApiRoute, ApiStep } from "@/types/api";
import { fetchRoute, postCheckpoint } from "./api";
import { circularMean, delta as angleDelta, dirState, headingFromEvent, OFF_ROUTE_RESET, trackOffRoute } from "./navMath";

export type NavStatus = "idle" | "guiding" | "checking" | "offroute" | "arrived";

export interface NavCallbacks {
  /** New step started (also the first one in start()). Speak step.text, play the turn/floor pattern. */
  onStep?: (step: ApiStep, index: number) => void;
  /** Facing away from the route for 5 s. Play the "off" pattern, offer a sign scan. */
  onOffRoute?: () => void;
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
  const [heading, setHeading] = useState<number | null>(null);

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
    if (status === "idle" || status === "arrived" || fixedHeading.current !== null) return;
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

  /** Call from a tap handler: iOS only grants compass access inside a user gesture. */
  const start = useCallback(async () => {
    const r = live.current.route;
    if (!r || r.steps.length === 0) return;
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
  }, [enter]);

  /** Advance manually (steps with checkpoint === null have nothing to scan). */
  const next = useCallback(() => {
    const { route: r, stepIndex: i } = live.current;
    if (!r) return;
    if (i + 1 >= r.steps.length) arrive();
    else enter(r, i + 1);
  }, [arrive, enter]);

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
    /** Smoothed compass heading, 0 = north. null until the first reading (or no compass). */
    heading,
    /** Target heading for this step (walk steps only). */
    target,
    /** Signed turn from heading to target, positive = turn right. */
    delta,
    /** Drop-in for AppState.dir: aligned / near / far, "unstable" without compass or target. */
    dir: dirState(delta),
    load,
    start,
    next,
    resume,
    confirmCheckpoint,
  };
}
