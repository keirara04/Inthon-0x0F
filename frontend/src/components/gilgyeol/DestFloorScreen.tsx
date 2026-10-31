"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Title } from "./ui";

/**
 * Branch before routing: does the user need another floor? Yes → elevator leg, then the new
 * floor's map. No → pick a room from the current-floor map. No floor picker here.
 */
export function DestFloorScreen() {
  const { state: s, actions } = useGilgyeol();
  const currentFloor = s.parsed ? s.parsed.floor.replace(/F$/i, "") : "1";
  const currentLabel = `${currentFloor}층`;

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="층 이동 여부" onBack={actions.back} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="flex size-[72px] items-center justify-center rounded-full bg-haptic-tint" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" stroke="#5B4AB8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
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
          onClick={actions.goDifferentFloor}
          className="flex min-h-[64px] items-center justify-between gap-3 rounded-[18px] bg-brand px-[18px] text-left text-white disabled:opacity-70"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[19px] font-extrabold">예, 이동할게요</span>
            <span className="text-[13px] font-medium text-white/80">엘리베이터 안내부터 이어서 안내해요</span>
          </span>
          <span className="flex-none text-[13px] font-bold">{s.routeLoading ? "경로 찾는 중…" : "엘리베이터 →"}</span>
        </button>
        <button
          type="button"
          onClick={actions.stayOnFloor}
          className="flex min-h-[64px] items-center justify-between gap-3 rounded-[18px] border-2 border-edge bg-surface px-[18px] text-left"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[19px] font-extrabold text-ink">아니요, 이 층이에요</span>
            <span className="text-[13px] font-medium text-muted">{currentLabel} 안내도에서 목적지를 골라요</span>
          </span>
          <span className="flex-none text-[13px] font-bold text-brand">목적지 선택 →</span>
        </button>
      </div>
    </div>
  );
}
