"use client";

import { useState } from "react";
import { EXITS_4F } from "@/lib/gilgyeol/data";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import { Badge, GhostButton, PrimaryButton } from "./ui";

function duration(from: number | null, to: number | null) {
  if (!from || !to) return "—";
  const sec = Math.max(0, Math.round((to - from) / 1000));
  return sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

export function ArrivalScreen() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  const [exitsOpen, setExitsOpen] = useState(false);
  const from = s.steps[0]?.floor ?? "1층";
  const to = s.steps[s.steps.length - 1]?.floor ?? `${s.dest?.floor ?? 4}층`;
  const stats = [
    { k: "소요 시간", v: duration(s.trip.startedAt, s.trip.arrivedAt) },
    { k: "층 이동", v: from === to ? "없음" : `${from} → ${to}` },
    { k: "경로 재확인", v: `${s.trip.reroutes}회` },
  ];
  return (
    <div className="flex min-h-full flex-col gap-[18px] p-5 pt-6">
      <div className="flex flex-1 flex-col items-start justify-center gap-[18px]">
        <div className="flex size-[88px] items-center justify-center rounded-full bg-success" aria-hidden="true">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <polyline points="9,23 18,32 35,13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 role="status" data-trial="arrive-title" className="m-0 text-[32px] leading-[1.25] font-extrabold tracking-[-0.03em]">
          우정정보관 {d}에
          <br />
          도착했어요
        </h1>
        <div className="text-[18px] text-muted">우정정보관 · {to}</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="haptic">진동 · 길게 1회 + 짧게 2회</Badge>
        </div>
      </div>
      <dl className="m-0 grid grid-cols-3 gap-2 rounded-[18px] bg-surface px-3 py-4 text-center">
        {stats.map((x) => (
          <div key={x.k} className="flex flex-col gap-1">
            <dt className="text-[12px] text-muted">{x.k}</dt>
            <dd className="m-0 text-[17px] font-bold">{x.v}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-hidden rounded-2xl bg-surface">
        <button
          type="button"
          aria-expanded={exitsOpen}
          onClick={() => setExitsOpen((o) => !o)}
          className="flex min-h-[52px] w-full items-center justify-between border-none bg-surface px-4 text-[15px] font-bold text-ink"
        >
          이 층 비상구 보기
          <span className="text-[13px] font-semibold text-muted">{exitsOpen ? "접기" : "안전 정보"}</span>
        </button>
        {exitsOpen && (
          <div className="flex flex-col gap-2 px-4 pb-4">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {EXITS_4F.map((e) => (
                <li key={e.name} className="flex flex-col gap-0.5 rounded-xl bg-app-bg px-3 py-2.5">
                  <span className="text-[15px] font-bold">{e.name}</span>
                  <span className="text-[13px] leading-normal text-muted">{e.where}</span>
                </li>
              ))}
            </ul>
            <p className="m-0 text-[12px] leading-normal text-warn-ink">현장 확인 전 시연 데이터예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <GhostButton className="h-[52px] rounded-2xl" onClick={actions.replay}>
          다시 듣기
        </GhostButton>
        <GhostButton className="h-[52px] rounded-2xl" onClick={() => actions.go("search", { query: "", cat: null, floorPick: null, step: 0, dir: "far" })}>
          다른 목적지 찾기
        </GhostButton>
      </div>
      <PrimaryButton dark onClick={actions.endGuide}>
        안내 종료
      </PrimaryButton>
    </div>
  );
}
