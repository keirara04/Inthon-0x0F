"use client";

import { C, FLOORS } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Badge, Check, DemoBox, GhostButton, PrimaryButton } from "./ui";

export function ElevatorScreen() {
  const { state: s, actions } = useGilgyeol();
  const unverified = s.elevUnverified;
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1.5 pb-6">
      <div className="flex min-h-8 items-center justify-between">
        <div className="text-[15px] font-bold">우정정보관 · 층 이동</div>
        <div className="text-[13px] font-bold text-muted">3 / 6 단계</div>
      </div>
      <div className="flex flex-col gap-[18px] rounded-[22px] bg-surface px-5 py-6">
        <div className="text-[13px] font-bold text-route">엘리베이터 이용</div>
        <h1 className="m-0 text-[38px] leading-[1.1] font-extrabold tracking-[-0.03em]">4층으로 이동</h1>
        <div className="flex flex-col gap-1">
          <div className="text-[19px] font-bold">중앙 엘리베이터 A</div>
          <div className="text-[15px] text-muted">1층 엘리베이터 홀 정면</div>
        </div>
        <div role="status" className={`flex items-center gap-[7px] self-start rounded-[10px] px-3 py-[7px] text-[15px] font-bold ${unverified ? "bg-warn-tint text-warn-ink" : "bg-ok-tint text-ok-ink"}`}>
          {unverified ? (
            <span aria-hidden="true">!</span>
          ) : (
            <Check color={C.success} width={2.4} />
          )}
          {unverified ? "정차 층 확인 중 · 엘리베이터 안 층 버튼을 확인해 주세요" : "4층 정차 확인"}
        </div>
        <div className="grid grid-cols-5 gap-1.5" aria-label="층 표시: 현재 1층, 목적지 4층">
          {FLOORS.map((n) => (
            <div
              key={n}
              className="flex h-[52px] flex-col items-center justify-center gap-px rounded-xl border-2"
              style={{ background: n === 4 ? C.brand : "#fff", color: n === 4 ? "#fff" : C.ink, borderColor: n === 4 ? C.brand : n === 1 ? C.ink : C.line }}
            >
              <span className="text-[18px] font-extrabold">{n}</span>
              <span className="text-[10px] font-bold">{n === 1 ? "현재" : n === 4 ? "목적지" : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <Badge tone="haptic">층 이동 · 진동 짧게 3회</Badge>
      <p className="m-0 text-[16px] leading-normal text-ink">엘리베이터에서 내리면 층 표지를 카메라로 비춰 4층인지 확인해요.</p>
      <DemoBox label="데모 입력 · 승강기 데이터 상태">
        <button
          type="button"
          onClick={() => actions.update({ elevUnverified: !unverified })}
          className="h-11 rounded-xl border-[1.5px] border-edge bg-surface text-[14px] font-semibold text-ink"
        >
          {unverified ? "정차 확인된 상태로 보기" : "정차 정보 미확인 상태 보기"}
        </button>
      </DemoBox>
      <div className="flex-1" />
      <PrimaryButton onClick={() => actions.openScan("floor4")}>4층에서 내렸어요 · 층 표지 확인</PrimaryButton>
      <GhostButton onClick={actions.replay}>안내 다시 듣기</GhostButton>
    </div>
  );
}
