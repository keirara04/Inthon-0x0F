"use client";

import type { ReactNode } from "react";
import { GilgyeolProvider, useGilgyeol } from "@/lib/gilgyeol/store";
import type { Screen } from "@/lib/gilgyeol/types";
import { ArrivalScreen } from "./ArrivalScreen";
import { BuildingScreen } from "./BuildingScreen";
import { CaptureIntroScreen } from "./CaptureIntroScreen";
import { CheckpointScanner } from "./CheckpointScanner";
import { useDemoTools } from "@/lib/gilgyeol/demo";
import { DemoPanel } from "./DemoPanel";
import { ElevatorScreen } from "./ElevatorScreen";
import { GraphEditorScreen } from "./GraphEditorScreen";
import { GuidanceScreen } from "./GuidanceScreen";
import { LandingScreen } from "./LandingScreen";
import { MapResultScreen } from "./MapResultScreen";
import { ModeScreen } from "./ModeScreen";
import { OffRouteScreen } from "./OffRouteScreen";
import { RoutePreviewScreen } from "./RoutePreviewScreen";
import { SearchScreen } from "./SearchScreen";
import { SettingsSheet } from "./SettingsSheet";
import { StartLocationScreen } from "./StartLocationScreen";
import { WelcomeScreen } from "./WelcomeScreen";

const SCREENS: Record<Screen, () => ReactNode> = {
  landing: LandingScreen,
  welcome: WelcomeScreen,
  building: BuildingScreen,
  captureIntro: CaptureIntroScreen,
  mapResult: MapResultScreen,
  start: StartLocationScreen,
  search: SearchScreen,
  preview: RoutePreviewScreen,
  mode: ModeScreen,
  guide: GuidanceScreen,
  elevator: ElevatorScreen,
  scan: CheckpointScanner,
  offroute: OffRouteScreen,
  arrive: ArrivalScreen,
  editor: GraphEditorScreen,
};

function Device() {
  const { state: s, scrollRef } = useGilgyeol();
  const Current = SCREENS[s.screen];
  const dark = s.screen === "scan";
  return (
    <div className="gg-device">
      <div className={`gg-screen ${dark ? "bg-camera!" : ""}`}>
        {/* Simulated status bar — only shown inside the desktop device frame. */}
        <div aria-hidden="true" className={`gg-statusbar h-10 flex-none items-center justify-between px-7 text-[14px] font-semibold ${dark ? "bg-camera text-white" : "text-ink"}`}>
          <span>9:41</span>
          <span className="flex items-center gap-1.5">
            <span className="text-[12px]">LTE</span>
            <span className="box-border h-[11px] w-[22px] rounded-[3px] border-[1.5px] border-current p-px">
              <span className="block h-full w-[70%] rounded-[1px] bg-current" />
            </span>
          </span>
        </div>
        <main ref={scrollRef} className="gg-scroll relative flex-1 overflow-x-hidden overflow-y-auto">
          <Current key={s.screen} />
        </main>
        {s.cue && (
          <div
            role="status"
            className="absolute top-12 left-1/2 z-[5] flex max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2 rounded-[20px] bg-haptic px-3.5 py-[9px] text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(60,40,140,.3)]"
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
