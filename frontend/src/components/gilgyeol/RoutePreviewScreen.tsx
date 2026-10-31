"use client";

import { C, START_NODES } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, PrimaryButton } from "./ui";

/** Current-floor route to the elevator, before the floor change. */
export function RoutePreviewScreen() {
  const { state: s, actions } = useGilgyeol();
  const startNode = START_NODES.find((n) => n.id === s.start);
  const walkSteps = s.steps.filter((st) => !st.kind || st.kind === "walk");
  const lift = s.steps.find((st) => st.kind && st.kind !== "walk");
  const floor = walkSteps[0]?.floor ?? "1층";
  // The sketch is drawn for the demo 1F floor; hide it for any other start rather than show a wrong map.
  const showFloorMap = floor === "1층";

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="엘리베이터까지" onBack={actions.back} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 rounded-[18px] bg-surface p-[18px]">
        <div className="flex flex-col gap-[3px]">
          <div className="text-[12px] font-semibold text-muted">출발</div>
          <div className="text-[16px] font-bold">{startNode?.label ?? s.startAt?.label ?? "현위치"}</div>
          <div className="text-[13px] text-muted">{floor}</div>
        </div>
        <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true">
          <line x1="1" y1="6" x2="19" y2="6" stroke={C.route} strokeWidth="2.2" />
          <polyline points="14,1 20,6 14,11" fill="none" stroke={C.route} strokeWidth="2.2" />
        </svg>
        <div className="flex flex-col gap-[3px] text-right">
          <div className="text-[12px] font-semibold text-muted">엘리베이터</div>
          <div className="text-[16px] font-bold text-brand">{lift?.elevator ?? "중앙 엘리베이터"}</div>
          <div className="text-[13px] text-muted">새로운 층으로 이동</div>
        </div>
      </div>

      {showFloorMap && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
          <div className="text-[14px] font-bold">현재 층 경로</div>
          <svg viewBox="0 0 150 90" className="h-auto w-full" role="img" aria-label="현재 층: 현위치에서 엘리베이터 홀까지">
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
      )}

      <div className="rounded-[18px] bg-surface px-[18px] py-1.5">
        <h2 id="gg-steps-title" className="m-0 border-b border-divider pt-3 pb-2.5 text-[17px] font-bold">
          엘리베이터까지 {walkSteps.length}단계
        </h2>
        <ol className="m-0 flex list-none flex-col p-0" aria-labelledby="gg-steps-title">
          {walkSteps.map((st, i) => (
            <li key={`${st.floor}-${st.title}-${i}`} className="flex items-start gap-3.5 border-b border-divider py-3 last:border-b-0">
              <div className="flex size-7 flex-none items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: C.route }}>
                {i + 1}
              </div>
              <div className="flex flex-col gap-1 pt-[3px]">
                <div className="text-[16px] font-semibold">
                  {st.floor} · {st.title}
                </div>
                {st.checkpoint && <div className="self-start rounded-md bg-haptic-tint px-2 py-[3px] text-[12px] font-bold text-haptic-ink">표지 확인</div>}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="m-0 text-[13px] leading-normal text-muted">엘리베이터를 타기 전까지의 경로예요. 이동한 뒤 새로운 층의 안내도를 고르면 목적지까지 이어서 안내해요.</p>
      <PrimaryButton tall data-trial="preview-next" onClick={() => actions.go("mode")}>
        안내 방식 선택
      </PrimaryButton>
    </div>
  );
}
