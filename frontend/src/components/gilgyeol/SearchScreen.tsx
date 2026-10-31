"use client";

import { useEffect, useState } from "react";
import { searchPlaces } from "@/lib/gilgyeol/api";
import { CATEGORIES, FLOORS } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { Room } from "@/lib/gilgyeol/types";
import { Mascot } from "./Mascot";
import { cx } from "./ui";

type Load = { status: "loading" } | { status: "ok"; rooms: Room[] } | { status: "error"; message: string };

export function SearchScreen() {
  const { state: s, actions } = useGilgyeol();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    searchPlaces(s.query)
      .then((rooms) => alive && setLoad({ status: "ok", rooms }))
      .catch((e: unknown) => alive && setLoad({ status: "error", message: e instanceof Error ? e.message : "검색에 실패했어요" }));
    return () => {
      alive = false;
    };
  }, [s.query, attempt]);

  const results = load.status === "ok" ? load.rooms.filter((r) => (!s.cat || r.cat === s.cat) && (!s.floorPick || r.floor === s.floorPick)) : [];

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={actions.back} aria-label="뒤로" className="-ml-3 flex h-12 w-11 flex-none items-center justify-center border-none bg-transparent">
          <svg width="12" height="20" viewBox="0 0 12 20" aria-hidden="true">
            <polyline points="10,2 2,10 10,18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          autoFocus
          data-trial="search-input"
          type="search"
          value={s.query}
          onChange={(e) => actions.update({ query: e.target.value })}
          placeholder="어디로 갈까요? 예: 405호"
          aria-label="목적지 검색"
          className="h-[52px] min-w-0 flex-1 rounded-2xl border-[1.5px] border-ink bg-surface px-4 text-[17px] text-ink outline-none placeholder:text-muted"
        />
      </div>
      <div className="flex flex-wrap gap-2" aria-label="분류 필터">
        {CATEGORIES.map((c) => {
          const on = s.cat === c;
          return (
            <button
              type="button"
              key={c}
              aria-pressed={on}
              onClick={() => actions.update({ cat: on ? null : c })}
              className={cx("h-11 rounded-[20px] border-[1.5px] px-3.5 text-[14px] font-semibold", on ? "border-ink bg-ink text-white" : "border-edge bg-surface text-ink")}
            >
              {c}
            </button>
          );
        })}
        {s.floorPick && (
          <button type="button" onClick={() => actions.update({ floorPick: null })} aria-label={`${s.floorPick}층 필터 해제`} className="h-10 rounded-[20px] border-none bg-ink px-3.5 text-[14px] font-semibold text-white">
            {s.floorPick}층 ×
          </button>
        )}
      </div>

      {load.status === "error" && (
        <div role="alert" className="flex flex-col gap-3 rounded-[18px] bg-err-tint p-[18px]">
          <div className="text-[16px] font-bold text-err-ink">검색 결과를 불러오지 못했어요</div>
          <div className="text-[14px] text-muted">{load.message}</div>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="h-11 self-start rounded-[14px] border-none bg-ink px-4 text-[15px] font-bold text-white">
            다시 시도
          </button>
        </div>
      )}

      {load.status === "loading" && (
        <div role="status" className="rounded-[18px] bg-surface p-[18px] text-[15px] text-muted">
          검색 중…
        </div>
      )}

      {load.status === "ok" && results.length > 0 && (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[18px] bg-surface p-0" aria-label="검색 결과">
          {results.map((r) => {
            const ready = r.routeReady;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  data-trial={r.name.includes("405") ? "dest-405" : undefined}
                  onClick={() => actions.pickDest(r)}
                  className="flex min-h-[68px] w-full items-center justify-between border-0 border-b border-divider bg-surface px-[18px] py-3 text-left"
                >
                  <div className="flex flex-col gap-[3px]">
                    <div className="text-[18px] font-bold text-ink">{r.name}</div>
                    <div className="text-[14px] text-muted">
                      우정정보관 · {r.cat === "엘리베이터" ? "1–5층 연결" : `${r.floor}층`} · {r.kind}
                    </div>
                  </div>
                  <span className={cx("flex-none text-[13px] font-semibold", ready ? "text-route" : "text-muted")}>{ready ? "시연 경로" : "경로 준비 중"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {load.status === "ok" && results.length === 0 && (
        <div className="flex flex-col gap-3.5 rounded-[18px] bg-surface px-[18px] py-[22px]">
          <Mascot pose="peek" height={64} motion="peek" className="self-start" />
          <div role="status" className="text-[18px] font-bold">
            {s.query.trim() ? `‘${s.query}’에 맞는 장소가 없어요` : "조건에 맞는 장소가 없어요"}
          </div>
          <div className="text-[15px] leading-normal text-muted">호실 번호나 장소명으로 찾아보세요. 예: 405호, 행정실, 계단</div>
          <button
            type="button"
            onClick={() => actions.update({ query: "", cat: null })}
            className="h-11 self-start rounded-[14px] border-[1.5px] border-edge bg-surface px-4 text-[15px] font-semibold text-ink"
          >
            검색어 지우기
          </button>
          <div className="pt-1.5 text-[13px] font-semibold text-muted">층 직접 선택</div>
          <div className="grid grid-cols-5 gap-2">
            {FLOORS.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => actions.update({ floorPick: f, query: "", cat: null })}
                className="h-12 rounded-[14px] border-[1.5px] border-edge bg-app-bg text-[16px] font-bold text-ink"
              >
                {f}층
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
