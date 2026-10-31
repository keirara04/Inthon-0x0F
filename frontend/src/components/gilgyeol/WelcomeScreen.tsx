"use client";

import { useDemoTools } from "@/lib/gilgyeol/demo";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Mascot } from "./Mascot";
import { PrimaryButton } from "./ui";

/** Only one building has map data for now; the building screen is skipped until there is a real choice. */
const BUILDING = { name: "우정정보관", floors: "1–4층" };

export function WelcomeScreen() {
  const { actions } = useGilgyeol();
  const demo = useDemoTools();
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-2 pb-5">
      {/* Same header pattern as the landing: mark + wordmark, settings as an icon. */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- 96px mascot head mark */}
          <img src="/mascot/head.png" alt="" aria-hidden="true" width={30} height={30} />
          <span className="text-[22px] font-extrabold tracking-[-0.04em] text-brand">어디路</span>
        </div>
        <button
          type="button"
          onClick={() => actions.update({ sheet: true })}
          aria-label="안내 설정"
          className="-mr-1.5 flex size-11 items-center justify-center rounded-full border-[1.5px] border-edge bg-surface text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </button>
      </header>
      {demo && (
        <div className="flex items-center gap-1.5 self-start rounded-lg bg-warn-tint px-2.5 py-1.5 text-[13px] font-semibold text-warn-ink">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />
          시연용 건물 데이터
        </div>
      )}

      {/* Hero: Alienie inside haptic rings that pulse outward like the vibration guidance. */}
      <div aria-hidden="true" className="relative flex min-h-[210px] max-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-[26px] bg-haptic-tint">
        <div className="absolute size-[210px] rounded-full border-2 border-[#DCD7F2]" />
        <div className="gw-ring absolute size-[120px] rounded-full border-2 border-[#A9C3DE]" />
        <div className="gw-ring gw-ring-2 absolute size-[120px] rounded-full border-2 border-[#A9C3DE]" />
        <div className="gw-ring gw-ring-3 absolute size-[120px] rounded-full border-2 border-[#A9C3DE]" />
        <Mascot pose="main" height={150} motion="bob" className="relative translate-y-2" />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-[1.28] font-extrabold tracking-[-0.03em] text-pretty">보지 않고 느끼며 찾는 실내 길</h1>
        <p className="m-0 text-[16px] leading-[1.55] text-pretty text-muted">진동과 음성으로 안내해요. 화면은 가끔만 보면 돼요.</p>
      </div>

      <div className="mt-auto flex flex-col gap-2.5">
        <div className="flex items-center gap-1.5 self-start rounded-full bg-surface px-3 py-1.5 text-[14px] font-semibold text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)]">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
          </svg>
          {BUILDING.name} · {BUILDING.floors}
        </div>
        <PrimaryButton tall onClick={() => actions.go("captureIntro")}>
          {BUILDING.name} 길찾기 시작
        </PrimaryButton>
        <button type="button" onClick={() => actions.go("landing")} className="h-11 rounded-xl border-none bg-transparent text-[14px] font-semibold text-ink underline decoration-line underline-offset-4">
          서비스 소개 보기
        </button>
      </div>

      <p className="m-0 flex items-start justify-center gap-1.5 text-center text-[13px] leading-normal text-muted">
        <span aria-hidden="true">ⓘ</span>
        일상 길찾기 도구예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.
      </p>
    </div>
  );
}
