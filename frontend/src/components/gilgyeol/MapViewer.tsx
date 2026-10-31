"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ParsedGraph } from "@/lib/gilgyeol/api";
import { memo } from "react";
import { MapSketch, type MapFrame, type MapPhoto } from "./MapSketch";

/** Re-renders only when the graph, layer or selection changes, never during a gesture. */
const Sketch = memo(MapSketch);

type View = { s: number; x: number; y: number };
const FIT: View = { s: 1, x: 0, y: 0 };
const MIN_S = 1;
const MAX_S = 5;

/**
 * Pan/zoom for a box: one finger drags, two fingers pinch, the wheel zooms at the cursor,
 * a double tap zooms in. A tap that didn't move reports the `data-node` under the finger.
 * The view lives in a ref and is written to `content`'s transform once per frame, so gestures
 * never re-render the map; React state only tracks whether the view is zoomed (for the reset button).
 */
function usePanZoom(onTap: (nodeId: string | null) => void) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(FIT);
  const frameReq = useRef(0);
  const [zoomed, setZoomed] = useState(false);
  const setView = (next: View | ((v: View) => View)) => {
    const v = typeof next === "function" ? next(viewRef.current) : next;
    viewRef.current = v;
    if (!frameReq.current)
      frameReq.current = requestAnimationFrame(() => {
        frameReq.current = 0;
        const { s, x, y } = viewRef.current;
        if (content.current) content.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`;
      });
    setZoomed(v.s > 1.01 || Math.abs(v.x) > 0.5 || Math.abs(v.y) > 0.5); // bails out when unchanged
  };
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; target: string | null; lastTap: number }>({ moved: false, target: null, lastTap: 0 });

  /** Keeps at least a quarter of the content on screen. */
  const clamp = (v: View): View => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return v;
    const s = Math.min(MAX_S, Math.max(MIN_S, v.s));
    const mx = ((s - 1) * r.width) / 2 + r.width * 0.25;
    const my = ((s - 1) * r.height) / 2 + r.height * 0.25;
    return { s, x: Math.min(mx, Math.max(-mx, v.x)), y: Math.min(my, Math.max(-my, v.y)) };
  };

  /** Zoom by `f` keeping the screen point (clientX, clientY) fixed. */
  const zoomAt = (f: number, cx?: number, cy?: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = (cx ?? r.left + r.width / 2) - (r.left + r.width / 2);
    const py = (cy ?? r.top + r.height / 2) - (r.top + r.height / 2);
    setView((v) => {
      const s = Math.min(MAX_S, Math.max(MIN_S, v.s * f));
      const ratio = s / v.s;
      return clamp({ s, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio });
    });
  };

  // Wheel needs a non-passive listener to stop the page scrolling while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(frameReq.current);
    };
    // zoomAt only uses refs and functional state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.current.size === 1) {
        gesture.current.moved = false;
        gesture.current.target = (e.target as Element).closest("[data-node]")?.getAttribute("data-node") ?? null;
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const prev = pts.current.get(e.pointerId);
      if (!prev) return;
      const all = [...pts.current.entries()];
      if (all.length === 1) {
        const dx = e.clientX - prev.x;
        const dy = e.clientY - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) gesture.current.moved = true;
        setView((v) => clamp({ ...v, x: v.x + dx, y: v.y + dy }));
      } else if (all.length >= 2) {
        const other = all.find(([id]) => id !== e.pointerId)![1];
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        gesture.current.moved = true;
        if (before > 0) zoomAt(after / before, (e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
      }
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
      const was = pts.current.size;
      pts.current.delete(e.pointerId);
      if (was !== 1 || gesture.current.moved) return;
      const now = Date.now();
      if (!gesture.current.target && now - gesture.current.lastTap < 300) zoomAt(2, e.clientX, e.clientY); // double tap on empty map
      gesture.current.lastTap = now;
      onTap(gesture.current.target);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => {
      pts.current.delete(e.pointerId);
    },
  };

  return { box, content, zoomed, handlers, zoomAt, reset: () => setView(FIT) };
}

const LAYERS: ["both" | "photo" | "map", string][] = [
  ["both", "겹쳐 보기"],
  ["map", "지도만"],
  ["photo", "사진만"],
];

const ctl = "flex size-11 items-center justify-center rounded-xl border-[1.5px] border-edge bg-surface/95 text-[20px] font-semibold text-ink shadow-[0_2px_8px_rgba(0,0,0,.08)]";

/** Full-bleed interactive map: pan, zoom, layer switch, tap a chip to select it. */
export function MapViewer({
  g,
  frame,
  photo,
  selected,
  onSelect,
  label,
}: {
  g: ParsedGraph;
  frame: MapFrame;
  photo?: MapPhoto | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  label: string;
}) {
  const [layers, setLayers] = useState<"both" | "photo" | "map">("both");
  const { box, content, zoomed, handlers, zoomAt, reset } = usePanZoom(onSelect);
  return (
    <div ref={box} className="relative size-full touch-none overflow-hidden bg-[#FAF9F6] select-none" {...handlers}>
      <div ref={content} role="img" aria-label={label} className="absolute inset-0 origin-center will-change-transform">
        <Sketch key={photo?.url ?? "demo"} g={g} frame={frame} photo={photo} layers={photo ? layers : "map"} selected={selected} interactive />
      </div>

      {photo && (
        <div role="radiogroup" aria-label="보기" className="absolute top-3 left-3 flex gap-0.5 rounded-[10px] bg-[rgba(236,234,227,.95)] p-[3px] shadow-[0_2px_8px_rgba(0,0,0,.08)]">
          {LAYERS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={layers === k}
              onClick={() => setLayers(k)}
              className={`h-9 rounded-lg border-none px-2.5 text-[12px] font-bold text-ink ${layers === k ? "bg-surface" : "bg-transparent"}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex flex-col gap-1.5">
        <button type="button" aria-label="확대" className={ctl} onClick={() => zoomAt(1.6)}>
          +
        </button>
        <button type="button" aria-label="축소" className={ctl} onClick={() => zoomAt(1 / 1.6)}>
          −
        </button>
        {zoomed && (
          <button type="button" aria-label="전체 보기" className={`${ctl} text-[13px]`} onClick={reset}>
            전체
          </button>
        )}
      </div>
      {!zoomed && !selected && (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-[rgba(21,23,21,.72)] px-2.5 py-1.5 text-[12px] font-semibold text-white">
          두 손가락으로 확대 · 호실을 눌러 확인
        </div>
      )}
    </div>
  );
}
