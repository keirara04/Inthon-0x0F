"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { ApiRoute } from "@/types/api";
import { ApiError, fetchRoute, fetchSavedMap, floorNumber, parseEvacMap, toRouteStep, type ParsedGraph, type Place } from "./api";
import { BUILDING, DIRECTION, PATTERNS, ROOMS, START_NODE_IDS, scanMeta } from "./data";
import { useDemoTools } from "./demo";
import { beep, beepPan, cancelSpeech, iosHaptic, koreanVoiceReady, speak, stopVibration, supportsVibration, unlockAudio, vibrate } from "./feedback";
import { floorName, canUseFloorMap } from "./floorTransition";
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
  /** Guided 3-minute trial: the overlay walks through the real screens until the route preview. */
  trialOn: boolean;
  // start / location
  mapDemo: boolean;
  /** Destination floor awaiting a fresh plan; the active route stays paused. */
  floorMapTarget: string | null;
  /** Building the evac maps are saved under and loaded from. */
  place: Place;
  /** AI draft of the photographed evacuation map. Shown on the map result; routing still uses the verified graph. */
  parsed: ParsedGraph | null;
  /** The photo `parsed` was read from (object URL + pixel size), drawn under the graph. */
  parsedPhoto: { url: string; w: number; h: number } | null;
  /** A photo picked on another screen, handed to the scanner to find the sign in it before reading. */
  pendingPhoto: Blob | null;
  start: StartNodeId | null;
  /** Real start node from a sign scan or the entrance list; overrides START_NODE_IDS[start] when set. */
  startAt: { id: string; label: string; floor: string; via: "scan" | "list" | "pin" } | null;
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
  /** Stereo beep from the side to turn to (iPhone has no vibration). */
  beep: boolean;
  /** Korean TTS voice found on this device: true / false (notice shown, speech still tried) / null (unknown yet). */
  koVoice: boolean | null;
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
  screen: "landing",
  trialOn: false,
  mapDemo: false,
  floorMapTarget: null,
  place: { id: null, name: BUILDING, coords: null },
  parsed: null,
  parsedPhoto: null,
  pendingPhoto: null,
  start: "here",
  startAt: null,
  locEdit: false,
  landmarks: false,
  query: "",
  cat: null,
  floorPick: null,
  dest: null,
  mode: "both",
  vibe: true,
  voice: true,
  beep: true,
  koVoice: null,
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
  trial: "landing",
  building: "welcome",
  captureIntro: "welcome", // building screen is skipped while there is only one building
  invalidMap: "captureIntro",
  mapResult: "captureIntro",
  start: "mapResult",
  search: "start",
  preview: "search",
  mode: "preview",
  editor: "welcome",
  arrive: "welcome",
};

/** Start choice for what the evacuation map marked as "현위치"; null (user picks) when the AI found none. */
function startFromParsed(g: ParsedGraph): StartNodeId | null {
  const cur = g.nodes.find((n) => n.id === g.current_node_id);
  if (!cur) return null;
  return cur.type === "elevator_hall" ? "hall" : cur.type === "stairs" ? "stair" : cur.type === "entrance" ? "main" : "here";
}

function useGilgyeolController(scrollRef: RefObject<HTMLDivElement | null>) {
  const [state, setState] = useState<AppState>(INITIAL);
  // Mirror of the latest state so chained actions and timers never read stale values.
  const ref = useRef(state);
  const timers = useRef<Record<"cue" | "toast" | "scan", ReturnType<typeof setTimeout> | undefined>>({ cue: undefined, toast: undefined, scan: undefined });
  /** In-flight evacuation-map parse; cleared when it finishes or the user cancels. */
  const parseCtl = useRef<AbortController | null>(null);

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

  /** The "no vibration" notice covers the header, so show it only once per session. */
  const noVibeNotified = useRef(false);

  const cue = useCallback(
    (key: HapticPattern) => {
      if (!ref.current.vibe) return;
      const p = PATTERNS[key];
      if (canVibe() && vibrate(p.p)) showCue(`진동 · ${p.label}`);
      else if (!noVibeNotified.current) {
        noVibeNotified.current = true;
        showCue("진동 미지원 · 음성·화면으로 안내");
      }
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
    onFloorArrival: (step) => {
      go("floorMap", { floorMapTarget: step.to_floor, routeOpen: false, raised: false });
      say(`${floorName(step.to_floor)}에 도착했어요. 이 층의 안내도를 다시 찍어주세요`);
    },
    onOffRoute: () => toOffroute(),
    onArrive: () => arrive(),
    onReroute: (r) => {
      update({ route: r, steps: r.steps.map(toRouteStep), step: 0, dir: ref.current.simDir ?? "far" });
    },
  });
  const { dir: navDir, load: navLoad, start: navStart, next: navNext, continueAfterFloorMap: navContinueAfterFloorMap, goTo: navGoTo, resume: navResume, confirmCheckpoint: navConfirm, rerouteFrom: navRerouteFrom } = nav;

  /** "무시하고 계속": clear the engine's off-route state and go back to the current step. */
  const dismissOffroute = useCallback(() => {
    navResume();
    const s = ref.current;
    const st = s.steps[s.step];
    go(st && st.kind && st.kind !== "walk" ? "elevator" : "guide");
    say("계속 안내할게요");
  }, [navResume, go, say]);

  /** Off-route, pinned on the map: new route from that spot (the engine then emits onStep / onReroute). */
  const rerouteFromPin = useCallback(
    async (spot: { id: string; label: string }) => {
      try {
        if (await navRerouteFrom(spot.id)) say(`${spot.label}에서 새 경로로 안내할게요`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "새 경로를 찾지 못했어요");
      }
    },
    [navRerouteFrom, say, toast],
  );

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
      if (target === "map" && ref.current.parsedPhoto) URL.revokeObjectURL(ref.current.parsedPhoto.url);
      go("scan", {
        scanTarget: target,
        scanFrom: from === "scan" ? ref.current.scanFrom : from,
        scanState: denied ? "denied" : "aim",
        outcome: "success",
        manual: false,
        dest: ensureDest(),
        ...(target === "map" ? { parsed: null, parsedPhoto: null } : {}),
      });
      if (!denied) say(scanMeta(target, destName()).guide);
    },
    [go, ensureDest, destName, say],
  );

  /** A freshly read or saved map: wrong floor while switching floors, else the result screen. */
  const showParsed = useCallback(
    (g: ParsedGraph, spoken: string) => {
      const target = ref.current.floorMapTarget;
      if (target && !canUseFloorMap(target, g)) {
        go("wrongFloor", { mapDemo: false, parsed: g });
        say(`${floorName(g.floor)} 안내도예요. ${floorName(target)} 안내도를 다시 찍어주세요`);
        return;
      }
      say(spoken);
      go("mapResult", { mapDemo: false, parsed: g, ...(target ? {} : { start: startFromParsed(g) }) });
    },
    [go, say],
  );

  /**
   * Checkpoint scan. With a camera frame the engine sends it to POST /api/checkpoint and owns the result;
   * without one (demo panel, map flow, desktop without a camera) the old simulated outcome is used.
   */
  const runScan = useCallback(
    async (frame?: Blob) => {
      update({ scanState: "analyzing", manual: false });
      if (frame && ref.current.scanTarget === "map") {
        const ctl = new AbortController();
        parseCtl.current = ctl;
        const timeout = setTimeout(() => ctl.abort(), 70_000); // backend gives the model 60 s
        try {
          const place = ref.current.place;
          const g = await parseEvacMap(frame, ref.current.floorMapTarget ? floorNumber(ref.current.floorMapTarget) : 1, ctl.signal, place);
          if (parseCtl.current !== ctl || ref.current.screen !== "scan") return;
          if (g.buildingId) update({ place: { ...place, id: g.buildingId, name: g.building } });
          showParsed(g, "안내도를 읽었어요. 결과를 확인해 주세요");
        } catch (e) {
          if (parseCtl.current !== ctl) return; // cancelled by the user
          if (ref.current.screen === "scan" && e instanceof ApiError && e.code === "NOT_FLOOR_PLAN") {
            go("invalidMap", { parsed: null, pendingPhoto: null, mapDemo: false, ...(ref.current.floorMapTarget ? {} : { start: null }), scanState: "aim" });
            return;
          }
          toast(ctl.signal.aborted ? "안내도를 읽는 데 너무 오래 걸려요. 다시 찍거나 다른 사진을 선택해 주세요" : e instanceof Error ? e.message : "안내도를 읽지 못했어요");
          if (ref.current.screen === "scan") update({ scanState: "fail" });
        } finally {
          clearTimeout(timeout);
          if (parseCtl.current === ctl) parseCtl.current = null;
        }
        return;
      }
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
    [update, go, navConfirm, cue, say, toast, destName, showParsed],
  );

  /** Someone already photographed this floor: use their map, no camera or AI read. */
  const loadSavedMap = useCallback(
    async (floor: string) => {
      const id = ref.current.place.id;
      if (id === null) return;
      try {
        const g = await fetchSavedMap(id, floor);
        if (ref.current.parsedPhoto) URL.revokeObjectURL(ref.current.parsedPhoto.url);
        update({ parsedPhoto: null }); // the photo isn't stored, only the map
        showParsed(g, "저장된 안내도를 불러왔어요. 결과를 확인해 주세요");
      } catch (e) {
        toast(e instanceof Error ? e.message : "저장된 안내도를 불러오지 못했어요");
      }
    },
    [update, showParsed, toast],
  );

  const cancelScan = useCallback(() => {
    clearTimeout(timers.current.scan);
    const ctl = parseCtl.current;
    parseCtl.current = null;
    ctl?.abort();
    update({ scanState: "aim" });
  }, [update]);

  /** Reads an evacuation-map photo (camera frame or album pick) from any screen: keeps it for drawing, then parses. */
  const readMapPhoto = useCallback(
    async (img: Blob) => {
      if (ref.current.screen !== "scan" || ref.current.scanTarget !== "map") openScan("map");
      if (ref.current.parsedPhoto) URL.revokeObjectURL(ref.current.parsedPhoto.url);
      let photo: AppState["parsedPhoto"] = null;
      try {
        const bmp = await createImageBitmap(img);
        photo = { url: URL.createObjectURL(img), w: bmp.width, h: bmp.height };
        bmp.close();
      } catch {} // unreadable format: the parse call reports the error
      update({ parsedPhoto: photo });
      await runScan(img);
    },
    [openScan, update, runScan],
  );

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

  const confirmMap = useCallback(() => {
    const s = ref.current;
    const g = s.mapDemo ? null : s.parsed;
    if (s.floorMapTarget) {
      if (!canUseFloorMap(s.floorMapTarget, g)) {
        go("wrongFloor");
        return;
      }
      update({ floorMapTarget: null });
      navContinueAfterFloorMap();
      return;
    }
    go("start", { ...(g ? {} : { start: "here" }), locEdit: !!g && !s.start, landmarks: false });
  }, [go, update, navContinueAfterFloorMap]);

  const scanNext = useCallback(
    (manual: boolean) => {
      const t = ref.current.scanTarget;
      if (t === "map") go("mapResult", { mapDemo: false });
      else {
        const destFloor = `${ref.current.dest?.floor ?? 4}층`;
        go("offroute", { offState: "confirm", offFloor: destFloor, offSign: manual ? "직접 선택" : `${destFloor} 동측 복도 표지` });
      }
    },
    [go],
  );

  const beginTrip = useCallback(() => {
    update({ trip: { startedAt: Date.now(), arrivedAt: null, reroutes: 0 }, simDir: null });
    // Must run inside the tap handler so iOS grants compass access and starts audio for the direction beep.
    unlockAudio();
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
        const route = await fetchRoute(ref.current.startAt?.id ?? START_NODE_IDS[ref.current.start ?? "here"], room.id);
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
    go("welcome", { step: 0, dir: "far", start: "here", startAt: null, route: null, steps: [], routeLoading: false, simDir: null, floorMapTarget: null });
  }, [go, stopGuidance, navLoad]);

  /** Guided trial start: skips the marketing intro and lands on the real capture screen with 하은's photo. */
  const startTrial = useCallback(() => {
    if (ref.current.parsedPhoto) URL.revokeObjectURL(ref.current.parsedPhoto.url);
    navLoad(null);
    update({
      screen: "captureIntro",
      trialOn: true,
      mapDemo: false,
      parsed: null,
      parsedPhoto: null,
      start: null,
      locEdit: false,
      landmarks: false,
      query: "",
      cat: null,
      floorPick: null,
      dest: null,
      route: null,
      steps: [],
      routeLoading: false,
      trip: { startedAt: null, arrivedAt: null, reroutes: 0 },
      mode: "both",
      vibe: true,
      voice: true,
      simDir: null,
      sheet: false,
      toast: null,
      cue: null,
    });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [update, navLoad, scrollRef]);

  /**
   * Ends the guided overlay. `toLanding` also clears the half-finished trip so the next
   * ordinary visit starts clean; otherwise the user keeps the real screen they reached.
   */
  const endTrial = useCallback(
    (toLanding = false) => {
      if (!toLanding) {
        update({ trialOn: false });
        toast("3분 체험을 마쳤어요. 실제 앱처럼 이어서 사용할 수 있어요");
        return;
      }
      if (ref.current.parsedPhoto) URL.revokeObjectURL(ref.current.parsedPhoto.url);
      navLoad(null);
      update({
        screen: "landing",
        trialOn: false,
        mapDemo: false,
        parsed: null,
        parsedPhoto: null,
        start: "here",
        locEdit: false,
        landmarks: false,
        query: "",
        cat: null,
        floorPick: null,
        dest: null,
        route: null,
        steps: [],
        routeLoading: false,
        trip: { startedAt: null, arrivedAt: null, reroutes: 0 },
        simDir: null,
        sheet: false,
        toast: null,
        cue: null,
      });
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [update, navLoad, scrollRef, toast],
  );

  const back = useCallback(() => {
    const s = ref.current;
    // Leaving any guided screen ends the trial; the overlay must not reappear later in the trip.
    if (s.trialOn) update({ trialOn: false });
    if (s.screen === "scan") {
      clearTimeout(timers.current.scan);
      go(s.scanFrom === "scan" ? "welcome" : s.scanFrom);
      return;
    }
    if (s.floorMapTarget && (s.screen === "mapResult" || s.screen === "invalidMap" || s.screen === "wrongFloor")) {
      go("floorMap");
      return;
    }
    if (s.screen === "floorMap") return; // Keep guidance paused until a new plan is confirmed or the trip ends.
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
  }, [go, startGuide, stopGuidance, update]);

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

  // Whether this device can speak Korean (the voice list loads late on Chrome).
  useEffect(() => {
    void koreanVoiceReady().then((koVoice) => update({ koVoice }));
  }, [update]);

  // Direction pulse: the closer to the target heading, the shorter the interval. Vibration where it exists,
  // the iPhone haptic tick where it doesn't, and a beep panned toward the turn (read live, not per render).
  const navDelta = useRef<number | null>(null);
  useEffect(() => {
    navDelta.current = nav.delta;
  });
  useEffect(() => {
    if (state.screen !== "guide" || state.dir === "unstable") return;
    const haptic = state.vibe && !state.simNoVibe;
    const sound = state.beep && (state.vibe || state.voice); // "화면만" mode stays silent
    if (!haptic && !sound) return;
    const dir = state.dir;
    const period = DIRECTION[dir].period * 1000;
    const buzz = haptic ? setInterval(() => (supportsVibration() ? vibrate(dir === "aligned" ? 70 : 35) : iosHaptic()), period) : undefined;
    // Beeps no faster than 0.7 s: three a second when on course is noise, not guidance.
    const tone = sound ? setInterval(() => beep(navDelta.current === null ? 0 : beepPan(navDelta.current), dir === "aligned"), Math.max(period, 700)) : undefined;
    return () => {
      clearInterval(buzz);
      clearInterval(tone);
    };
  }, [state.screen, state.dir, state.vibe, state.voice, state.beep, state.simNoVibe]);

  // Hardware/browser back maps to in-app back instead of leaving the app.
  useEffect(() => {
    history.pushState({ gilgyeol: true }, "");
    const onPop = () => {
      // Landing and welcome are the entry screens: browser back leaves the app instead of looping.
      if (ref.current.screen === "welcome" || ref.current.screen === "landing") {
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
      confirmMap,
      openScan,
      runScan,
      loadSavedMap,
      readMapPhoto,
      cancelScan,
      scanNext,
      arrive,
      toOffroute,
      dismissOffroute,
      rerouteFromPin,
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
      startTrial,
      endTrial,
    }),
    [update, go, back, toast, canVibe, startGuide, setDir, toElevator, advance, leaveElevator, confirmMap, openScan, runScan, loadSavedMap, readMapPhoto, cancelScan, scanNext, arrive, toOffroute, dismissOffroute, rerouteFromPin, pickDest, endGuide, setMode, replay, testVibe, playPattern, toggleVoice, ensureDest, beginTrip, setRaised, enablePosture, startTrial, endTrial],
  );

  // Live compass for screens: corrected heading, signed turn to the step's corridor, calibration.
  const compass = { heading: nav.heading, delta: nav.delta, disturbed: nav.disturbed, walkedM: nav.walkedM, calibrated: nav.calibrated, calibrate: nav.calibrate, resetCalibration: nav.resetCalibration };

  return { state, actions, compass };
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
