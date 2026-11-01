"use client";

import { currentMapFloor } from "@/lib/gilgyeol/confirmedMaps";
import { floorName } from "@/lib/gilgyeol/floorTransition";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Title } from "./ui";

/**
 * Branch before search. Yes: guide to the elevator hall; after the ride the user photographs that floor's map and
 * picks the destination there. No: pick from this floor's rooms.
 */
export function DestFloorScreen() {
  const { state: s, actions } = useGilgyeol();
  const currentLabel = floorName(currentMapFloor(s));

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="층 이동 여부" onBack={actions.back} />
      <div className="flex flex-col items-center gap-5 pt-8 pb-4 text-center">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-haptic-tint" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="currentColor" className="text-haptic" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="4" width="16" height="26" rx="3" />
            <path d="M17 9v5M14.5 11.5 17 9l2.5 2.5M17 25v-5M14.5 22.5 17 25l2.5-2.5" />
          </svg>
        </div>
        <div className="flex flex-col gap-2">
          <Title className="text-center leading-[1.25]">다른 층으로 이동하시나요?</Title>
          <p className="m-0 text-[15px] leading-[1.55] text-muted">지금 등록된 안내도는 {currentLabel}이에요.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          disabled={s.routeLoading}
          onClick={() => actions.chooseFloorScope(true)}
          className="flex min-h-[72px] flex-col justify-center gap-1 rounded-[18px] bg-brand px-5 py-3 text-left text-white disabled:opacity-70"
        >
          <span className="text-[19px] font-extrabold">예, 이동할게요</span>
          <span className="text-[14px] font-medium text-white/85">{s.routeLoading ? "엘리베이터 경로 찾는 중…" : "엘리베이터까지 안내하고, 내린 층에서 목적지를 골라요"}</span>
        </button>
        <button
          type="button"
          onClick={() => actions.chooseFloorScope(false)}
          className="flex min-h-[72px] flex-col justify-center gap-1 rounded-[18px] border-2 border-edge bg-surface px-5 py-3 text-left"
        >
          <span className="text-[19px] font-extrabold text-ink">아니요, 이 층이에요</span>
          <span className="text-[14px] font-medium text-muted">{currentLabel} 목적지를 골라요</span>
        </button>
      </div>
    </div>
  );
}
