"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { C } from "@/lib/gilgyeol/data";

// Graph-based isometric floor diagram — not a real 3D scan of the building.
export const PLANE_W = 260;
export const PLANE_H = 200;

export interface IsoRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IsoRoom extends IsoRect {
  label: string;
  highlight?: boolean;
}

export interface FloorLayout {
  corridors: IsoRect[];
  rooms: IsoRoom[];
  elevator: { x: number; y: number };
}

export const FLOOR1: FloorLayout = {
  corridors: [
    { x: 30, y: 80, w: 220, h: 14 },
    { x: 125, y: 80, w: 14, h: 112 },
    { x: 28, y: 40, w: 14, h: 116 },
  ],
  rooms: [
    { label: "101", x: 52, y: 12, w: 64, h: 58 },
    { label: "102", x: 150, y: 12, w: 96, h: 58 },
    { label: "103", x: 52, y: 104, w: 64, h: 58 },
    { label: "행정실", x: 150, y: 104, w: 96, h: 58 },
  ],
  elevator: { x: 132, y: 87 },
};

export function floor4(dest: string): FloorLayout {
  return {
    corridors: [{ x: 16, y: 80, w: 228, h: 14 }],
    rooms: [
      { label: dest.replace("호", ""), x: 16, y: 14, w: 74, h: 56, highlight: true },
      { label: "403", x: 100, y: 14, w: 60, h: 56 },
      { label: "401", x: 16, y: 104, w: 74, h: 56 },
      { label: "407", x: 170, y: 104, w: 74, h: 56 },
    ],
    elevator: { x: 132, y: 87 },
  };
}

/** Route on 4F: elevator hall → left corridor → destination door. */
export const ROUTE4: IsoRect[] = [
  { x: 53, y: 83, w: 79, h: 8 },
  { x: 49, y: 62, w: 8, h: 29 },
];

/** Converts plane coordinates to percentages so markers stay put while the plane rotates. */
export const pct = (x: number, y: number) => ({ left: `${(x / PLANE_W) * 100}%`, top: `${(y / PLANE_H) * 100}%` });

export function IsoPlane({ layout, rot, route, dim, children, scale = 1 }: { layout: FloorLayout; rot: number; route?: IsoRect[]; dim?: boolean; children?: ReactNode; scale?: number }) {
  return (
    <div
      className="absolute top-1/2 left-1/2 rounded-md border border-edge bg-surface shadow-[8px_8px_0_rgba(32,36,33,.08)] transition-transform duration-150"
      style={{
        width: PLANE_W,
        height: PLANE_H,
        marginLeft: -PLANE_W / 2,
        marginTop: -PLANE_H / 2,
        transform: `scale(${scale}) rotateX(58deg) rotateZ(${rot}deg)`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      {layout.corridors.map((c, i) => (
        <div key={i} className="absolute bg-[#EAE7DF]" style={{ left: c.x, top: c.y, width: c.w, height: c.h }} />
      ))}
      {layout.rooms.map((r) => (
        <div
          key={r.label}
          className="absolute box-border p-1 text-[11px] font-bold"
          style={{
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: r.highlight ? C.brand : C.line,
            color: r.highlight ? "#fff" : C.ink,
            boxShadow: r.highlight ? "4px 4px 0 rgba(122,24,50,.25)" : "4px 4px 0 rgba(32,36,33,.08)",
          }}
        >
          {r.label}
        </div>
      ))}
      {route?.map((r, i) => (
        <div key={i} className="absolute rounded-sm bg-route" style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      ))}
      <div
        className="absolute size-5 rounded-[4px] border-2 border-white bg-route"
        style={{ left: layout.elevator.x - 10, top: layout.elevator.y - 10 }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

/** Rotation state with pointer drag + accessible step buttons. */
export function useIsoRotation(initial = -40) {
  const [rot, setRot] = useState(initial);
  const drag = useRef<{ x: number; rot: number } | null>(null);
  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest("button")) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { x: e.clientX, rot };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      if (drag.current) setRot(drag.current.rot + (e.clientX - drag.current.x) * 0.6);
    },
    onPointerUp: () => (drag.current = null),
    onPointerCancel: () => (drag.current = null),
  };
  return { rot, setRot, handlers };
}

export function RotateButtons({ setRot }: { setRot: (fn: (r: number) => number) => void }) {
  const btn = "flex size-11 items-center justify-center rounded-xl border-[1.5px] border-edge bg-surface/90 text-[18px] font-bold text-ink";
  return (
    <div className="absolute right-2.5 bottom-2.5 flex gap-1.5">
      <button type="button" aria-label="왼쪽으로 돌리기" className={btn} onClick={() => setRot((r) => r - 30)}>
        ↺
      </button>
      <button type="button" aria-label="오른쪽으로 돌리기" className={btn} onClick={() => setRot((r) => r + 30)}>
        ↻
      </button>
    </div>
  );
}
