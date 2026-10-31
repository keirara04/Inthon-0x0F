"use client";

import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import { Badge, GhostButton, PrimaryButton } from "./ui";

export function ArrivalScreen() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  return (
    <div className="flex min-h-full flex-col gap-[18px] p-5 pt-6">
      <div className="flex flex-1 flex-col items-start justify-center gap-[18px]">
        <div className="flex size-[88px] items-center justify-center rounded-full bg-success" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <polyline points="9,23 18,32 35,13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 role="status" className="m-0 text-[32px] leading-[1.25] font-extrabold tracking-[-0.03em]">
          우정정보관 {d}에
          <br />
          도착했어요
        </h1>
        <div className="text-[18px] text-muted">우정정보관 · 4층</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="haptic">진동 · 길게 1회 + 짧게 2회</Badge>
          {s.arrivedManual && <Badge tone="warn">직접 확인으로 완료</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <GhostButton className="h-[52px] rounded-2xl" onClick={actions.replay}>
          다시 듣기
        </GhostButton>
        <GhostButton className="h-[52px] rounded-2xl" onClick={() => actions.go("search", { query: "", cat: null, floorPick: null, step: 0, dir: "far" })}>
          다른 목적지 찾기
        </GhostButton>
      </div>
      <PrimaryButton dark onClick={actions.endGuide}>
        안내 종료
      </PrimaryButton>
    </div>
  );
}
