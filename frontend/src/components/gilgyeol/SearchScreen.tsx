"use client";

import type { ParsedGraph } from "@/lib/gilgyeol/api";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { Room } from "@/lib/gilgyeol/types";

/** Rooms read from the uploaded evacuation map — the only destination list in this flow. */
function roomsFromMap(map: ParsedGraph): Room[] {
  const floor = Number(map.floor.replace(/\D/g, "")) || 1;
  return map.nodes
    .filter((n) => n.type === "room" && /\d/.test(n.label))
    .map((n) => ({ id: n.id, name: n.label, kind: "호실", floor, cat: "강의실" as const, routeReady: true }));
}

export function SearchScreen() {
  const { state: s, actions } = useGilgyeol();
  // "예" route: the newly uploaded destination-floor map. "아니오" route: the current-floor map.
  const map = s.destParsed ?? s.parsed;
  const forDest = !!s.destParsed;
  const rooms = map ? roomsFromMap(map) : [];
  const mapLabel = forDest ? "새로운 층" : "현재 층";

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={actions.back} aria-label="뒤로" className="-ml-3 flex h-12 w-11 flex-none items-center justify-center border-none bg-transparent">
          <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
            <polyline points="10,2 2,10 10,18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="text-[15px] font-semibold text-muted">{mapLabel} 안내도 · 목적지 선택</div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 text-[24px] leading-[1.28] font-extrabold tracking-[-0.02em]">어디로 갈까요?</h1>
        <p className="m-0 text-[15px] leading-normal text-muted">방금 읽은 {mapLabel} 안내도에서 목적지를 골라주세요.</p>
      </div>

      {rooms.length > 0 ? (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[18px] bg-surface p-0" aria-label="목적지 목록">
          {rooms.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                disabled={s.routeLoading}
                onClick={() => actions.pickDest(r)}
                className="flex min-h-[68px] w-full items-center justify-between border-0 border-b border-divider bg-surface px-[18px] py-3 text-left disabled:opacity-70"
              >
                <div className="flex flex-col gap-[3px]">
                  <div className="text-[18px] font-bold text-ink">{r.name}</div>
                  <div className="text-[14px] text-muted">우정정보관 · {r.kind}</div>
                </div>
                <span className="flex-none text-[13px] font-semibold text-route">{s.routeLoading ? "경로 찾는 중…" : "경로 보기"}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-3 rounded-[18px] bg-surface px-[18px] py-[22px]">
          <div role="status" className="text-[17px] font-bold">이 안내도에서 호실을 찾지 못했어요</div>
          <div className="text-[14px] leading-normal text-muted">안내도 전체가 보이게 다시 찍거나, 준비된 데모 안내도로 이어가요.</div>
          <button
            type="button"
            onClick={() => actions.go("captureIntro", { captureFor: forDest ? "dest" : "current", scanState: "aim" })}
            className="h-12 self-start rounded-[14px] border-[1.5px] border-edge bg-surface px-4 text-[15px] font-semibold text-ink"
          >
            다시 찍기
          </button>
        </div>
      )}
    </div>
  );
}
