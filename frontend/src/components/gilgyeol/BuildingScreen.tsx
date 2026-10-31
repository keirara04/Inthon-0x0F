"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Check, PrimaryButton, Title } from "./ui";

export function BuildingScreen() {
  const { actions } = useGilgyeol();
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      <BackHeader label="시작 준비 · 1 / 3" onBack={actions.back} />
      <Title>어느 건물에 있나요?</Title>
      <div className="flex flex-col gap-2.5" role="radiogroup" aria-label="건물">
        <div role="radio" aria-checked="true" className="flex items-center justify-between rounded-[18px] border-2 border-brand bg-surface p-[18px]">
          <div className="flex flex-col gap-1">
            <div className="text-[19px] font-bold">우정정보관</div>
            <div className="text-[14px] text-muted">고려대학교 · MVP 지원 건물</div>
          </div>
          <div className="flex size-[26px] items-center justify-center rounded-full bg-brand">
            <Check />
          </div>
        </div>
        <div role="radio" aria-checked="false" aria-disabled="true" className="flex items-center justify-between rounded-[18px] bg-warm-panel px-[18px] py-4 text-muted">
          <div className="text-[16px] font-semibold">정운오IT교양관</div>
          <div className="text-[13px] font-semibold">준비 중</div>
        </div>
      </div>
      <div className="flex-1" />
      <PrimaryButton onClick={() => actions.go("captureIntro")}>우정정보관에서 시작</PrimaryButton>
    </div>
  );
}
