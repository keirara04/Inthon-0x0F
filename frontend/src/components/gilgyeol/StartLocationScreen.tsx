"use client";

import { useState } from "react";
import { C, START_NODES } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { StartNodeId } from "@/lib/gilgyeol/types";
import { FLOOR1, IsoPlane, RotateButtons, pct, useIsoRotation } from "./IsoFloor";
import { BackHeader, Badge, Placeholder, PrimaryButton, SecondaryButton, Title } from "./ui";

/** Start nodes positioned on the 3D floor plane. */
const NODE_3D: Record<StartNodeId, { x: number; y: number }> = {
  here: { x: 35, y: 148 },
  stair: { x: 35, y: 46 },
  hall: { x: 132, y: 87 },
  main: { x: 132, y: 186 },
};

export function StartLocationScreen() {
  const { state: s, actions } = useGilgyeol();
  const startNode = START_NODES.find((n) => n.id === s.start);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const iso = useIsoRotation();

  const pickOnMap = (id: StartNodeId) =>
    s.locEdit ? actions.update({ start: id, locEdit: false }) : actions.toast("‘위치 수정’을 누르면 다른 지점을 고를 수 있어요");

  const summary = startNode ? `1층 ${startNode.label}${s.locEdit ? " · 선택 중" : " · 추정 위치"}` : "아직 위치를 고르지 않았어요";

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="시작 준비 · 3 / 3" onBack={actions.back} />
      <div className="flex flex-col gap-1.5">
        <Title className="leading-[1.25]">여기 계신가요?</Title>
        <p className="m-0 text-[15px] leading-normal text-muted">
          {s.locEdit ? "안내도에서 지금 있는 지점을 눌러주세요." : "안내도의 ‘현재 위치’ 표시를 기준으로 추정했어요. 다르면 위치를 수정해 주세요."}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <Badge tone="warn">{s.mapDemo ? "데모 안내도 · 검수 전" : "방금 읽은 안내도 · 검수 전"}</Badge>
        <div role="tablist" aria-label="지도 보기" className="flex gap-0.5 rounded-[10px] bg-[#ECEAE3] p-[3px]">
          {(["2d", "3d"] as const).map((v) => (
            <button
              type="button"
              role="tab"
              key={v}
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`h-9 min-w-[52px] rounded-lg border-none px-2 text-[13px] font-bold text-ink ${view === v ? "bg-surface" : "bg-transparent"}`}
            >
              {v === "2d" ? "안내도" : "3D 보기"}
            </button>
          ))}
        </div>
      </div>
      {view === "3d" && (
        <div
          className="relative mx-auto h-[300px] w-[330px] max-w-full touch-none overflow-hidden rounded-[18px] border border-line bg-[#FAF9F6] [perspective:800px]"
          {...iso.handlers}
        >
          <IsoPlane layout={FLOOR1} rot={iso.rot}>
            {START_NODES.map((n) => {
              const on = s.start === n.id;
              const p = NODE_3D[n.id];
              return (
                <button
                  type="button"
                  key={n.id}
                  aria-pressed={on}
                  aria-label={`${n.label}${on ? " (선택됨)" : ""}`}
                  onClick={() => pickOnMap(n.id)}
                  className="absolute -mt-[18px] -ml-[18px] flex size-9 items-center justify-center rounded-full border-[3px] p-0"
                  style={{ ...pct(p.x, p.y), borderColor: on ? C.brand : C.ink, background: on ? "rgba(122,24,50,.25)" : "#fff" }}
                >
                  <span className="size-3 rounded-full" style={{ background: on ? C.brand : C.ink }} />
                </button>
              );
            })}
          </IsoPlane>
          <div className="pointer-events-none absolute top-2.5 left-2.5 rounded-lg bg-white/90 px-2.5 py-[5px] text-[12px] font-semibold text-muted">드래그해서 돌려보기</div>
          {startNode && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-brand px-2.5 py-1 text-[12px] font-bold text-white">
              {s.locEdit ? "현재 위치" : "현재 위치 · 추정"} · {startNode.label}
            </div>
          )}
          <RotateButtons setRot={iso.setRot} />
        </div>
      )}
      <div className={`gg-hatch relative mx-auto h-[260px] w-[330px] max-w-full overflow-hidden rounded-[18px] border border-line ${view === "3d" ? "hidden" : ""}`}>
        <svg width="330" height="260" viewBox="0 0 330 260" className="absolute inset-0" aria-hidden="true">
          <g stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round">
            <line x1="44" y1="112" x2="292" y2="112" />
            <line x1="167" y1="112" x2="167" y2="216" />
            <line x1="44" y1="62" x2="44" y2="194" />
          </g>
        </svg>
        <Placeholder label="1층 피난안내도 이미지 자리 · 데모 도식" />
        {START_NODES.map((n) => {
          const on = s.start === n.id;
          const tag = on ? (s.locEdit ? "현재 위치" : "현재 위치 · 추정") : n.label;
          return (
            <div key={n.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${n.label}${on ? " (선택됨)" : ""}`}
                onClick={() => pickOnMap(n.id)}
                className="absolute -mt-[22px] -ml-[22px] flex size-11 items-center justify-center rounded-full border-[3px] p-0 shadow-[0_2px_6px_rgba(0,0,0,.12)]"
                style={{ left: n.x, top: n.y, borderColor: on ? C.brand : C.ink, background: on ? C.brand : "#fff" }}
              >
                <span className="size-2.5 rounded-full" style={{ background: on ? "#fff" : C.ink }} />
              </button>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 rounded-md px-[7px] py-[3px] text-[12px] font-bold whitespace-nowrap"
                style={{ left: n.x, top: n.y + (n.y > 200 ? -50 : 26), color: on ? "#fff" : C.ink, background: on ? C.brand : "rgba(255,255,255,.92)" }}
              >
                {tag}
              </div>
            </div>
          );
        })}
      </div>
      <div role="status" className={`text-[15px] font-semibold ${startNode ? (s.locEdit ? "text-brand" : "text-warning") : "text-muted"}`}>
        {summary}
      </div>
      <div className="flex flex-col gap-2">
        <SecondaryButton aria-pressed={s.locEdit} onClick={() => actions.update({ locEdit: !s.locEdit })}>
          {s.locEdit ? "수정 취소" : "위치 수정"}
        </SecondaryButton>
        <SecondaryButton aria-expanded={s.landmarks} onClick={() => actions.update({ landmarks: !s.landmarks })}>
          층·랜드마크 직접 선택
        </SecondaryButton>
        {s.landmarks && (
          <div className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {START_NODES.map((n) => (
              <button
                type="button"
                key={n.id}
                aria-pressed={s.start === n.id}
                onClick={() => actions.update({ start: n.id, locEdit: false, landmarks: false })}
                className="flex min-h-[52px] items-center justify-between border-0 border-b border-divider bg-surface px-4 text-left text-[16px] text-ink"
              >
                1층 {n.label}
                <span className="text-[13px] font-bold text-brand">{s.start === n.id ? "선택됨" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <PrimaryButton disabled={!s.start} onClick={() => s.start && actions.go("search", { query: "", cat: null, floorPick: null })}>
        맞아요, 계속하기
      </PrimaryButton>
    </div>
  );
}
