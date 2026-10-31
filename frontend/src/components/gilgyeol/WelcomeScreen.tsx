"use client";

import { useDemoTools } from "@/lib/gilgyeol/demo";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Mascot } from "./Mascot";
import { PrimaryButton } from "./ui";

export function WelcomeScreen() {
  const { actions } = useGilgyeol();
  const demo = useDemoTools();
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-3 pb-5">
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
      {/* The same stage as the landing hero: Alienie inside the haptic rings, filling the free space. */}
      <div aria-hidden="true" className="relative flex min-h-[200px] flex-1 items-center justify-center overflow-hidden rounded-[26px] bg-haptic-tint">
        <div className="absolute size-[236px] rounded-full border-2 border-[#DCD7F2]" />
        <div className="absolute size-[176px] rounded-full border-2 border-[#C9C1EC]" />
        <div className="absolute size-[116px] rounded-full border-2 border-[#B3A9E3]" />
        <Mascot pose="main" height={132} motion="bob" className="relative translate-y-2" />
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[34px] leading-none font-extrabold tracking-[-0.04em] text-brand">어디路</span>
          <span className="text-[13px] font-semibold text-muted">(어디로)</span>
        </div>
        <h1 className="m-0 text-[26px] leading-[1.3] font-extrabold tracking-[-0.025em] text-pretty">보지 않고 느끼며 찾는 실내 길</h1>
        <p className="m-0 text-[16px] leading-[1.55] text-pretty text-muted">주변 표지와 진동·음성 안내로 건물 안 목적지를 찾아가요.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <PrimaryButton tall onClick={() => actions.go("building")}>
          길찾기 시작
        </PrimaryButton>
        <div className="text-center text-[14px] text-muted">현재는 우정정보관 데모를 지원해요.</div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex">
          <button type="button" onClick={() => actions.go("landing")} className="h-11 flex-1 rounded-xl border-none bg-transparent text-[14px] font-semibold text-ink">
            서비스 소개
          </button>
          <span aria-hidden="true" className="my-3 w-px bg-line" />
          <button type="button" onClick={() => actions.go("editor")} className="h-11 flex-1 rounded-xl border-none bg-transparent text-[14px] font-semibold text-ink">
            지도 만들기 (관리자)
          </button>
        </div>
        <p className="m-0 text-center text-[12px] leading-normal text-muted">일상 길찾기 도구예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.</p>
      </div>
    </div>
  );
}
