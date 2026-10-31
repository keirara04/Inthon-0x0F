"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";

/** Presenter shortcuts and fallback-state simulations. Not part of the end-user flow. */
export function DemoPanel({ compact }: { compact?: boolean }) {
  const { state: s, actions } = useGilgyeol();
  const is = (k: typeof s.screen) => s.screen === k;
  const scanIs = (t: typeof s.scanTarget) => is("scan") && s.scanTarget === t;

  const steps: { label: string; cur: boolean; go: () => void }[] = [
    { label: "안내도 촬영·분석", cur: is("captureIntro") || is("mapResult") || scanIs("map"), go: () => actions.openScan("map") },
    { label: "“여기 계신가요?” 확인", cur: is("start"), go: () => actions.go("start", { start: "here", locEdit: false }) },
    { label: "405호 검색", cur: is("search"), go: () => actions.go("search", { query: "405", cat: null, floorPick: null }) },
    { label: "경로·안내 방식", cur: is("preview") || is("mode"), go: () => actions.go("preview", { dest: actions.ensureDest() }) },
    {
      label: "방향 탐색 진동",
      cur: is("guide") && s.step === 0,
      go: () => {
        actions.startGuide(0);
        actions.setDir("near");
      },
    },
    { label: "엘리베이터·4층 확인", cur: is("elevator") || scanIs("floor4"), go: actions.toElevator },
    {
      label: "반대 복도 이탈",
      cur: (is("offroute") && s.offState !== "confirm") || (is("guide") && s.step === 1),
      go: () => {
        actions.update({ step: 1, dest: actions.ensureDest() });
        actions.toOffroute();
      },
    },
    {
      label: "표지 재확인·복구",
      cur: scanIs("sign") || (is("offroute") && s.offState === "confirm") || (is("guide") && s.step === 2),
      go: () => {
        actions.update({ screen: "offroute", offState: "alert" });
        actions.openScan("sign");
      },
    },
    {
      label: "405호 도착",
      cur: is("arrive") || scanIs("door"),
      go: () => {
        actions.update({ screen: "guide", step: 1 });
        actions.openScan("door");
      },
    },
    { label: "지도 만들기·그래프 편집", cur: is("editor"), go: () => actions.go("editor") },
  ];

  const alts: { label: string; on: boolean; toggle: () => void }[] = [
    { label: "진동 미지원 기기", on: s.simNoVibe, toggle: () => actions.update({ simNoVibe: !s.simNoVibe }) },
    {
      label: "카메라 권한 거부",
      on: s.camDenied,
      toggle: () => actions.update({ camDenied: !s.camDenied, ...(is("scan") ? { scanState: s.camDenied ? "aim" : "denied" } : {}) }),
    },
    { label: "승강기 정차 미확인", on: s.elevUnverified, toggle: () => actions.update({ elevUnverified: !s.elevUnverified }) },
    {
      label: "방향 센서 불안정",
      on: s.dir === "unstable" && is("guide"),
      toggle: () => {
        if (!is("guide")) actions.startGuide(s.step);
        actions.setDir(s.dir === "unstable" && is("guide") ? "far" : "unstable");
      },
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {!compact && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[22px] font-extrabold tracking-[-0.03em] text-brand">길결 · 시연 패널</div>
          <p className="m-0 text-[13px] leading-[1.55] text-muted">카메라 인식·OCR·방향 센서는 모두 데모 입력이며, 진동과 음성은 기기가 지원하면 실제로 동작합니다.</p>
        </div>
      )}
      <nav className="flex flex-col gap-1.5" aria-label="시연 순서">
        <div className="text-[12px] font-bold text-muted">시연 순서</div>
        {steps.map((d, i) => (
          <button
            type="button"
            key={d.label}
            onClick={d.go}
            aria-current={d.cur ? "step" : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-xl border-none px-3 text-left text-[14px] font-semibold text-ink ${d.cur ? "bg-surface" : "bg-transparent"}`}
          >
            <span className={`flex size-[22px] flex-none items-center justify-center rounded-full text-[11px] font-extrabold ${d.cur ? "bg-brand text-white" : "bg-black/8 text-ink"}`}>{i + 1}</span>
            {d.label}
          </button>
        ))}
      </nav>
      <div className="flex flex-col gap-1.5">
        <div className="text-[12px] font-bold text-muted">대체 상태</div>
        {alts.map((t) => (
          <button
            type="button"
            role="switch"
            aria-checked={t.on}
            key={t.label}
            onClick={t.toggle}
            className="flex min-h-11 items-center justify-between rounded-xl border-none bg-white/60 px-3 text-left text-[14px] font-semibold text-ink"
          >
            {t.label}
            <span className={`text-[12px] font-extrabold ${t.on ? "text-brand" : "text-muted"}`}>{t.on ? "켜짐" : "꺼짐"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
