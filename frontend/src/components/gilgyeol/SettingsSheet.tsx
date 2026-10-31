"use client";

import { useEffect, useRef } from "react";
import { PATTERNS } from "@/lib/gilgyeol/data";
import { supportsSpeech, supportsVibration } from "@/lib/gilgyeol/feedback";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { HapticPattern } from "@/lib/gilgyeol/types";
import { useDemoTools } from "@/lib/gilgyeol/demo";
import { DemoPanel } from "./DemoPanel";

export function SettingsSheet() {
  const { state: s, actions, compass } = useGilgyeol();
  const close = () => actions.update({ sheet: false });
  const dialogRef = useRef<HTMLDivElement>(null);
  const demo = useDemoTools();

  useEffect(() => {
    // preventScroll: the sheet starts off-screen (slide-up animation); a plain focus() would scroll the device screen.
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && actions.update({ sheet: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  const toggles = [
    { label: "진동 안내", sub: "방향·회전·층 이동·도착·이탈", on: s.vibe, toggle: () => actions.update({ vibe: !s.vibe }) },
    { label: "음성 안내", sub: s.koVoice === false ? "이 기기에서 한국어 음성을 찾지 못했어요" : "한국어 음성으로 다음 행동을 읽어요", on: s.voice, toggle: actions.toggleVoice },
    { label: "방향 소리", sub: "돌아야 할 쪽 귀에서 짧은 소리 · 이어폰 권장", on: s.beep, toggle: () => actions.update({ beep: !s.beep }) },
  ];

  return (
    <div className="gl-backdrop absolute inset-0 z-[7] flex flex-col justify-end bg-[rgba(20,22,20,.45)]" onClick={close}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="안내 설정"
        onClick={(e) => e.stopPropagation()}
        className="gl-sheet flex max-h-[88%] flex-col gap-3.5 overflow-auto rounded-t-[26px] bg-app-bg px-5 pt-5 pb-[calc(30px+env(safe-area-inset-bottom))] outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[20px] font-extrabold">안내 설정</h2>
          <button type="button" onClick={close} className="h-11 border-none bg-transparent px-3 text-[15px] font-semibold text-ink">
            닫기
          </button>
        </div>
        <div className="flex flex-col rounded-2xl bg-surface px-4">
          {toggles.map((t) => (
            <button
              type="button"
              role="switch"
              aria-checked={t.on}
              key={t.label}
              onClick={t.toggle}
              className="flex min-h-[60px] items-center justify-between border-0 border-b border-divider bg-transparent p-0 text-left last:border-b-0"
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[16px] font-semibold text-ink">{t.label}</span>
                <span className="text-[12px] text-muted">{t.sub}</span>
              </span>
              <span className={`relative h-[30px] w-[50px] flex-none rounded-[15px] transition-colors duration-[180ms] ${t.on ? "bg-brand" : "bg-[#CFCAC0]"}`}>
                <span
                  className="absolute top-[3px] size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)] transition-[left] duration-[180ms]"
                  style={{ left: t.on ? 23 : 3 }}
                />
              </span>
            </button>
          ))}
        </div>
        {!supportsSpeech() && <div className="text-[13px] leading-normal text-warn-ink">이 브라우저는 음성 합성을 지원하지 않아요. 화면 문구로 안내합니다.</div>}
        {compass.calibrated && (
          <div className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-surface px-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-ink">방향 보정</span>
              <span className="text-[12px] text-muted">이 기기에 저장된 건물 방향 보정값</span>
            </span>
            <button
              type="button"
              onClick={() => {
                compass.resetCalibration();
                actions.toast("방향 보정을 초기화했어요");
              }}
              className="h-10 flex-none rounded-[10px] border-[1.5px] border-edge bg-surface px-3 text-[13px] font-semibold text-ink"
            >
              초기화
            </button>
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-bold text-muted">진동 테스트 · 패턴과 함께 음성·화면 안내도 제공돼요</div>
          <div className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {(Object.keys(PATTERNS) as HapticPattern[]).map((k) => (
              <div key={k} className="flex min-h-[54px] items-center justify-between border-b border-divider pr-2 pl-4 last:border-b-0">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{PATTERNS[k].name}</span>
                  <span className="text-[12px] text-muted">{PATTERNS[k].label}</span>
                </span>
                <button
                  type="button"
                  onClick={() => actions.playPattern(k)}
                  aria-label={`${PATTERNS[k].name} 진동 재생`}
                  className="h-10 rounded-[10px] border-none bg-haptic-tint px-3.5 text-[13px] font-bold text-haptic-ink"
                >
                  재생
                </button>
              </div>
            ))}
          </div>
          {!supportsVibration() && <div className="text-[13px] leading-normal text-warn-ink">이 브라우저는 진동을 지원하지 않아요. 음성과 화면으로 안내합니다.</div>}
        </div>
        {/* Admin tools live here instead of on the user's home screen. */}
        <div className="flex flex-col gap-2">
          <div className="text-[13px] font-bold text-muted">관리자</div>
          <button
            type="button"
            onClick={() => {
              close();
              actions.go("editor");
            }}
            className="flex min-h-[52px] items-center justify-between rounded-2xl border-none bg-surface px-4 text-left text-[15px] font-semibold text-ink"
          >
            <span className="flex flex-col gap-0.5">
              지도 만들기
              <span className="text-[12px] font-normal text-muted">안내도 사진으로 층 그래프 만들기 · 검수</span>
            </span>
            <span aria-hidden="true" className="text-[18px] text-muted">›</span>
          </button>
        </div>
        {demo && (
        <details className="gg-mobile-only rounded-2xl bg-warm-panel px-4 py-3">
          <summary className="min-h-8 cursor-pointer text-[14px] font-bold text-muted">시연 패널 (발표용)</summary>
          <div className="pt-3">
            <DemoPanel compact />
          </div>
        </details>
        )}
      </div>
    </div>
  );
}
