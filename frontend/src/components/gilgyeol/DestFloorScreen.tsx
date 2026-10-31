"use client";

import { FLOORS } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Title } from "./ui";

/**
 * Destination floor choice. Picking a floor loads the current-floor walk route to that
 * floor's elevator, so the next screen only previews the leg that happens before the ride.
 */
export function DestFloorScreen() {
  const { state: s, actions } = useGilgyeol();
  const floors = FLOORS.filter((f) => f !== 1);

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="목적지 층 선택" onBack={actions.back} />
      <div className="flex flex-col gap-1.5">
        <Title className="leading-[1.25]">몇 층으로 가시나요?</Title>
        <p className="m-0 text-[15px] leading-normal text-muted">가려는 곳이 있는 층을 골라주세요. 지금은 1층에 있어요.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {floors.map((f) => {
          const busy = s.routeLoading && s.destFloor === f;
          return (
            <button
              type="button"
              data-trial={f === 4 ? "floor-4" : undefined}
              key={f}
              disabled={s.routeLoading}
              onClick={() => actions.chooseFloor(f)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-[18px] border-2 border-edge bg-surface px-[18px] text-left disabled:opacity-70"
            >
              <span className="flex items-baseline gap-2">
                <span className="text-[24px] font-extrabold tracking-[-0.02em]">{f}</span>
                <span className="text-[16px] font-semibold text-muted">층</span>
              </span>
              <span className="text-[13px] font-bold text-brand">{busy ? "경로 찾는 중…" : "이 층으로"}</span>
            </button>
          );
        })}
      </div>
      <p className="m-0 text-[13px] leading-[1.5] text-muted">층을 고르면 지금 층에서 엘리베이터까지 가는 경로를 먼저 보여드려요.</p>
    </div>
  );
}
