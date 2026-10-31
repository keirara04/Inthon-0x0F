"use client";

import { floorNumber } from "@/lib/gilgyeol/api";
import { C, FLOORS } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Badge, Check, DemoBox, GhostButton, PrimaryButton } from "./ui";

export function ElevatorScreen() {
  const { state: s, actions } = useGilgyeol();
  const st = s.steps[s.step];
  if (!st) return null;

  const unverified = s.elevUnverified;
  const stairs = st.kind === "stairs";
  const toFloor = floorNumber(st.toFloor ?? st.floor);
  const prev = s.steps[s.step - 1];
  const fromFloor = prev ? parseInt(prev.floor, 10) || 1 : 1;
  const name = st.elevator || (stairs ? "계단" : "엘리베이터");
  const floors = [...new Set([...FLOORS, toFloor])].sort((a, b) => a - b);

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1.5 pb-6">
      <div className="flex min-h-8 items-center justify-between">
        <div className="text-[15px] font-bold">우정정보관 · 층 이동</div>
        <div className="text-[13px] font-bold text-muted">
          {s.step + 1} / {s.steps.length} 단계
        </div>
      </div>
      <div className="flex flex-col gap-[18px] rounded-[22px] bg-surface px-5 py-6">
        <div className="text-[13px] font-bold text-route">{stairs ? "계단 이용" : "엘리베이터 이용"}</div>
        <h1 className="m-0 text-[38px] leading-[1.1] font-extrabold tracking-[-0.03em]">{toFloor}층으로 이동</h1>
        <div className="flex flex-col gap-1">
          <div className="text-[19px] font-bold">{name}</div>
          <div className="text-[15px] text-muted">
            {fromFloor}층에서 {toFloor}층으로
          </div>
        </div>
        <div role="status" className={`flex items-center gap-[7px] self-start rounded-[10px] px-3 py-[7px] text-[15px] font-bold ${unverified && !stairs ? "bg-warn-tint text-warn-ink" : "bg-ok-tint text-ok-ink"}`}>
          {unverified && !stairs ? (
            <span aria-hidden="true">!</span>
          ) : (
            <Check color={C.success} width={2.4} />
          )}
          {stairs ? `${toFloor}층까지 계단으로 이동` : unverified ? "정차 층 확인 중 · 엘리베이터 안 층 버튼을 확인해 주세요" : `${toFloor}층 정차 확인`}
        </div>
        <div className="grid grid-cols-5 gap-1.5" aria-label={`층 표시: 현재 ${fromFloor}층, 목적지 ${toFloor}층`}>
          {floors.map((n) => (
            <div
              key={n}
              className="flex h-[52px] flex-col items-center justify-center gap-px rounded-xl border-2"
              style={{ background: n === toFloor ? C.brand : "#fff", color: n === toFloor ? "#fff" : C.ink, borderColor: n === toFloor ? C.brand : n === fromFloor ? C.ink : C.line }}
            >
              <span className="text-[18px] font-extrabold">{n}</span>
              <span className="text-[10px] font-bold">{n === fromFloor ? "현재" : n === toFloor ? "목적지" : ""}</span>
            </div>
          ))}
        </div>
      </div>
      <Badge tone="haptic">층 이동 · 진동 짧게 3회</Badge>
      <p className="m-0 text-[16px] leading-normal text-ink">
        {toFloor}층에 도착하면 아래 버튼을 눌러주세요. 이 층의 안내도를 다시 촬영한 뒤 안내를 계속해요.
      </p>
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
      <PrimaryButton data-trial="elev-leave" onClick={actions.leaveElevator}>{stairs ? "계단 도착" : `${toFloor}층에서 내렸어요`}</PrimaryButton>
      <GhostButton onClick={actions.replay}>안내 다시 듣기</GhostButton>
      <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
    </div>
  );
}
