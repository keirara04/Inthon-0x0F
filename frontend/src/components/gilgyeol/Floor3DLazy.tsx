"use client";

import dynamic from "next/dynamic";

/** three.js (~150 KB gz) loads only when a 3D view is actually shown. */
export const Floor3DLazy = dynamic(() => import("./Floor3D"), {
  ssr: false,
  loading: () => <div className="flex size-full items-center justify-center text-[13px] font-semibold text-muted">3D 지도를 불러오는 중…</div>,
});

export type { Floor3DLevel, Floor3DMarker } from "./Floor3D";
