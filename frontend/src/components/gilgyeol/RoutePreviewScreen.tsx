"use client";

import { useState } from "react";
import { C, START_NODES } from "@/lib/gilgyeol/data";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import { FLOOR1, IsoPlane, ROUTE4, RotateButtons, floor4, useIsoRotation } from "./IsoFloor";
import { BackHeader, PrimaryButton } from "./ui";

/** 1F and 4F stacked, joined by the elevator shaft, with where each floor's data came from. */
function StackedRoute({ dest, mapDemo }: { dest: string; mapDemo: boolean }) {
  const iso = useIsoRotation();
  return (
    <div
      className="relative h-[340px] touch-none overflow-hidden rounded-2xl bg-[#FAF9F6] [perspective:900px]"
      role="img"
      aria-label={`1층에서 엘리베이터로 4층에 올라가 왼쪽 복도로 ${dest}까지 가는 3D 경로 도식`}
      {...iso.handlers}
    >
      <div className="absolute inset-x-0 top-[240px] h-0">
        <IsoPlane layout={FLOOR1} rot={iso.rot} dim scale={0.85} route={[{ x: 35, y: 84, w: 97, h: 7 }, { x: 31, y: 84, w: 8, h: 64 }]} />
      </div>
      <div className="absolute top-[100px] left-1/2 h-[140px] w-1 -translate-x-1/2 rounded bg-route" aria-hidden="true" />
      <div className="absolute inset-x-0 top-[100px] h-0">
        <IsoPlane layout={floor4(dest)} rot={iso.rot} route={ROUTE4} scale={0.85} />
      </div>
      <span className="absolute top-3 left-3 rounded-lg bg-surface px-2.5 py-1 text-[13px] font-bold text-ink">4F</span>
      <span className="absolute top-3 right-3 rounded-md bg-haptic-tint px-2 py-1 text-[11px] font-semibold text-haptic-ink">저장된 건물 데이터 · 시연용</span>
      <span className="absolute top-[200px] left-3 rounded-lg bg-surface px-2.5 py-1 text-[13px] font-bold text-muted">1F</span>
      <span className="absolute bottom-3 left-3 rounded-md bg-warn-tint px-2 py-1 text-[11px] font-semibold text-warn-ink">
        {mapDemo ? "데모 안내도" : "방금 촬영한 안내도"}
      </span>
      <RotateButtons setRot={iso.setRot} />
    </div>
  );
}

export function RoutePreviewScreen() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  const startNode = START_NODES.find((n) => n.id === s.start);
  const [view, setView] = useState<"floors" | "3d">("floors");

  const routeSteps: { t: string; badge?: string; tone?: "warn" | "cp" | "ok" }[] = s.steps.map((st) => ({
    t: `${st.floor} · ${st.title}`,
    badge:
      st.kind && st.kind !== "walk"
        ? (st.elevator ?? (st.kind === "stairs" ? "계단" : "층 이동"))
        : st.checkpoint
          ? "표지 확인"
          : undefined,
    tone: st.kind && st.kind !== "walk" ? (s.elevUnverified ? "warn" : "ok") : st.checkpoint ? "cp" : undefined,
  }));
  const departFloor = s.steps[0]?.floor ?? "1층";
  const arriveFloor = s.steps[s.steps.length - 1]?.floor ?? "4층";
  const badgeCls = { warn: "bg-warn-tint text-warn-ink", cp: "bg-haptic-tint text-haptic-ink", ok: "bg-ok-tint text-ok-ink" };

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="경로 미리보기" onBack={actions.back} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-[18px] bg-surface p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <div className="text-[12px] font-semibold text-muted">출발</div>
          <div className="text-[16px] font-bold">{startNode?.label ?? "—"}</div>
          <div className="text-[13px] text-muted">{departFloor}</div>
        </div>
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
          <line x1="1" y1="6" x2="19" y2="6" stroke={C.route} strokeWidth="2.2" />
          <polyline points="14,1 20,6 14,11" fill="none" stroke={C.route} strokeWidth="2.2" />
        </svg>
        <div className="flex flex-col gap-[3px] text-right">
          <div className="text-[12px] font-semibold text-muted">도착</div>
          <div className="text-[16px] font-bold text-brand">{d}</div>
          <div className="text-[13px] text-muted">{arriveFloor}</div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-bold">층별 경로</div>
        <div role="tablist" aria-label="경로 보기" className="flex gap-0.5 rounded-[10px] bg-[#ECEAE3] p-[3px]">
          {(["floors", "3d"] as const).map((v) => (
            <button
              type="button"
              role="tab"
              key={v}
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-9 min-w-[52px] rounded-lg border-none px-2 text-[13px] font-bold text-ink ${view === v ? "bg-surface" : "bg-transparent"}`}
            >
              {v === "floors" ? "2D" : "3D 보기"}
            </button>
          ))}
        </div>
      </div>
      {view === "3d" && <StackedRoute dest={d} mapDemo={s.mapDemo} />}
      <div className={`grid grid-cols-2 gap-2.5 ${view === "3d" ? "hidden" : ""}`}>
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
          <div className="text-[13px] font-bold">1층</div>
          <svg viewBox="0 0 150 90" className="h-auto w-full" role="img" aria-label="1층: 현위치에서 엘리베이터 홀까지">
            <g stroke="#EAE7DF" strokeWidth="10" strokeLinecap="round">
              <line x1="15" y1="40" x2="135" y2="40" />
              <line x1="75" y1="40" x2="75" y2="80" />
              <line x1="15" y1="15" x2="15" y2="75" />
            </g>
            <polyline points="15,75 15,40 75,40" fill="none" stroke={C.route} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="15" cy="75" r="6" fill={C.brand} />
            <rect x="68" y="33" width="14" height="14" rx="3" fill={C.route} />
          </svg>
          <div className="text-[12px] text-muted">현위치 → 엘리베이터 홀</div>
        </div>
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
          <div className="text-[13px] font-bold">4층</div>
          <svg viewBox="0 0 150 90" className="h-auto w-full" role="img" aria-label={`4층: 엘리베이터에서 왼쪽 복도로 ${d}까지`}>
            <g stroke="#EAE7DF" strokeWidth="10" strokeLinecap="round">
              <line x1="15" y1="45" x2="135" y2="45" />
            </g>
            <polyline points="75,45 15,45 15,22" fill="none" stroke={C.route} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="68" y="38" width="14" height="14" rx="3" fill={C.route} />
            <circle cx="45" cy="45" r="5" fill="#fff" stroke={C.haptic} strokeWidth="2.5" />
            <circle cx="15" cy="20" r="7" fill={C.brand} />
          </svg>
          <div className="text-[12px] text-muted">엘리베이터 → 왼쪽 복도 → {d}</div>
        </div>
      </div>
      <div className="rounded-[18px] bg-surface px-[18px] py-1.5">
      <h2 id="gg-steps-title" className="m-0 border-b border-divider pt-3 pb-2.5 text-[17px] font-bold">
        {d}까지 {routeSteps.length}단계
      </h2>
      <ol className="m-0 flex list-none flex-col p-0" aria-labelledby="gg-steps-title">
        {routeSteps.map((p, i) => (
          <li key={p.t} className="flex items-start gap-3.5 border-b border-divider py-3 last:border-b-0">
            <div className="flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: i === routeSteps.length - 1 ? C.brand : C.route }}>
              {i + 1}
            </div>
            <div className="flex flex-col gap-1 pt-[3px]">
              <div className="text-[16px] font-semibold">{p.t}</div>
              {p.badge && p.tone && <div className={`self-start rounded-md px-2 py-[3px] text-[12px] font-bold ${badgeCls[p.tone]}`}>{p.badge}</div>}
            </div>
          </li>
        ))}
      </ol>
      </div>
      <p className="m-0 text-[13px] leading-normal text-muted">
        {s.route ? `총 ${s.route.total_m}m · ` : ""}예상 시간은 아직 측정하지 않았어요.
      </p>
      <PrimaryButton tall onClick={() => actions.go("mode")}>
        안내 방식 선택
      </PrimaryButton>
    </div>
  );
}
