"use client";

import { C } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Check, DemoBox, GhostButton, PrimaryButton } from "./ui";
export function ElevatorScreen() {
  const { state: s, actions } = useGilgyeol();
  const st = s.steps[s.step];
  if (!st) return null;

  const unverified = s.elevUnverified;
  const stairs = st.kind === "stairs";
  const prev = s.steps[s.step - 1];
  const fromFloor = prev ? parseInt(prev.floor, 10) || 1 : 1;
  const name = st.elevator || (stairs ? "계단" : "엘리베이터");

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1.5 pb-6">
      <div className="flex flex-col gap-[18px] rounded-[22px] bg-surface px-5 py-6">
        <div className="text-[13px] font-bold text-route">{stairs ? "계단 이용" : "엘리베이터 이용"}</div>
        <h1 className="m-0 text-[38px] leading-[1.1] font-extrabold tracking-[-0.03em]">새로운 층으로 이동합니다</h1>
        <div className="flex flex-col gap-1">
          <div className="text-[19px] font-bold">{name}</div>
          <div className="text-[15px] text-muted">{fromFloor}층에서 새로운 층으로</div>
        </div>
        <div role="status" className={`flex items-center gap-[7px] self-start rounded-[10px] px-3 py-[7px] text-[15px] font-bold ${unverified && !stairs ? "bg-warn-tint text-warn-ink" : "bg-ok-tint text-ok-ink"}`}>
          {unverified && !stairs ? (
            <span aria-hidden="true">!</span>
          ) : (
            <Check color={C.success} width={2.4} />
          )}
          {stairs ? "새로운 층까지 계단으로 이동" : unverified ? "정차 층 확인 중 · 엘리베이터 안 층 버튼을 확인해 주세요" : "새로운 층 정차 확인"}
        </div>
      </div>
      <p className="m-0 text-[16px] leading-normal text-ink">
        새로운 층에 도착하면 아래 버튼을 눌러주세요. 이 층의 안내도를 앨범에서 고르면 안내를 이어가요.
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
      <PrimaryButton data-trial="elev-leave" onClick={actions.leaveElevator}>{stairs ? "계단 도착" : "새로운 층에서 내렸어요"}</PrimaryButton>
      <GhostButton onClick={actions.replay}>안내 다시 듣기</GhostButton>
      <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
    </div>
  );
}
