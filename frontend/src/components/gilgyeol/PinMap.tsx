"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { fetchFloorGraph, type ParsedGraph } from "@/lib/gilgyeol/api";
import { C, EDITOR_H, EDITOR_W, FLOORS } from "@/lib/gilgyeol/data";
import { pinNode } from "@/lib/gilgyeol/geometry";
import { MapBox, MapSketch, graphFrame } from "./MapSketch";
import { PrimaryButton } from "./ui";

export type PinnedSpot = { id: string; label: string; floor: string };

/**
 * "지도에서 내 위치 찍기": tap where you are on a verified floor map. Routes start at graph nodes, so the tap
 * snaps to the room it falls in or the nearest corridor point, and the snapped place is shown before confirming.
 * An extra option next to the sign scan, not a replacement: it needs someone who can see the map.
 */
export function PinMap({ initialFloor, confirmLabel, onConfirm }: { initialFloor: string; confirmLabel: string; onConfirm: (spot: PinnedSpot) => void | Promise<void> }) {
  const [floor, setFloor] = useState(initialFloor);
  const [loaded, setLoaded] = useState<{ floor: string; g: ParsedGraph | null } | null>(null);
  const [pin, setPin] = useState<{ floor: string; id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false); // one route request per confirm, even on a double tap

  useEffect(() => {
    let alive = true;
    void fetchFloorGraph(floor).then((g) => alive && setLoaded({ floor, g }));
    return () => {
      alive = false;
    };
  }, [floor]);
  const g = loaded?.floor === floor ? loaded.g : undefined; // undefined = loading, null = no verified map
  const frame = g ? graphFrame(g) : null;
  const picked = pin?.floor === floor ? pin : null;
  const pinNodeOnMap = picked && g ? g.nodes.find((n) => n.id === picked.id) : undefined;
  const pinAt = pinNodeOnMap && frame ? frame.toFrac(pinNodeOnMap) : null;

  const onTap = (e: MouseEvent<HTMLButtonElement>) => {
    if (!g || !frame) return;
    const r = e.currentTarget.getBoundingClientRect();
    const [fx, fy] = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    // Tap -> frame space -> editor units (the graph's own coordinates).
    const x = ((frame.box.x + fx * frame.box.w) / frame.W) * EDITOR_W;
    const y = ((frame.box.y + fy * frame.box.h) / frame.H) * EDITOR_H;
    const hit = pinNode(g.nodes, { x, y });
    if (hit) setPin({ floor, id: hit.node.id, label: hit.label });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="층 선택">
        {FLOORS.map((f) => {
          const id = `${f}F`;
          const on = floor === id;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              key={f}
              onClick={() => setFloor(id)}
              className={`h-12 rounded-[14px] border-[1.5px] text-[16px] font-extrabold ${on ? "border-ink bg-ink text-white" : "border-edge bg-surface text-ink"}`}
            >
              {f}층
            </button>
          );
        })}
      </div>
      {g === undefined && <div className="rounded-2xl bg-surface px-4 py-3 text-[14px] text-muted">지도를 불러오는 중…</div>}
      {g === null && <div className="rounded-2xl bg-surface px-4 py-3 text-[14px] text-muted">{floor.replace("F", "층")}은 아직 검수된 지도가 없어요. 표지로 위치를 찾아주세요.</div>}
      {g && frame && (
        <MapBox frame={frame} label={`${floor.replace("F", "층")} 지도`} maxH={300}>
          <MapSketch g={g} frame={frame} />
          {/* The whole map is one tap target; the result is announced below. */}
          <button type="button" onClick={onTap} aria-label="지도에서 지금 있는 곳을 누르세요" className="absolute inset-0 size-full cursor-crosshair border-none bg-transparent p-0" />
          {pinAt && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -mt-[30px] -ml-[11px] flex size-[22px] items-center justify-center rounded-full rounded-br-none border-[3px] border-white shadow-[0_2px_6px_rgba(0,0,0,.25)]"
              style={{ left: `${pinAt.fx * 100}%`, top: `${pinAt.fy * 100}%`, background: C.brand, transform: "rotate(45deg)" }}
            />
          )}
        </MapBox>
      )}
      <div role="status" className="text-[15px] font-semibold text-ink">
        {picked ? `${floor.replace("F", "층")} ${picked.label} 위치로 맞췄어요` : g ? "지도에서 지금 있는 곳을 눌러주세요" : ""}
      </div>
      <PrimaryButton
        disabled={!picked || busy}
        onClick={async () => {
          if (!picked || busy) return;
          setBusy(true);
          try {
            await onConfirm({ id: picked.id, label: picked.label, floor });
          } finally {
            setBusy(false);
          }
        }}
      >
        {confirmLabel}
      </PrimaryButton>
    </div>
  );
}
