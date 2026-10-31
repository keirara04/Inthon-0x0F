"use client";

import { useEffect, useState } from "react";
import { fetchBuildings, floorNumber, type Place } from "@/lib/gilgyeol/api";
import { floorName } from "@/lib/gilgyeol/floorTransition";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { ApiBuilding } from "@/types/api";

/** Same rule as the backend: "우정 정보관" and "우정정보관" are one building. */
const nameKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Buildings matching `q`, nearest first; refetched (debounced) as the query or location changes. */
export function useBuildings(q: string, coords: Place["coords"]) {
  const [rows, setRows] = useState<ApiBuilding[] | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      fetchBuildings(q.trim(), coords).then((r) => alive && setRows(r), () => alive && setRows([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, coords]);
  return rows;
}

/**
 * Which building the user is in, so a read map is saved under it and maps others saved can be reused.
 * Collapsed to the current building; "변경" opens a search that lists nearby buildings first (location is
 * asked only then, and only sent to rank buildings).
 */
export function BuildingPicker() {
  const { state, actions } = useGilgyeol();
  const place = state.place;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [showSaved, setShowSaved] = useState(false); // saved maps are a shortcut, folded so the photo stays the main path
  // Kept here until a pick, so a late location fix can't overwrite a building chosen meanwhile.
  const [coords, setCoords] = useState(place.coords);
  const rows = useBuildings(open ? q : place.name, coords);
  const current = rows?.find((b) => (place.id !== null ? b.id === place.id : nameKey(b.name) === nameKey(place.name)));

  // The default building has no id on the client until the list says which one it is.
  useEffect(() => {
    if (!open && current && place.id === null) actions.update({ place: { ...place, id: current.id } });
  }, [open, current, place, actions]);

  const expand = () => {
    setOpen(true);
    setQ("");
    if (!coords && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {}, // denied or unavailable: the list just isn't sorted by distance
        { timeout: 8000, maximumAge: 300_000 },
      );
    }
  };
  const pick = (id: number | null, name: string) => {
    actions.update({ place: { id, name: name.trim(), coords } });
    setOpen(false);
  };

  const typed = q.trim();
  const isNew = typed !== "" && !rows?.some((b) => nameKey(b.name) === nameKey(typed));
  const saved = [...(current?.saved_floors ?? [])].sort((a, b) => floorNumber(a) - floorNumber(b));

  return (
    <section aria-label="건물" className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold text-muted">지금 있는 건물</span>
          <span className="truncate text-[16px] font-bold">{place.name}</span>
        </div>
        {!open && (
          <button type="button" onClick={expand} className="h-11 flex-none rounded-lg px-3 text-[14px] font-bold text-route">
            변경
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="건물 이름 검색"
            aria-label="건물 이름 검색"
            maxLength={100}
            className="h-11 rounded-[10px] border-[1.5px] border-edge bg-surface px-2.5 text-[16px] text-ink"
          />
          <ul className="m-0 flex max-h-[220px] list-none flex-col overflow-y-auto p-0">
            {isNew && (
              <li>
                <button type="button" onClick={() => pick(null, typed)} className="flex min-h-11 w-full items-center px-1 text-left text-[15px] font-bold text-route">
                  새 건물로 추가: {typed}
                </button>
              </li>
            )}
            {rows?.map((b) => (
              <li key={b.id} className="border-t border-divider first:border-t-0">
                <button type="button" onClick={() => pick(b.id, b.name)} className="flex min-h-11 w-full items-center justify-between gap-3 px-1 py-1.5 text-left">
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold">{b.name}</span>
                    {b.saved_floors.length > 0 && <span className="text-[13px] text-muted">저장된 안내도 {b.saved_floors.length}개 층</span>}
                  </span>
                  {b.distance_m !== null && <span className="flex-none text-[13px] text-muted">{b.distance_m < 1000 ? `${b.distance_m}m` : `${(b.distance_m / 1000).toFixed(1)}km`}</span>}
                </button>
              </li>
            ))}
            {rows?.length === 0 && !isNew && <li className="px-1 py-2 text-[14px] text-muted">이름을 입력해 새 건물을 추가하세요</li>}
          </ul>
        </div>
      )}

      {!open && saved.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <button type="button" aria-expanded={showSaved} onClick={() => setShowSaved((v) => !v)} className="flex min-h-11 items-center justify-between text-left text-[15px] font-bold text-ok-ink">
            <span>저장된 안내도 쓰기 · {saved.length}개 층</span>
            <span aria-hidden="true">{showSaved ? "▴" : "›"}</span>
          </button>
          {showSaved && <span className="text-[14px] text-muted">다른 사람이 찍어둔 안내도예요. 촬영 없이 바로 쓸 수 있어요.</span>}
          {showSaved && (
            <div className="flex flex-wrap gap-2">
              {saved.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => actions.loadSavedMap(f)}
                  className="h-11 rounded-lg bg-ok-tint px-3 text-[14px] font-bold text-ok-ink"
                >
                  {floorName(f)} 안내도 사용
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
