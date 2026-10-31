"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { DEST_FLOOR, DIRECTION, PATTERNS, ROOMS, routeSteps, scanMeta } from "./data";
import { cancelSpeech, speak, stopVibration, supportsVibration, vibrate } from "./feedback";
import type {
  DirectionState,
  GuideMode,
  GuideStep,
  HapticPattern,
  OffrouteState,
  Room,
  RoomCategory,
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
  arrivedManual: boolean;
  // phone posture: lowered = vibration guidance, raised = camera reads signs
  raised: boolean;
  postureSensor: boolean;
  // trip stats for the arrival summary
  trip: { startedAt: number | null; arrivedAt: number | null; checkpoints: number; reroutes: number };
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
  scanTarget: "floor4",
  scanFrom: "elevator",
  scanState: "aim",
  outcome: "success",
  manual: false,
  offState: "alert",
  offFloor: "4층",
  offSign: "",
  arrivedManual: false,
  raised: false,
  postureSensor: false,
  trip: { startedAt: null, arrivedAt: null, checkpoints: 0, reroutes: 0 },
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

  const startGuide = useCallback(
    (step: GuideStep) => {
      const dest = ensureDest();
      go("guide", { step, dir: "far", routeOpen: false, dest });
      const st = routeSteps(dest.name, ref.current.elevUnverified)[step];
      if (step === 1) cue("left");
      say(`${st.title}. ${st.sub}`);
    },
    [go, ensureDest, cue, say],
  );

  const setDir = useCallback(
    (dir: DirectionState) => {
      update({ dir });
      const st = routeSteps(destName(), ref.current.elevUnverified)[ref.current.step];
      say(dir === "unstable" ? `방향을 확인하기 어려워요. ${st.landmark}를 기준으로 이동해 주세요` : DIRECTION[dir].msg);
    },
    [update, destName, say],
  );

  const toElevator = useCallback(() => {
    go("elevator", { dest: ensureDest() });
    cue("floor");
    say(
      ref.current.elevUnverified
        ? "4층으로 이동하세요. 이 엘리베이터의 정차 층은 확인 중이에요. 엘리베이터 안 층 버튼을 확인해 주세요"
        : "4층으로 이동하세요. 중앙 엘리베이터 A는 4층에 정차합니다",
    );
  }, [go, ensureDest, cue, say]);

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

  const runScan = useCallback(() => {
    update({ scanState: "analyzing", manual: false });
    clearTimeout(timers.current.scan);
    timers.current.scan = setTimeout(() => {
      const o = ref.current.outcome;
      update({ scanState: o });
      if (o === "success" && ref.current.scanTarget !== "map") cue("confirm");
      const m = scanMeta(ref.current.scanTarget, destName());
      say(o === "success" ? m.ok : o === "mismatch" ? "예상한 표지와 달라요" : "표지를 읽지 못했어요. 더 가까이 비춰주세요");
    }, 1300);
  }, [update, destName, say, cue]);

  const cancelScan = useCallback(() => {
    clearTimeout(timers.current.scan);
    update({ scanState: "aim" });
  }, [update]);

  const arrive = useCallback(
    (manual: boolean) => {
      go("arrive", { arrivedManual: manual, trip: { ...ref.current.trip, arrivedAt: Date.now() } });
      cue("arrive");
      say(`우정정보관 ${destName()}에 도착했어요`);
    },
    [go, cue, say, destName],
  );

  const toOffroute = useCallback(() => {
    go("offroute", { offState: "alert", trip: { ...ref.current.trip, reroutes: ref.current.trip.reroutes + 1 } });
    cue("off");
    say("경로와 다른 쪽인 것 같아요. 멈춰서 주변 표지를 비춰주세요");
  }, [go, cue, say]);

  const scanNext = useCallback(
    (manual: boolean) => {
      const t = ref.current.scanTarget;
      if (t !== "map") update({ trip: { ...ref.current.trip, checkpoints: ref.current.trip.checkpoints + 1 } });
      if (t === "map") go("mapResult", { mapDemo: false });
      else if (t === "floor4") startGuide(1);
      else if (t === "sign") go("offroute", { offState: "confirm", offFloor: "4층", offSign: manual ? "직접 선택" : "4층 동측 복도 표지" });
      else arrive(manual);
    },
    [go, update, startGuide, arrive],
  );

  const beginTrip = useCallback(() => {
    update({ trip: { startedAt: Date.now(), arrivedAt: null, checkpoints: 0, reroutes: 0 } });
    startGuide(0);
  }, [update, startGuide]);

  // Raising the phone opens the camera on the next checkpoint; lowering it returns to vibration guidance.
  const setRaised = useCallback(
    (raised: boolean) => {
      const s = ref.current;
      // With the sensor off, the demo button may "raise" repeatedly.
      if (s.raised === raised && s.postureSensor) return;
      update({ raised });
      if (raised) {
        if (s.screen === "guide" && s.step === 0) toast("엘리베이터 홀에 도착하면 폰을 들어 표지를 비춰주세요");
        else if (s.screen === "guide") openScan("door");
        else if (s.screen === "elevator") openScan("floor4");
        else if (s.screen === "offroute" && s.offState === "alert") openScan("sign");
      } else if (s.screen === "scan" && s.scanTarget !== "map" && (s.scanState === "aim" || s.scanState === "denied")) {
        clearTimeout(timers.current.scan);
        go(s.scanFrom === "scan" ? "guide" : s.scanFrom);
      }
    },
    [update, toast, openScan, go],
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
    (room: Room) => {
      if (room.floor !== DEST_FLOOR || !room.routeReady) {
        toast("시연 경로는 4층 호실만 준비돼 있어요");
        return;
      }
      go("preview", { dest: room });
    },
    [go, toast],
  );

  const stopGuidance = useCallback(() => {
    cancelSpeech();
    stopVibration();
  }, []);

  const endGuide = useCallback(() => {
    stopGuidance();
    go("welcome", { step: 0, dir: "far", start: "here" });
  }, [go, stopGuidance]);

  const back = useCallback(() => {
    const s = ref.current;
    if (s.screen === "scan") {
      clearTimeout(timers.current.scan);
      go(s.scanFrom === "scan" ? "welcome" : s.scanFrom);
      return;
    }
    if (s.screen === "offroute") {
      go("guide", { step: 1 });
      return;
    }
    if (s.screen === "guide" || s.screen === "elevator") stopGuidance();
    if (s.screen === "guide") {
      go(s.step === 0 ? "mode" : "elevator");
      return;
    }
    if (s.screen === "elevator") {
      startGuide(0);
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
      say(`우정정보관 ${destName()}에 도착했어요`);
    } else if (s.screen === "elevator") toElevator();
    else {
      const st = routeSteps(destName(), s.elevUnverified)[s.step];
      say(`${st.title}. ${st.sub}`);
    }
  }, [cue, say, destName, toElevator]);

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
      openScan,
      runScan,
      cancelScan,
      scanNext,
      arrive,
      toOffroute,
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
    [update, go, back, toast, canVibe, startGuide, setDir, toElevator, openScan, runScan, cancelScan, scanNext, arrive, toOffroute, pickDest, endGuide, setMode, replay, testVibe, playPattern, toggleVoice, ensureDest, beginTrip, setRaised, enablePosture],
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
