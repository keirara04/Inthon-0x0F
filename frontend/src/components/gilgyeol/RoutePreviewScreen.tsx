"use client";

import { useMemo, useState } from "react";
import type { ParsedGraph } from "@/lib/gilgyeol/api";
import { C, DEMO_1F_GRAPH, EXAMPLE_4F_GRAPH, START_NODES } from "@/lib/gilgyeol/data";
import { floorName } from "@/lib/gilgyeol/floorTransition";
import { routeSummary } from "@/lib/gilgyeol/routeSummary";
import { shortestPath } from "@/lib/gilgyeol/geometry";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import type { StartNodeId } from "@/lib/gilgyeol/types";
import { Floor3DLazy } from "./Floor3DLazy";
import { startNode as nodeFor } from "./MapSketch";
import { BackHeader, PrimaryButton } from "./ui";

/**
 * 1F and the real 4F (traced from the 우정정보관 sign) stacked in 3D, joined at the elevator, with the
 * route as a tube. Display only: the steps below come from the verified graph via /api/route.
 */
function StackedRoute({ dest, start, parsed }: { dest: string; start: StartNodeId | null; parsed: ParsedGraph | null }) {
  const levels = useMemo(() => {
    const g1 = parsed && (parsed.floor || "1F") === "1F" ? parsed : DEMO_1F_GRAPH;
    const from = (start && nodeFor(g1, start)) || g1.nodes.find((n) => n.id === g1.current_node_id);
    const elev1 = g1.nodes.find((n) => n.type === "elevator_hall");
    const route1 = from && elev1 ? shortestPath(g1.nodes, g1.edges, from.id, elev1.id) : [];
    const g4 = EXAMPLE_4F_GRAPH;
    const key = dest.replace(/호.*$/, "");
    const to = g4.nodes.find((n) => n.type === "room" && n.label.replace(/호.*$/, "") === key);
    const elev4 = g4.nodes.find((n) => n.type === "elevator_hall");
    const route4 = elev4 && to ? shortestPath(g4.nodes, g4.edges, elev4.id, to.id) : elev4 ? [elev4.id] : [];
    return [
      { label: "1F", g: g1, route: route1.length ? route1 : from && elev1 ? [from.id, elev1.id] : [] },
      { label: "4F", g: g4, route: route4 },
    ];
  }, [dest, start, parsed]);
  return (
    <div className="relative h-[360px] overflow-hidden rounded-2xl border border-line bg-[#FAF9F6]">
      <Floor3DLazy levels={levels} hint={`1층 → 엘리베이터 → 4층 ${dest}`} />
      {/* The picture is a traced diagram; the steps below come from the verified graph and can differ. */}
      <span className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-haptic-tint px-2 py-1 text-[11px] font-semibold text-haptic-ink">3D 도식 · 안내 단계는 검수된 지도 기준</span>
    </div>
  );
}

export function RoutePreviewScreen() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  const startNode = START_NODES.find((n) => n.id === s.start);
  const [view, setView] = useState<"floors" | "3d">("3d");

  const arrow = { left: "↰ 왼쪽", right: "↱ 오른쪽", back: "↶ 뒤로", straight: "↑ 직진" };
  const routeSteps: { t: string; floor?: string; meta?: string; badge?: string; tone?: "warn" | "cp" | "ok" }[] = s.steps.map((st, i) => ({
    t: st.title,
    // Floor only where it changes, so a one-floor route isn't "1층 ·" on every row.
    floor: i === 0 || st.floor !== s.steps[i - 1].floor ? st.floor : undefined,
    meta: [st.turnDir ? arrow[st.turnDir] : "", st.lengthM ? `약 ${Math.max(1, Math.round(st.lengthM))}m` : ""].filter(Boolean).join(" · ") || undefined,
    badge:
      st.kind && st.kind !== "walk"
        ? (st.elevator ?? (st.kind === "stairs" ? "계단" : "층 이동"))
        : st.checkpoint
          ? `${st.checkpoint.kind === "room_no" ? `${st.checkpoint.text}호` : st.checkpoint.text} 표지 확인`
          : undefined,
    tone: st.kind && st.kind !== "walk" ? (s.elevUnverified ? "warn" : "ok") : st.checkpoint ? "cp" : undefined,
  }));
  const summary = s.route ? routeSummary(s.route) : null;
  const arriveFloor = summary ? floorName(summary.arrivalFloor) : `${s.dest?.floor ?? 1}층`;
  const departFloor = summary ? floorName(summary.departureFloor) : s.steps[0]?.floor ?? arriveFloor;
  const alreadyThere = summary?.alreadyThere ?? false;
  // The 2D/3D diagrams are drawn for the 1F -> 4F demo route only; hide them for any other route rather than show a wrong map.
  const showFloorMap = departFloor === "1층" && arriveFloor === "4층";
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
      {showFloorMap && (
        <>
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
              className={`h-11 min-w-[52px] rounded-lg border-none px-2 text-[13px] font-bold text-ink ${view === v ? "bg-surface" : "bg-transparent"}`}
            >
              {v === "floors" ? "2D" : "3D 보기"}
            </button>
          ))}
        </div>
      </div>
      {view === "3d" && <StackedRoute dest={d} start={s.start} parsed={s.mapDemo ? null : s.parsed} />}
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
        </>
      )}
      <div className="rounded-[18px] bg-surface px-[18px] py-1.5">
      <h2 id="gg-steps-title" className="m-0 border-b border-divider pt-3 pb-2.5 text-[17px] font-bold">
        {alreadyThere ? "이미 목적지에 있어요" : `${d}까지 ${routeSteps.length}단계`}
      </h2>
      {alreadyThere && <p className="m-0 py-4 text-[16px] leading-normal text-muted">현재 위치가 {d}예요. 이동하거나 층을 바꿀 필요가 없어요.</p>}
      <ol className="m-0 flex list-none flex-col p-0" aria-labelledby="gg-steps-title">
        {routeSteps.map((p, i) => (
          <li key={i} className="flex items-start gap-3.5 border-b border-divider py-3 last:border-b-0">
            <div className="flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: i === routeSteps.length - 1 ? C.brand : C.route }}>
              {i + 1}
            </div>
            <div className="flex flex-col gap-1 pt-[3px]">
              {p.floor && <div className="text-[12px] font-bold text-muted">{p.floor}</div>}
              <div className="text-[16px] font-semibold">{p.t}</div>
              {p.meta && <div className="text-[13px] text-muted">{p.meta}</div>}
              {p.badge && p.tone && <div className={`self-start rounded-md px-2 py-[3px] text-[12px] font-bold ${badgeCls[p.tone]}`}>{p.badge}</div>}
            </div>
          </li>
        ))}
      </ol>
      </div>
      <p className="m-0 text-[13px] leading-normal text-muted">
        {s.route ? `총 ${s.route.total_m}m · ` : ""}예상 시간은 아직 측정하지 않았어요.
      </p>
      <PrimaryButton tall onClick={() => alreadyThere ? actions.beginTrip() : actions.go("mode")}>
        {alreadyThere ? "도착 확인" : "안내 방식 선택"}
      </PrimaryButton>
    </div>
  );
}
