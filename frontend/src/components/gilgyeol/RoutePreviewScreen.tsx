"use client";

import { C, START_NODES } from "@/lib/gilgyeol/data";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, PrimaryButton } from "./ui";

export function RoutePreviewScreen() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  const startNode = START_NODES.find((n) => n.id === s.start);

  const steps: { t: string; badge?: string; tone?: "warn" | "cp" | "ok" }[] = [
    { t: `1층 ${startNode?.label ?? "출발 위치"}에서 출발` },
    { t: "정면 엘리베이터 홀로 이동" },
    { t: "중앙 엘리베이터 A로 4층 이동", badge: s.elevUnverified ? "정차 층 확인 중 · 층 버튼 확인" : "4층 정차 확인", tone: s.elevUnverified ? "warn" : "ok" },
    { t: "4층 층 표지 확인", badge: "체크포인트", tone: "cp" },
    { t: `왼쪽 복도 → ${d} 표지 확인`, badge: "체크포인트", tone: "cp" },
  ];
  const badgeCls = { warn: "bg-warn-tint text-warn-ink", cp: "bg-haptic-tint text-haptic-ink", ok: "bg-ok-tint text-ok-ink" };

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="경로 미리보기" onBack={actions.back} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-[18px] bg-surface p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <div className="text-[12px] font-semibold text-muted">출발</div>
          <div className="text-[16px] font-bold">{startNode?.label ?? "—"}</div>
          <div className="text-[13px] text-muted">1층</div>
        </div>
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
          <line x1="1" y1="6" x2="19" y2="6" stroke={C.route} strokeWidth="2.2" />
          <polyline points="14,1 20,6 14,11" fill="none" stroke={C.route} strokeWidth="2.2" />
        </svg>
        <div className="flex flex-col gap-[3px] text-right">
          <div className="text-[12px] font-semibold text-muted">도착</div>
          <div className="text-[16px] font-bold text-brand">{d}</div>
          <div className="text-[13px] text-muted">4층</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
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
          <svg viewBox="0 0 150 90" className="h-auto w-full" role="img" aria-label={`4층: 층 표지에서 왼쪽 복도로 ${d}까지`}>
            <g stroke="#EAE7DF" strokeWidth="10" strokeLinecap="round">
              <line x1="15" y1="45" x2="135" y2="45" />
            </g>
            <polyline points="75,45 15,45 15,22" fill="none" stroke={C.route} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="68" y="38" width="14" height="14" rx="3" fill={C.route} />
            <circle cx="45" cy="45" r="5" fill="#fff" stroke={C.haptic} strokeWidth="2.5" />
            <circle cx="15" cy="20" r="7" fill={C.brand} />
          </svg>
          <div className="text-[12px] text-muted">층 표지 → 왼쪽 복도 → {d}</div>
        </div>
      </div>
      <ol className="m-0 flex list-none flex-col rounded-[18px] bg-surface px-[18px] py-1.5" aria-label="경로 단계">
        {steps.map((p, i) => (
          <li key={p.t} className="flex items-start gap-3.5 border-b border-divider py-3 last:border-b-0">
            <div className="flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: i === steps.length - 1 ? C.brand : C.route }}>
              {i + 1}
            </div>
            <div className="flex flex-col gap-1 pt-[3px]">
              <div className="text-[16px] font-semibold">{p.t}</div>
              {p.badge && p.tone && <div className={`self-start rounded-md px-2 py-[3px] text-[12px] font-bold ${badgeCls[p.tone]}`}>{p.badge}</div>}
            </div>
          </li>
        ))}
      </ol>
      <p className="m-0 text-[13px] leading-normal text-muted">예상 시간과 거리는 아직 측정하지 않아 층 이동 단계로 보여드려요.</p>
      <PrimaryButton tall onClick={() => actions.go("mode")}>
        안내 방식 선택
      </PrimaryButton>
    </div>
  );
}
