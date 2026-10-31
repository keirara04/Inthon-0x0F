"use client";

import { useDemoTools } from "@/lib/gilgyeol/demo";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { PrimaryButton } from "./ui";

export function WelcomeScreen() {
  const { actions } = useGilgyeol();
  const demo = useDemoTools();
  return (
    <div className="flex min-h-full flex-col gap-[18px] px-6 pt-4 pb-6">
      <div className="flex items-center justify-between">
        {demo && (
          <div className="flex items-center gap-1.5 rounded-lg bg-warn-tint px-2.5 py-1.5 text-[13px] font-semibold text-warn-ink">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
            시연용 건물 데이터
          </div>
        )}
        <button
          type="button"
          onClick={() => actions.update({ sheet: true })}
          aria-label="안내 설정"
          className="ml-auto h-11 rounded-[22px] border-[1.5px] border-edge bg-surface px-3.5 text-[14px] font-semibold text-ink"
        >
          설정
        </button>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-[18px]">
        <div aria-hidden="true" className="relative size-[132px]">
          <div className="absolute inset-0 rounded-full border-2 border-[#DCD7F2]" />
          <div className="absolute inset-[22px] rounded-full border-2 border-[#B3A9E3]" />
          <div className="absolute inset-[44px] rounded-full border-[2.5px] border-haptic" />
          <div className="absolute top-[58px] left-[58px] size-4 rounded-full bg-brand" />
        </div>
        <div className="text-[64px] leading-none font-extrabold tracking-[-0.05em] text-brand">어디路</div>
        <h1 className="m-0 text-[26px] leading-[1.35] font-bold tracking-[-0.02em]">
          보지 않고 느끼며
          <br />
          찾는 실내 길
        </h1>
        <p className="m-0 text-[16px] leading-[1.55] text-pretty text-muted">주변 표지와 진동·음성 안내로 건물 안 목적지를 찾아가요.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <PrimaryButton tall onClick={() => actions.go("building")}>
          길찾기 시작
        </PrimaryButton>
        <div className="text-center text-[14px] text-muted">현재는 우정정보관 데모를 지원해요.</div>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-2.5">
        <button
          type="button"
          onClick={() => actions.go("editor")}
          className="flex h-12 items-center justify-between border-none bg-transparent p-0 text-[15px] font-semibold text-ink"
        >
          지도 만들기 · 관리자<span className="text-[14px] font-medium text-muted">그래프 편집</span>
        </button>
        <button
          type="button"
          onClick={() => actions.go("landing")}
          className="flex h-12 items-center justify-between border-t border-line bg-transparent p-0 text-[15px] font-semibold text-ink"
        >
          서비스 소개<span className="text-[14px] font-medium text-muted">3분 체험 안내</span>
        </button>
        <p className="m-0 text-[12px] leading-normal text-muted">어디路는 일상 길찾기 도구예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.</p>
      </div>
    </div>
  );
}
