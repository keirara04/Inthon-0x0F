"use client";

import { useEffect, useMemo, useState } from "react";
import type { ApiRoute } from "@/types/api";
import { fetchFloorGraph, type ParsedGraph } from "@/lib/gilgyeol/api";
import { C } from "@/lib/gilgyeol/data";
import { ALIGNED_DEG } from "@/lib/gilgyeol/navMath";
import { Floor3DLazy } from "./Floor3DLazy";
import { MapBox, MapSketch, graphFrame } from "./MapSketch";

/**
 * Live map for the current walk step: the floor from the verified graph, you at the last confirmed point,
 * a cone that turns with the phone, and the step's path. The path turns green when you face it.
 * Position only moves when a step is confirmed (no indoor positioning); the facing direction is live.
 */
export function LiveMap({ route, stepIndex, heading, delta }: { route: ApiRoute; stepIndex: number; heading: number | null; delta: number | null }) {
  const step = route.steps[stepIndex];
  const floor = step?.floor ?? "";
  const [loaded, setLoaded] = useState<{ floor: string; g: ParsedGraph | null } | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");

  useEffect(() => {
    let alive = true;
    void fetchFloorGraph(floor).then((g) => alive && setLoaded({ floor, g }));
    return () => {
      alive = false;
    };
  }, [floor]);
  const g = loaded?.floor === floor ? loaded.g : null;

  // Nodes of this step in walking order (route.path holds every node; slice from the step's start to its end).
  const stepPath = useMemo(() => {
    if (!step) return [];
    const a = route.path.indexOf(step.from);
    const b = route.path.indexOf(step.to, Math.max(0, a));
    return a >= 0 && b >= a ? route.path.slice(a, b + 1) : [step.from, step.to];
  }, [route.path, step]);
  // 3D draws you at current_node_id; the floor endpoint has none, so point it at the step's start.
  const levels3d = useMemo(() => (g && step ? [{ label: floor, g: { ...g, current_node_id: step.from }, route: stepPath }] : []), [g, floor, step, stepPath]);

  if (!step || step.kind !== "walk" || !g) return null;
  const frame = graphFrame(g);
  const at = new Map(g.nodes.map((n) => [n.id, n]));
  const me = at.get(step.from);
  const pts = stepPath.map((id) => at.get(id)).filter((n) => n !== undefined).map((n) => frame.pt(n!));
  if (!me || pts.length < 2) return null;

  const aligned = delta !== null && Math.abs(delta) <= ALIGNED_DEG;
  const p = frame.pt(me);
  const k = frame.k;
  // Cone: map up is north (after calibration), so heading h points along (sin h, -cos h).
  const cone =
    heading === null
      ? null
      : (() => {
          const r = 46 * k;
          const at = (deg: number) => {
            const a = (deg * Math.PI) / 180;
            return `${p.x + Math.sin(a) * r} ${p.y - Math.cos(a) * r}`;
          };
          return `M${p.x} ${p.y} L${at(heading - 28)} A${r} ${r} 0 0 1 ${at(heading + 28)} Z`;
        })();
  const pathColor = aligned ? C.success : C.haptic; // corridors are route-blue; the step stands apart

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-bold">
          {floor.replace("F", "층")} 지도 <span className="font-medium text-muted">· 마지막 확인 위치 기준</span>
        </div>
        <div role="radiogroup" aria-label="지도 보기" className="flex gap-0.5 rounded-[10px] bg-[#F0EEE8] p-[3px]">
          {(["2d", "3d"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`h-9 min-w-11 rounded-lg border-none px-2 text-[13px] font-bold text-ink ${view === v ? "bg-surface" : "bg-transparent"}`}
            >
              {v === "2d" ? "2D" : "3D"}
            </button>
          ))}
        </div>
      </div>
      {view === "3d" ? (
        <div className="relative h-[290px] overflow-hidden rounded-xl bg-[#FAF9F6]">
          <Floor3DLazy levels={levels3d} heading={heading} hint="돌려보기 · 원뿔 = 내가 보는 방향" />
        </div>
      ) : (
        <MapBox frame={frame} label={`${floor} 지도. 현재 위치에서 ${step.to_label}까지 경로${aligned ? ", 방향 맞음" : ""}`} maxH={290}>
          <MapSketch g={g} frame={frame} />
          <svg viewBox={`${frame.box.x} ${frame.box.y} ${frame.box.w} ${frame.box.h}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
            {/* This step's path; dashed until you face it, then solid green. */}
            <polyline
              points={pts.map((q) => `${q.x},${q.y}`).join(" ")}
              fill="none"
              stroke={pathColor}
              strokeWidth={9 * k}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={aligned ? undefined : `${10 * k} ${8 * k}`}
              className="transition-[stroke] duration-200"
            />
            <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={7 * k} fill="#fff" stroke={pathColor} strokeWidth={3 * k} />
            {cone && <path d={cone} fill={aligned ? C.success : C.route} fillOpacity={0.28} className="transition-[d] duration-150 ease-out" />}
            <circle cx={p.x} cy={p.y} r={16 * k} fill="none" stroke={C.brand} strokeWidth={2.5 * k} className="gg-pulse" style={{ animationDuration: "1.8s", transformBox: "fill-box", transformOrigin: "center" }} />
            <circle cx={p.x} cy={p.y} r={8 * k} fill={C.brand} stroke="#fff" strokeWidth={3 * k} />
          </svg>
          {heading === null && (
            <div className="absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-muted">방향 센서 없음 · 위치와 경로만 표시</div>
          )}
        </MapBox>
      )}
    </div>
  );
}
