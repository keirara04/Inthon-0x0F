"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ApiRoute } from "@/types/api";
import { fetchRoute, toRouteStep } from "./api";
import { DIRECTION, PATTERNS, ROOMS, START_NODE_IDS, scanMeta } from "./data";
import { useDemoTools } from "./demo";
import { cancelSpeech, speak, stopVibration, supportsVibration, vibrate } from "./feedback";
import { useNavigation } from "./useNavigation";
import type {
  DirectionState,
  GuideMode,
  GuideStep,
  HapticPattern,
  OffrouteState,
  Room,
  RoomCategory,
  RouteStep,
  ScanOutcome,
  ScanState,
  ScanTarget,
  Screen,
  StartNodeId,
} from "./types";

export interface AppState {
  screen: Screen;
  // start / location
  mapDemo: boolean;
  start: StartNodeId | null;
  locEdit: boolean;
  landmarks: boolean;
  // search
  query: string;
  cat: RoomCategory | null;
  floorPick: number | null;
  dest: Room | null;
  // guidance
  mode: GuideMode;
  vibe: boolean;
  voice: boolean;
  view: "2d" | "3d";
  dir: DirectionState;
  step: GuideStep;
  routeOpen: boolean;
  // route from POST /api/route
  route: ApiRoute | null;
  steps: RouteStep[];
  routeLoading: boolean;
  /** ?demo 방향 시뮬레이션 값. null이면 나침반(nav.dir)을 씁니다. */
  simDir: DirectionState | null;
  // checkpoint scan
  scanTarget: ScanTarget;
  scanFrom: Screen;
  scanState: ScanState;
  outcome: ScanOutcome;
  manual: boolean;
  // off-route
  offState: OffrouteState;
  offFloor: string;
  offSign: string;
  // phone posture: lowered = vibration guidance, raised = camera reads signs
  raised: boolean;
  postureSensor: boolean;
  // trip stats for the arrival summary
  trip: { startedAt: number | null; arrivedAt: number | null; reroutes: number };
  // demo-panel fallback simulations
  simNoVibe: boolean;
  camDenied: boolean;
  elevUnverified: boolean;
  // overlays
  sheet: boolean;
  toast: string | null;
  cue: string | null;
}

const INITIAL: AppState = {
  screen: "welcome",
  mapDemo: false,
  start: "here",
  locEdit: false,
  landmarks: false,
  query: "",
  cat: null,
  floorPick: null,
  dest: null,
  mode: "both",
  vibe: true,
  voice: true,
  view: "2d",
  dir: "far",
  step: 0,
  routeOpen: false,
  route: null,
  steps: [],
  routeLoading: false,
  simDir: null,
  scanTarget: "map",
  scanFrom: "elevator",
  scanState: "aim",
  outcome: "success",
  manual: false,
  offState: "alert",
  offFloor: "4층",
  offSign: "",
  raised: false,
  postureSensor: false,
  trip: { startedAt: null, arrivedAt: null, reroutes: 0 },
  simNoVibe: false,
  camDenied: false,
  elevUnverified: false,
  sheet: false,
  toast: null,
  cue: null,
};

const BACK: Partial<Record<Screen, Screen>> = {
  building: "welcome",
  captureIntro: "building",
  mapResult: "captureIntro",
  start: "mapResult",
  search: "start",
  preview: "search",
  mode: "preview",
  editor: "welcome",
  arrive: "welcome",
};

function useGilgyeolController(scrollRef: RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<AppState>(INITIAL);
  // Mirror of the latest state so chained actions and timers never read stale values.
  const ref = useRef(state);
  const timers = useRef<Record<"cue" | "toast" | "scan", ReturnType<typeof setTimeout> | undefined>>({ cue: undefined, toast: undefined, scan: undefined });

  const update = useCallback((patch: Partial<AppState>) => {
    ref.current = { ...ref.current, ...patch };
    setState(ref.current);
  }, []);

  const go = useCallback(
    (screen: Screen, patch: Partial<AppState> = {}) => {
      update({ ...patch, screen });
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [update, scrollRef],
  );

  const canVibe = useCallback(() => !ref.current.simNoVibe && supportsVibration(), []);
  const destName = useCallback(() => (ref.current.dest ?? ROOMS[0]).name, []);
  const ensureDest = useCallback(() => ref.current.dest ?? ROOMS[0], []);

  const showCue = useCallback(
    (label: string) => {
      update({ cue: label });
      clearTimeout(timers.current.cue);
      timers.current.cue = setTimeout(() => update({ cue: null }), 2200);
    },
    [update],
  );

  const cue = useCallback(
    (key: HapticPattern) => {
      if (!ref.current.vibe) return;
      const p = PATTERNS[key];
      if (canVibe() && vibrate(p.p)) showCue(`진동 · ${p.label}`);
      else showCue("진동 미지원 · 음성·화면으로 안내");
    },
    [canVibe, showCue],
  );

  const say = useCallback((text: string) => {
    if (ref.current.voice) speak(text);
  }, []);

  const toast = useCallback(
    (text: string) => {
      update({ toast: text });
      clearTimeout(timers.current.toast);
      timers.current.toast = setTimeout(() => update({ toast: null }), 2800);
    },
    [update],
  );

  const arrive = useCallback(
    () => {
      go("arrive", { trip: { ...ref.current.trip, arrivedAt: Date.now() } });
      cue("arrive");
      say(`우정정보관 ${ref.current.route?.arrived.label ?? destName()}에 도착했어요`);
    },
    [go, cue, say, destName],
  );

  const toOffroute = useCallback(() => {
    go("offroute", { offState: "alert", trip: { ...ref.current.trip, reroutes: ref.current.trip.reroutes + 1 } });
    cue("off");
    say("경로와 다른 쪽인 것 같아요. 멈춰서 주변 표지를 비춰주세요");
  }, [go, cue, say]);

  // Sensor engine: route/step/heading/off-route/checkpoint live here. Screens stay in the store below.
  const demo = useDemoTools();
  const nav = useNavigation({
    onStep: (apiStep, index) => {
      const st = toRouteStep(apiStep);
      const dir = ref.current.simDir ?? "far";
      if (apiStep.kind === "walk") {
        go("guide", { step: index, dir, routeOpen: false });
        if (st.turn.startsWith("좌회전")) cue("left");
        else if (st.turn.startsWith("우회전")) cue("right");
        say(`${st.title}. ${st.sub}`);
      } else {
        go("elevator", { step: index, dir, routeOpen: false });
        cue("floor");
        say(st.title);
      }
    },
    onOffRoute: () => toOffroute(),
    onArrive: () => arrive(),
    onReroute: (r) => {
      update({ route: r, steps: r.steps.map(toRouteStep), step: 0, dir: ref.current.simDir ?? "far" });
    },
  });
  const { dir: navDir, load: navLoad, start: navStart, next: navNext, goTo: navGoTo, resume: navResume, confirmCheckpoint: navConfirm } = nav;

  /** "무시하고 계속": clear the engine's off-route state and go back to the current step. */
  const dismissOffroute = useCallback(() => {
    navResume();
    const s = ref.current;
    const st = s.steps[s.step];
    go(st && st.kind && st.kind !== "walk" ? "elevator" : "guide");
    say("계속 안내할게요");
  }, [navResume, go, say]);

  // The compass drives `dir`; ?demo can still override it from the presenter panel.
  useEffect(() => {
    const next = state.simDir ?? (demo ? "far" : navDir);
    if (next !== state.dir) update({ dir: next });
  }, [demo, navDir, state.simDir, state.dir, update]);

  const startGuide = useCallback(
    (step: GuideStep) => {
      // With a loaded route the engine owns the step (and emits onStep); this is only a demo fallback.
      if (ref.current.route) {
        navGoTo(step);
        return;
      }
      const st = ref.current.steps[step];
      if (!st) return;
      const dir = ref.current.simDir ?? "far";
      go(st.kind && st.kind !== "walk" ? "elevator" : "guide", { step, dir, routeOpen: false });
      if (st.turn.startsWith("좌회전")) cue("left");
      else if (st.turn.startsWith("우회전")) cue("right");
      say(`${st.title}. ${st.sub}`);
    },
    [navGoTo, go, cue, say],
  );

  const setDir = useCallback(
    (dir: DirectionState) => {
      update({ dir, simDir: dir });
      const st = ref.current.steps[ref.current.step];
      say(dir === "unstable" ? `방향을 확인하기 어려워요. ${st?.landmark || "표지판"}를 기준으로 이동해 주세요` : DIRECTION[dir].msg);
    },
    [update, say],
  );

  const toElevator = useCallback(() => {
    const s = ref.current;
    if (!s.route) return;
    const idx = s.route.steps.findIndex((st, i) => i >= s.step && st.kind !== "walk");
    if (idx >= 0) navGoTo(idx);
  }, [navGoTo]);

  const openScan = useCallback(
    (target: ScanTarget) => {
      clearTimeout(timers.current.scan);
      const from = ref.current.screen;
      const denied = ref.current.camDenied;
      go("scan", {
        scanTarget: target,
        scanFrom: from === "scan" ? ref.current.scanFrom : from,
        scanState: denied ? "denied" : "aim",
        outcome: "success",
        manual: false,
        dest: ensureDest(),
      });
      if (!denied) say(scanMeta(target, destName()).guide);
    },
    [go, ensureDest, destName, say],
  );

  /**
   * Checkpoint scan. With a camera frame the engine sends it to POST /api/checkpoint and owns the result;
   * without one (demo panel, map flow, desktop without a camera) the old simulated outcome is used.
   */
  const runScan = useCallback(
    async (frame?: Blob) => {
      update({ scanState: "analyzing", manual: false });
      if (frame) {
        try {
          const res = await navConfirm(frame);
          if (res.status === "matched") cue("confirm");
          else if (res.status === "mismatch") toast("예상한 표지와 달라요 · 지금 위치에서 경로를 다시 계산했어요");
          else say("표지를 읽지 못했어요. 더 가까이 비춰주세요");
          // matched/mismatch made the engine change step or route, which already moved the screen.
          // Staying on the scanner means the result was unusable, so show it and let the user retry.
          if (ref.current.screen === "scan") {
            update({ scanState: res.status === "matched" ? "success" : res.status === "mismatch" ? "mismatch" : "fail" });
          }
        } catch (e) {
          toast(e instanceof Error ? e.message : "표지를 확인하지 못했어요");
          if (ref.current.screen === "scan") update({ scanState: "fail" });
        }
        return;
      }
      clearTimeout(timers.current.scan);
      timers.current.scan = setTimeout(() => {
        const o = ref.current.outcome;
        update({ scanState: o });
        if (o === "success" && ref.current.scanTarget !== "map") cue("confirm");
        const m = scanMeta(ref.current.scanTarget, destName());
        say(o === "success" ? m.ok : o === "mismatch" ? "예상한 표지와 달라요" : "표지를 읽지 못했어요. 더 가까이 비춰주세요");
      }, 1300);
    },
    [update, navConfirm, cue, say, toast, destName],
  );

  const cancelScan = useCallback(() => {
    clearTimeout(timers.current.scan);
    update({ scanState: "aim" });
  }, [update]);

  /** Walk-step CTA: the engine moves to the next step, the elevator screen, or arrival. */
  const advance = useCallback(() => {
    if (ref.current.route) {
      navNext();
      return;
    }
    const s = ref.current;
    if (s.step + 1 >= s.steps.length) arrive();
    else startGuide(s.step + 1);
  }, [navNext, arrive, startGuide]);

  const leaveElevator = useCallback(() => {
    advance();
  }, [advance]);

  const scanNext = useCallback(
    (manual: boolean) => {
      const t = ref.current.scanTarget;
      if (t === "map") go("mapResult", { mapDemo: false });
      else go("offroute", { offState: "confirm", offFloor: "4층", offSign: manual ? "직접 선택" : "4층 동측 복도 표지" });
    },
    [go],
  );

  const beginTrip = useCallback(() => {
    update({ trip: { startedAt: Date.now(), arrivedAt: null, reroutes: 0 }, simDir: null });
    // Must run inside the tap handler so iOS grants compass access.
    if (ref.current.route) navStart();
    else toast("경로를 먼저 선택해 주세요");
  }, [update, navStart, toast]);

  // Raising the phone opens the camera on the next checkpoint; lowering it returns to vibration guidance.
  const setRaised = useCallback(
    (raised: boolean) => {
      const s = ref.current;
      // With the sensor off, the demo button may "raise" repeatedly.
      if (s.raised === raised && s.postureSensor) return;
      update({ raised });
      if (raised) {
        // Only off-route recovery needs the camera during guidance.
        if (s.screen === "offroute" && s.offState === "alert") openScan("sign");
      } else if (s.screen === "scan" && s.scanTarget !== "map" && (s.scanState === "aim" || s.scanState === "denied")) {
        clearTimeout(timers.current.scan);
        go(s.scanFrom === "scan" ? "guide" : s.scanFrom);
      }
    },
    [update, openScan, go],
  );

  const enablePosture = useCallback(async () => {
    if (ref.current.postureSensor) {
      update({ postureSensor: false, raised: false });
      return;
    }
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
      toast("이 기기에서는 자세 감지를 쓸 수 없어요. 화면 버튼으로 표지를 확인해 주세요");
      return;
    }
    // iOS requires an explicit permission prompt triggered by a tap.
    const Orientation = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<"granted" | "denied"> };
    if (typeof Orientation.requestPermission === "function") {
      try {
        if ((await Orientation.requestPermission()) !== "granted") {
          toast("움직임 센서 권한이 거부됐어요. 화면 버튼으로 표지를 확인해 주세요");
          return;
        }
      } catch {
        toast("움직임 센서 권한을 요청하지 못했어요");
        return;
      }
    }
    update({ postureSensor: true });
  }, [update, toast]);

  const pickDest = useCallback(
    async (room: Room) => {
      if (!room.routeReady) {
        toast("이 장소까지의 검수된 경로가 아직 없어요");
        return;
      }
      if (ref.current.routeLoading) return;
      update({ routeLoading: true });
      try {
        const route = await fetchRoute(START_NODE_IDS[ref.current.start ?? "here"], room.id);
        navLoad(route);
        update({ route, steps: route.steps.map(toRouteStep), routeLoading: false });
        go("preview", { dest: room, step: 0, dir: "far" });
      } catch (e) {
        update({ routeLoading: false });
        toast(e instanceof Error ? e.message : "경로를 찾을 수 없어요");
      }
    },
    [go, toast, update, navLoad],
  );

  const stopGuidance = useCallback(() => {
    cancelSpeech();
    stopVibration();
  }, []);

  const endGuide = useCallback(() => {
    stopGuidance();
    navLoad(null);
    go("welcome", { step: 0, dir: "far", start: "here", route: null, steps: [], routeLoading: false, simDir: null });
  }, [go, stopGuidance, navLoad]);

  const back = useCallback(() => {
    const s = ref.current;
    if (s.screen === "scan") {
      clearTimeout(timers.current.scan);
      go(s.scanFrom === "scan" ? "welcome" : s.scanFrom);
      return;
    }
    if (s.screen === "offroute") {
      startGuide(s.step);
      return;
    }
    if (s.screen === "guide" || s.screen === "elevator") stopGuidance();
    if (s.screen === "guide") {
      if (s.step === 0) {
        go("mode");
        return;
      }
      const prev = s.steps[s.step - 1];
      if (prev && prev.kind !== "walk") go("elevator", { step: s.step - 1 });
      else startGuide(s.step - 1);
      return;
    }
    if (s.screen === "elevator") {
      startGuide(Math.max(0, s.step - 1));
      return;
    }
    go(BACK[s.screen] ?? "welcome");
  }, [go, startGuide, stopGuidance]);

  const setMode = useCallback(
    (mode: GuideMode) => {
      const m = { both: { vibe: true, voice: true }, voice: { vibe: false, voice: true }, screen: { vibe: false, voice: false } }[mode];
      if (!m.voice) cancelSpeech();
      update({ mode, ...m });
    },
    [update],
  );

  const replay = useCallback(() => {
    const s = ref.current;
    if (s.screen === "arrive") {
      cue("arrive");
      say(`우정정보관 ${s.route?.arrived.label ?? destName()}에 도착했어요`);
    } else if (s.screen === "elevator") {
      const st = s.steps[s.step];
      if (st) {
        cue("floor");
        say(st.title);
      }
    } else {
      const st = s.steps[s.step];
      if (st) say(`${st.title}. ${st.sub}`);
    }
  }, [cue, say, destName]);

  const testVibe = useCallback(() => {
    const ok = canVibe() && vibrate([90, 70, 90]);
    showCue(ok ? "진동 · 짧게 2회 테스트" : "진동 미지원 · 음성·화면으로 안내");
  }, [canVibe, showCue]);

  const playPattern = useCallback(
    (key: HapticPattern) => {
      if (!ref.current.vibe) {
        toast("진동 안내가 꺼져 있어요");
        return;
      }
      cue(key);
      say(PATTERNS[key].name);
    },
    [cue, say, toast],
  );

  const toggleVoice = useCallback(() => {
    if (ref.current.voice) cancelSpeech();
    update({ voice: !ref.current.voice });
  }, [update]);

  // Posture sensor: phone tilted upright (beta > 60°) counts as raised; below 35° as lowered.
  useEffect(() => {
    if (!state.postureSensor) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null) return;
      const tilt = Math.abs(e.beta);
      if (tilt > 60) setRaised(true);
      else if (tilt < 35) setRaised(false);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [state.postureSensor, setRaised]);

  // Direction pulse: the closer to the target heading, the shorter the interval.
  useEffect(() => {
    if (state.screen !== "guide" || state.dir === "unstable" || !state.vibe || state.simNoVibe || !supportsVibration()) return;
    const dir = state.dir;
    const id = setInterval(() => vibrate(dir === "aligned" ? 70 : 35), DIRECTION[dir].period * 1000);
    return () => clearInterval(id);
  }, [state.screen, state.dir, state.vibe, state.simNoVibe]);

  // Hardware/browser back maps to in-app back instead of leaving the app.
  useEffect(() => {
    history.pushState({ gilgyeol: true }, "");
    const onPop = () => {
      if (ref.current.screen === "welcome") {
        history.back();
        return;
      }
      if (ref.current.sheet) update({ sheet: false });
      else back();
      history.pushState({ gilgyeol: true }, "");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [back, update]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.cue);
      clearTimeout(t.toast);
      clearTimeout(t.scan);
      cancelSpeech();
    };
  }, []);

  const actions = useMemo(
    () => ({
      update,
      go,
      back,
      toast,
      canVibe,
      startGuide,
      setDir,
      toElevator,
      advance,
      leaveElevator,
      openScan,
      runScan,
      cancelScan,
      scanNext,
      arrive,
      toOffroute,
      dismissOffroute,
      pickDest,
      endGuide,
      setMode,
      replay,
      testVibe,
      playPattern,
      toggleVoice,
      ensureDest,
      beginTrip,
      setRaised,
      enablePosture,
    }),
    [update, go, back, toast, canVibe, startGuide, setDir, toElevator, advance, leaveElevator, openScan, runScan, cancelScan, scanNext, arrive, toOffroute, dismissOffroute, pickDest, endGuide, setMode, replay, testVibe, playPattern, toggleVoice, ensureDest, beginTrip, setRaised, enablePosture],
  );

  return { state, actions };
}

type Controller = ReturnType<typeof useGilgyeolController> & { scrollRef: RefObject<HTMLDivElement | null> };

const Ctx = createContext<Controller | null>(null);

export function GilgyeolProvider({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ctl = useGilgyeolController(scrollRef);
  const value = useMemo(() => ({ ...ctl, scrollRef }), [ctl]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGilgyeol() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGilgyeol must be used inside <GilgyeolProvider>");
  return ctx;
}

export function useDestName() {
  const { state } = useGilgyeol();
  return (state.dest ?? ROOMS[0]).name;
}
