"use client";

import { C } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { GuideMode } from "@/lib/gilgyeol/types";
import { BackHeader, Notice, PrimaryButton, Title } from "./ui";

const MODES: { k: GuideMode; label: string; sub: string; rec: boolean }[] = [
  { k: "both", label: "진동 + 음성", sub: "방향 펄스와 음성 안내를 함께 받아요", rec: true },
  { k: "voice", label: "음성만", sub: "진동 없이 음성과 화면으로 안내해요", rec: false },
  { k: "screen", label: "화면 안내만", sub: "소리·진동 없이 화면 문구로 안내해요", rec: false },
];

const CTA: Record<GuideMode, string> = { both: "진동·음성 안내 시작", voice: "음성 안내 시작", screen: "화면 안내 시작" };

export function ModeScreen() {
  const { state: s, actions } = useGilgyeol();
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      <BackHeader label="안내 방식" onBack={actions.back} />
      <Title>어떻게 안내할까요?</Title>
      <div role="radiogroup" aria-label="안내 방식" className="flex flex-col gap-2.5">
        {MODES.map((m) => {
          const on = s.mode === m.k;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              key={m.k}
              onClick={() => actions.setMode(m.k)}
              className="flex items-center gap-3.5 rounded-[18px] border-2 bg-surface px-[18px] py-4 text-left"
              style={{ borderColor: on ? C.brand : C.border }}
            >
              <span className="flex size-[22px] flex-none items-center justify-center rounded-full border-2" style={{ borderColor: on ? C.brand : C.border }}>
                <span className="size-2.5 rounded-full" style={{ background: on ? C.brand : "transparent" }} />
              </span>
              <span className="flex flex-1 flex-col gap-[3px]">
                <span className="text-[17px] font-bold text-ink">{m.label}</span>
                <span className="text-[14px] leading-[1.4] text-muted">{m.sub}</span>
              </span>
              {m.rec && <span className="flex-none rounded-md bg-warm-panel px-2 py-[3px] text-[12px] font-bold text-ink">기본</span>}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={actions.testVibe} className="h-[52px] rounded-2xl border-none bg-haptic-tint text-[16px] font-bold text-haptic-ink">
        짧은 진동 테스트
      </button>
      {s.mode === "both" && !actions.canVibe() && <Notice tone="warn">이 기기에서는 진동 안내를 사용할 수 없어 음성으로 안내합니다</Notice>}
      <div className="flex-1" />
      <PrimaryButton onClick={actions.beginTrip}>{CTA[s.mode]}</PrimaryButton>
    </div>
  );
}
