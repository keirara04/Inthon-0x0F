"use client";

import { useMemo, useState } from "react";
import { currentMapFloor } from "@/lib/gilgyeol/confirmedMaps";
import { startPoints } from "@/lib/gilgyeol/api";
import { C, DEMO_1F_GRAPH, NODE_TYPES, START_NODES } from "@/lib/gilgyeol/data";
import type { ApiStartFloor } from "@/types/api";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { StartNodeId } from "@/lib/gilgyeol/types";
import { Floor3DLazy } from "./Floor3DLazy";
import { MapBox, MapSketch, graphFrame, parsedSpot, startNode as nodeFor } from "./MapSketch";
import { PinMap } from "./PinMap";
import { BackHeader, Badge, PrimaryButton, SecondaryButton, Title } from "./ui";

const START_IDS = new Set<StartNodeId>(START_NODES.map((n) => n.id));

/** "4F" -> "4층", "B1" -> "지하 1층" */
const floorKo = (f: string) => (f.startsWith("B") ? `지하 ${f.slice(1)}층` : `${parseInt(f, 10)}층`);

export function StartLocationScreen() {
  const { state: s, actions } = useGilgyeol();
  const startNode = START_NODES.find((n) => n.id === s.start);
  const [view, setView] = useState<"2d" | "3d">("3d");
  // With a photographed map, pins sit on the AI's nodes (choices it didn't find are left to the list below);
  // otherwise the 1F demo floor is drawn the same way and the 3D view keeps its block layout.
  const g = s.mapDemo ? null : s.parsed;
  const shown = g ?? DEMO_1F_GRAPH;
  const photo = g ? s.parsedPhoto : null;
  const frame2 = graphFrame(shown, photo);
  const spots = START_NODES.flatMap((n) => {
    const f2 = parsedSpot(shown, frame2, n.id);
    return f2 ? [{ n, f2 }] : [];
  });
  // Memoized so picking a start doesn't rebuild the 3D scene (selection only recolours).
  const levels3d = useMemo(() => [{ label: shown.floor || "1F", g: shown }], [shown]);
  const markers3d = useMemo(
    () => START_NODES.flatMap((n) => {
      const node = nodeFor(shown, n.id);
      return node ? [{ id: n.id, level: 0, nodeId: node.id }] : [];
    }),
    [shown],
  );

  const pickOnMap = (id: StartNodeId) =>
    s.locEdit ? actions.update({ start: id, startAt: null, locEdit: false }) : actions.toast("‘위치 수정’을 누르면 다른 지점을 고를 수 있어요");

  // Starting somewhere other than the map's 현위치: pick an entrance from the real graph, or pin it on the map.
  const [floors, setFloors] = useState<ApiStartFloor[] | null>(null);
  const [floorsErr, setFloorsErr] = useState(false);
  const [pinning, setPinning] = useState(false);
  // The three ways to correct the start live behind one button, so "맞아요, 계속하기" stays on screen.
  const [fixing, setFixing] = useState(false);

  const setStartAt = (at: NonNullable<typeof s.startAt>) => {
    setPinning(false);
    actions.update({ startAt: at, start: null, locEdit: false, landmarks: false });
  };

  const toggleList = () => {
    actions.update({ landmarks: !s.landmarks });
    if (!floors) {
      setFloorsErr(false);
      startPoints().then(setFloors, () => setFloorsErr(true));
    }
  };

  const summary = s.startAt
    ? `${floorKo(s.startAt.floor)} ${s.startAt.label} · ${s.startAt.via === "scan" ? "표지로 확인" : s.startAt.via === "pin" ? "지도에서 찍음" : "직접 선택"}`
    : startNode
      ? `${floorKo(currentMapFloor(s))} ${startNode.label}${s.locEdit ? " · 선택 중" : " · 추정 위치"}`
      : "아직 위치를 고르지 않았어요";

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
              className={`h-11 min-w-[52px] rounded-lg border-none px-2 text-[13px] font-bold text-ink ${view === v ? "bg-surface" : "bg-transparent"}`}
            >
              {v === "2d" ? "안내도" : "3D 보기"}
            </button>
          ))}
        </div>
      </div>
      {view === "3d" && (
        <div className="relative mx-auto h-[320px] w-full overflow-hidden rounded-[18px] border border-line bg-[#FAF9F6]">
          <Floor3DLazy levels={levels3d} markers={markers3d} selected={s.start} onSelect={(id) => START_IDS.has(id as StartNodeId) && pickOnMap(id as StartNodeId)} hint="돌려보기 · 원판을 눌러 출발 지점 선택" />
          {startNode && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-brand px-2.5 py-1 text-[13px] font-bold text-white">
              {s.locEdit ? "현재 위치" : "현재 위치 · 추정"} · {startNode.label}
            </div>
          )}
        </div>
      )}
      <div className={view === "3d" ? "hidden" : ""}>
        <MapBox frame={frame2} label={`${g ? "방금 읽은" : "데모"} 1층 안내도. 출발 지점을 골라주세요`} maxH={300}>
          <MapSketch key={photo?.url ?? "demo"} g={shown} frame={frame2} photo={photo} />
          {spots.map(({ n, f2 }) => {
            const on = s.start === n.id;
            const left = `${f2.fx * 100}%`;
            return (
              <div key={n.id}>
                {/* 44px touch target; the visible ring is small so it doesn't hide the map's chips. */}
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${n.label}${on ? " (선택됨)" : ""}`}
                  onClick={() => pickOnMap(n.id)}
                  className="absolute -mt-[22px] -ml-[22px] flex size-11 items-center justify-center rounded-full border-none bg-transparent p-0"
                  style={{ left, top: `${f2.fy * 100}%` }}
                >
                  <span
                    className="flex size-6 items-center justify-center rounded-full border-[3px] shadow-[0_2px_6px_rgba(0,0,0,.18)]"
                    style={{ borderColor: on ? C.brand : C.ink, background: on ? C.brand : "rgba(255,255,255,.85)" }}
                  >
                    <span className="size-2 rounded-full" style={{ background: on ? "#fff" : C.ink }} />
                  </span>
                </button>
                {on && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -translate-x-1/2 rounded-md bg-brand px-[7px] py-[3px] text-[13px] font-bold whitespace-nowrap text-white"
                    style={{ left, top: `calc(${f2.fy * 100}% + 16px)` }}
                  >
                    {s.locEdit ? "현재 위치" : "현재 위치 · 추정"}
                  </div>
                )}
              </div>
            );
          })}
        </MapBox>
      </div>
      <div role="status" className={`text-[15px] font-semibold ${s.startAt ? "text-success" : startNode ? (s.locEdit ? "text-brand" : "text-warning") : "text-muted"}`}>
        {summary}
      </div>
      <PrimaryButton disabled={!s.start && !s.startAt} onClick={() => (s.start || s.startAt) && actions.go("destFloor")}>
        맞아요, 계속하기
      </PrimaryButton>
      <SecondaryButton aria-expanded={fixing} onClick={() => setFixing((v) => !v)}>
        {fixing ? "닫기" : "위치가 달라요"}
      </SecondaryButton>
      {fixing && (
        <div className="flex flex-col gap-2">
          <SecondaryButton aria-expanded={s.landmarks} onClick={toggleList}>
            다른 입구에 계신가요?
          </SecondaryButton>
          {s.landmarks && (
            <div className="flex flex-col overflow-hidden rounded-2xl bg-surface">
              {!floors && !floorsErr && <div className="px-4 py-3 text-[14px] text-muted">불러오는 중…</div>}
              {floorsErr && <div className="px-4 py-3 text-[14px] text-muted">목록을 불러오지 못했어요. 지도에서 위치를 찍어주세요.</div>}
              {floors?.map((fl) => (
                <div key={fl.floor} role="group" aria-label={floorKo(fl.floor)}>
                  <div className="bg-app-bg px-4 py-1.5 text-[13px] font-extrabold text-muted">{floorKo(fl.floor)}</div>
                  {fl.points.map((p) => {
                    const on = s.startAt?.id === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        aria-pressed={on}
                        onClick={() => setStartAt({ id: p.id, label: p.label, floor: fl.floor, via: "list" })}
                        className="flex min-h-[52px] w-full items-center gap-3 border-0 border-b border-divider bg-surface px-4 text-left text-[16px] text-ink"
                      >
                        <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-lg bg-warm-panel text-[13px] font-extrabold">
                          {p.type === "elevator_hall" ? "EV" : NODE_TYPES[p.type].short}
                        </span>
                        <span className="flex-1">{p.label}</span>
                        <span className="text-[13px] font-bold text-brand">{on ? "선택됨" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          <SecondaryButton aria-expanded={pinning} onClick={() => setPinning((v) => !v)}>
            {pinning ? "지도 찍기 닫기" : "지도에서 정확한 위치 찍기"}
          </SecondaryButton>
          {pinning && <PinMap initialFloor={s.startAt?.floor ?? "1F"} confirmLabel="여기에서 출발" onConfirm={(p) => setStartAt({ ...p, via: "pin" })} />}
          <SecondaryButton aria-pressed={s.locEdit} onClick={() => actions.update({ locEdit: !s.locEdit })}>
            {s.locEdit ? "수정 취소" : "위치 수정 (지도에서 누르기)"}
          </SecondaryButton>
        </div>
      )}
    </div>
  );
}
