"use client";

import { useState } from "react";
import { BUILDING, C, DEMO_1F_GRAPH } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { graphFrame } from "./MapSketch";
import { MapViewer } from "./MapViewer";
import { BackHeader, Badge, PrimaryButton, SecondaryButton, StatusDot, Title } from "./ui";

const TYPE_LABEL: Record<string, string> = { room: "호실", stairs: "계단", elevator_hall: "엘리베이터", exit: "비상구", entrance: "출입구" };

export function MapResultScreen() {
  const { state, actions } = useGilgyeol();
  const g = state.mapDemo ? null : state.parsed;
  // Demo and sample paths draw the 1F demo floor in the same style, without a photo.
  const shown = g ?? DEMO_1F_GRAPH;
  const photo = g ? state.parsedPhoto : null;
  const frame = graphFrame(shown, photo);
  const [sel, setSel] = useState<string | null>(null);
  const picked = sel ? shown.nodes.find((n) => n.id === sel) : undefined;
  const links = picked ? shown.edges.filter((e) => e.a === picked.id || e.b === picked.id).length : 0;
  const rooms = shown.nodes.filter((n) => n.type === "room").length;
  const current = shown.nodes.find((n) => n.id === shown.current_node_id);
  const badge = state.mapDemo ? "데모 안내도" : g ? "AI 초안 · 검수 전" : "샘플 결과";
  const stats: [string, string, boolean][] = [
    ["호실", `${rooms}개`, rooms > 0],
    ["계단·승강기", `${shown.nodes.filter((n) => n.type === "stairs" || n.type === "elevator_hall").length}곳`, true],
    ["현위치", current ? "찾음" : "못 찾음", !!current],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 px-5 pt-1 pb-3">
        <BackHeader label="안내도 인식 결과" onBack={actions.back} />
        <div className="flex items-center justify-between gap-3">
          <Title className="text-[24px]">안내도를 읽었어요</Title>
          <Badge tone="warn" className="flex-none self-center">
            {badge}
          </Badge>
        </div>
      </div>

      <div className="relative min-h-[300px] flex-1 border-y border-line">
        <MapViewer
          g={shown}
          frame={frame}
          photo={photo}
          selected={sel}
          onSelect={setSel}
          label={`${g ? "AI가 읽은" : "데모"} ${(shown.floor || "1F").replace("F", "층")} 지도. 호실 ${rooms}개. 드래그로 이동, 두 손가락으로 확대`}
        />
      </div>

      <div className="flex flex-col gap-3 px-5 pt-3.5 pb-5">
        {picked ? (
          <div role="status" className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] font-semibold text-muted">
                {TYPE_LABEL[picked.type] ?? "지점"} · 복도 연결 {links}곳
              </span>
              <span className="truncate text-[18px] font-extrabold">{picked.label}</span>
            </div>
            <button type="button" onClick={() => setSel(null)} className="h-10 flex-none rounded-[10px] border-[1.5px] border-edge bg-surface px-3 text-[13px] font-semibold text-ink">
              닫기
            </button>
          </div>
        ) : (
          <dl className="m-0 grid grid-cols-3 gap-2">
            {stats.map(([k, v, ok]) => (
              <div key={k} className="flex flex-col gap-0.5 rounded-2xl bg-surface px-3 py-2.5">
                <dt className="text-[12px] text-muted">{k}</dt>
                <dd className={`m-0 flex items-center gap-1.5 text-[16px] font-bold ${ok ? "text-ink" : "text-warning"}`}>
                  <StatusDot color={ok ? C.success : C.warning} dashed={!ok} />
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="m-0 text-[12px] leading-normal text-muted">
          {g
            ? `${BUILDING} ${(g.floor || "1F").replace("F", "층")}으로 가정했어요. 길 안내는 검수된 건물 지도로 하고, 현재 위치는 다음 화면에서 확인해요.`
            : "데모 안내도예요. 현재 위치는 다음 화면에서 확인해요."}
        </p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          {/* Keep the start the parse suggested; the demo/sample path starts at the 현위치 marker as before. */}
          <PrimaryButton data-trial="map-confirm" onClick={() => actions.go("start", { ...(g ? {} : { start: "here" }), locEdit: !!g && !state.start, landmarks: false })}>이 안내도가 맞아요</PrimaryButton>
          <SecondaryButton className="h-[58px] px-4" onClick={() => actions.openScan("map")}>
            다시 촬영
          </SecondaryButton>
        </div>
      </div>
    </div>
  );
}
