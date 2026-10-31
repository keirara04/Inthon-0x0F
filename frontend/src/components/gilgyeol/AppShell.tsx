"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GilgyeolProvider, useGilgyeol } from "@/lib/gilgyeol/store";
import type { Screen } from "@/lib/gilgyeol/types";
import { ArrivalScreen } from "./ArrivalScreen";
import { BuildingScreen } from "./BuildingScreen";
import { CaptureIntroScreen } from "./CaptureIntroScreen";
import { CheckpointScanner } from "./CheckpointScanner";
import { useDemoTools } from "@/lib/gilgyeol/demo";
import { DemoPanel } from "./DemoPanel";
import { DestFloorScreen } from "./DestFloorScreen";
import { FloorMapScreen } from "./FloorMapScreen";
import { ElevatorScreen } from "./ElevatorScreen";
import { GraphEditorScreen } from "./GraphEditorScreen";
import { GuidanceScreen } from "./GuidanceScreen";
import { InvalidMapScreen } from "./InvalidMapScreen";
import { LandingScreen } from "./LandingScreen";
import { MapResultScreen } from "./MapResultScreen";
import { ModeScreen } from "./ModeScreen";
import { OffRouteScreen } from "./OffRouteScreen";
import { RoutePreviewScreen } from "./RoutePreviewScreen";
import { SearchScreen } from "./SearchScreen";
import { SettingsSheet } from "./SettingsSheet";
import { StartLocationScreen } from "./StartLocationScreen";
import { TrialGuide } from "./TrialGuide";
import { TrialScreen } from "./TrialScreen";
import { WrongFloorScreen } from "./WrongFloorScreen";
import { WelcomeScreen } from "./WelcomeScreen";

const SCREENS: Record<Screen, () => ReactNode> = {
  landing: LandingScreen,
  trial: TrialScreen,
  welcome: WelcomeScreen,
  building: BuildingScreen,
  captureIntro: CaptureIntroScreen,
  invalidMap: InvalidMapScreen,
  wrongFloor: WrongFloorScreen,
  mapResult: MapResultScreen,
  start: StartLocationScreen,
  destFloor: DestFloorScreen,
  search: SearchScreen,
  preview: RoutePreviewScreen,
  mode: ModeScreen,
  guide: GuidanceScreen,
  elevator: ElevatorScreen,
  floorMap: FloorMapScreen,
  scan: CheckpointScanner,
  offroute: OffRouteScreen,
  arrive: ArrivalScreen,
  editor: GraphEditorScreen,
};

// Flow order for transition direction: moving to a later screen slides in from the right, going back from the left.
const ORDER = Object.keys(SCREENS) as Screen[];

function Device() {
  const { state: s, scrollRef } = useGilgyeol();
  const Current = SCREENS[s.screen];
  // Adjust-state-during-render: remember the previous screen to pick the slide direction.
  const [shown, setShown] = useState({ screen: s.screen, back: false });
  if (shown.screen !== s.screen) setShown({ screen: s.screen, back: ORDER.indexOf(s.screen) < ORDER.indexOf(shown.screen) });

  // iOS Safari only applies :active (button press feedback) when a touch listener exists.
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  const dark = s.screen === "scan";
  return (
    <div className="gg-device">
      <div className={`gg-screen ${dark ? "bg-camera!" : ""}`}>
        {/* Simulated iPhone chrome: only shown inside the desktop device frame (see .gg-device in globals.css). */}
        <div aria-hidden="true" className="gg-island" />
        <div aria-hidden="true" className={`gg-statusbar h-[54px] flex-none items-center justify-between pr-7 pl-9 text-[15px] font-semibold ${dark ? "bg-camera text-white" : "text-ink"}`}>
          <span>9:41</span>
          <span className="flex items-center gap-[6px]">
            <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
              <rect x="10" y="3" width="3" height="9" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
              <path d="M8 2.4c2.3 0 4.4.9 6 2.4l1.3-1.3A10.3 10.3 0 0 0 8 .6 10.3 10.3 0 0 0 .7 3.5L2 4.8a8.5 8.5 0 0 1 6-2.4Z" />
              <path d="M8 6.1c1.3 0 2.5.5 3.4 1.3l1.3-1.3A6.6 6.6 0 0 0 8 4.3a6.6 6.6 0 0 0-4.7 1.8l1.3 1.3c.9-.8 2.1-1.3 3.4-1.3Z" />
              <path d="M8 9.8a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm0-1.9c-.8 0-1.5.3-2 .8L8 10.7l2-2c-.5-.5-1.2-.8-2-.8Z" />
            </svg>
            <span className="flex items-center gap-[2px]">
              <span className="box-border h-[12px] w-[25px] rounded-[4px] border border-current p-[1.5px] opacity-90">
                <span className="block h-full w-[80%] rounded-[2px] bg-current" />
              </span>
              <span className="h-[4px] w-[1.5px] rounded-r-sm bg-current opacity-60" />
            </span>
          </span>
        </div>
        <main ref={scrollRef} className="gg-scroll relative flex-1 overflow-x-hidden overflow-y-auto">
          {/* h-full keeps screens' min-h-full / h-full layouts working; taller content still scrolls in <main>. */}
          <div key={s.screen} className={`h-full ${shown.back ? "gg-screen-in gg-screen-back" : "gg-screen-in"}`}>
            <Current />
          </div>
        </main>
        <TrialGuide />
        {s.cue && (
          <div
            role="status"
            className="gg-cue absolute top-12 left-1/2 z-[5] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[20px] bg-haptic px-3.5 py-[9px] text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(60,40,140,.3)]"
          >
            <span aria-hidden="true" className="size-2 flex-none rounded-full bg-white" />
            {s.cue}
          </div>
        )}
        {s.toast && (
          <div role="status" className="absolute right-4 bottom-[calc(28px+env(safe-area-inset-bottom))] left-4 z-[6] rounded-[14px] bg-ink px-4 py-3.5 text-[14px] leading-[1.45] font-semibold text-white">
            {s.toast}
          </div>
        )}
        {s.sheet && <SettingsSheet />}
        <div id="gg-overlay" />
        <div aria-hidden="true" className={`gg-home ${dark ? "bg-white/80" : "bg-ink/80"}`} />
      </div>
    </div>
  );
}

export function AppShell() {
  const demo = useDemoTools();
  return (
    <GilgyeolProvider>
      <div className="gg-stage">
        <Device />
        {demo && (
          <aside className="gg-aside min-w-[260px] flex-[0_1_320px] flex-col gap-5 pt-3" aria-label="시연 패널">
            <DemoPanel />
          </aside>
        )}
      </div>
    </GilgyeolProvider>
  );
}
