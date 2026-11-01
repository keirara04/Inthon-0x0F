"use client";

import type { ReactNode } from "react";
import { canvasTextMeasure, MAP_FONT, placeMapChips } from "@/lib/gilgyeol/mapLabels";
import { corridorSegments, facilityGraph } from "@/lib/gilgyeol/facilityGeometry";
import type { ParsedGraph } from "@/lib/gilgyeol/api";
import { C, EDITOR_H, EDITOR_W } from "@/lib/gilgyeol/data";
import type { GraphNode, NodeType, StartNodeId } from "@/lib/gilgyeol/types";

/** The photo a graph was read from (object URL + pixel size). */
export type MapPhoto = { url: string; w: number; h: number };

const NODE_COLOR: Record<NodeType, string> = {
  room: C.ink,
  junction: "#B5B0A4",
  stairs: C.route,
  elevator_hall: C.haptic,
  entrance: C.success,
  exit: C.success,
  landmark: "#B5B0A4",
};

export type MapFrame = ReturnType<typeof graphFrame>;

/**
 * Coordinate space for drawing a parsed graph. AI coordinates are fractions of the photo, so with a
 * photo the space keeps the photo's proportions and the graph lands on what it was read from.
 * The view is cropped to the nodes (the map is often a small part of the shot) with room for chips.
 */
export function graphFrame(g: ParsedGraph, photo?: MapPhoto | null) {
  const W = 1000;
  const H = 1000 * (photo ? photo.h / photo.w : EDITOR_H / EDITOR_W);
  const pt = (n: { x: number; y: number }) => ({ x: (n.x / EDITOR_W) * W, y: (n.y / EDITOR_H) * H });
  // Room outlines count too, so a shape near the edge isn't cropped.
  const ps = g.nodes.flatMap((n) => [n, ...(n.outline ?? [])]).map(pt);
  let box = { x: 0, y: 0, w: W, h: H };
  if (ps.length) {
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // Margin in drawing units (k), not just %, so chips nudged up a row and the 현위치 tag above
    // the pin (~36k tall) stay inside the crop.
    const k0 = (Math.max(x1 - x0, y1 - y0, 80) * 1.25) / 300;
    const [padX, padTop, padBottom] = [36 * k0, 44 * k0, 44 * k0];
    let [bx0, bx1, by0, by1] = [x0 - padX, x1 + padX, y0 - padTop, y1 + padBottom];
    if (photo) [bx0, bx1, by0, by1] = [Math.max(0, bx0), Math.min(W, bx1), Math.max(0, by0), Math.min(H, by1)];
    box = { x: bx0, y: by0, w: Math.max(bx1 - bx0, 1), h: Math.max(by1 - by0, 1) };
  }
  const toFrac = (n: GraphNode) => {
    const p = pt(n);
    return { fx: (p.x - box.x) / box.w, fy: (p.y - box.y) / box.h };
  };
  return { W, H, box, aspect: box.w / box.h, pt, toFrac, k: Math.max(box.w, box.h) / 300 };
}

const SPOT_TYPE: Record<Exclude<StartNodeId, "here">, NodeType> = { stair: "stairs", hall: "elevator_hall", main: "entrance" };

/** Where a start choice sits in a frame, as 0–1 fractions; null when the graph has no such node. */
/** The graph node a start choice stands for: 현위치 for "here", otherwise the first node of that type. */
export function startNode(g: ParsedGraph, id: StartNodeId): GraphNode | undefined {
  return id === "here" ? g.nodes.find((x) => x.id === g.current_node_id) : g.nodes.find((x) => x.type === SPOT_TYPE[id]);
}

export function parsedSpot(g: ParsedGraph, f: MapFrame, id: StartNodeId): { fx: number; fy: number } | null {
  const n = startNode(g, id);
  return n ? f.toFrac(n) : null;
}

/** Fill for room / stair / elevator outlines. */
const OUTLINE_FILL: Partial<Record<NodeType, string>> = { room: "#FFFFFF", stairs: "#DCE8F4", elevator_hall: "#E6E2F6" };

/** Wall outlines the AI traced, as polygons (closing edge implicit). */
function Outlines({ g, f, selected, stroke }: { g: ParsedGraph; f: MapFrame; selected?: string | null; stroke: number }) {
  return (
    <g className="gg-fade-in">
      {g.nodes.map((n) => {
        if (!n.outline || n.outline.length < 3 || !OUTLINE_FILL[n.type]) return null;
        const on = selected === n.id;
        return (
          <polygon
            key={`o-${n.id}`}
            points={n.outline
              .map(f.pt)
              .map((q) => `${q.x},${q.y}`)
              .join(" ")}
            fill={OUTLINE_FILL[n.type]}
            fillOpacity={0.75}
            stroke={on ? C.brand : C.border}
            strokeWidth={(on ? 2.5 : 1.2) * stroke}
            strokeLinejoin="miter"
          />
        );
      })}
    </g>
  );
}

/**
 * The AI's floor graph as a floor plan: corridors as thick route lines, rooms as numbered chips,
 * stairs/elevators/exits as lettered badges, 현위치 as a pulsing pin. Draws in once on mount.
 * `lite` (for the tilted 3D plane) keeps only corridors and dots, stretched to the box.
 */
export function MapSketch({
  g: inputGraph,
  frame: f,
  photo,
  variant = "full",
  layers = "both",
  selected = null,
  interactive = false,
  showCorridors = true,
  showCurrent = true,
}: {
  g: ParsedGraph;
  frame: MapFrame;
  photo?: MapPhoto | null;
  variant?: "full" | "lite";
  /** both = graph over the faded photo; photo = original only; map = graph only. */
  layers?: "both" | "photo" | "map";
  selected?: string | null;
  /** Chips carry `data-node` and take pointer events, so a viewer can hit-test taps. */
  interactive?: boolean;
  /** Guidance draws its own route and current position. */
  showCorridors?: boolean;
  showCurrent?: boolean;
}) {
  const g = facilityGraph(inputGraph);
  const { k, box } = f;
  const at = new Map(g.nodes.map((n) => [n.id, n]));
  const corridors = corridorSegments(g);
  const cur = showCurrent && g.current_node_id ? at.get(g.current_node_id) : undefined;
  const line = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const [p, q] = [f.pt(a), f.pt(b)];
    return `M${p.x} ${p.y}L${q.x} ${q.y}`;
  };
  const corridorDelay = (i: number) => `${Math.min(i * 0.03, 0.6)}s`;

  if (variant === "lite") {
    return (
      <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        <Outlines g={g} f={f} stroke={k} />
        {showCorridors && <path d={corridors.map(([a, b]) => line(a, b)).join(" ")} fill="none" pathLength={1} className="gg-draw-in" stroke={C.route} strokeOpacity={0.55} strokeWidth={7 * k} strokeLinecap="round" />}
        {g.nodes
          .filter((n) => n.type !== "junction")
          .map((n) => {
            const p = f.pt(n);
            return <circle key={n.id} cx={p.x} cy={p.y} r={5 * k} fill={NODE_COLOR[n.type] ?? C.ink} />;
          })}
      </svg>
    );
  }

  const currentPoint = cur && f.pt(cur);
  const corridorPts = corridors.map(([a, b]) => [f.pt(a), f.pt(b)] as [{ x: number; y: number }, { x: number; y: number }]);
  const chips = placeMapChips(
    g.nodes,
    { ...f, measure: canvasTextMeasure() },
    currentPoint ? [{ x: currentPoint.x, y: currentPoint.y - 10 * k, w: 46 * k, h: 52 * k }] : [],
    corridorPts,
  );
  const chipsStart = Math.min(corridors.length * 0.03, 0.6) + 0.25;
  const curP = cur && f.pt(cur);

  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      {photo && layers !== "map" && (
        <>
          <image href={photo.url} x={0} y={0} width={f.W} height={f.H} preserveAspectRatio="none" />
          {layers === "both" && <rect x={0} y={0} width={f.W} height={f.H} fill="#fff" opacity={0.45} />}
        </>
      )}
      {/* Hidden with display (not unmounted) so switching layers doesn't replay the entrance. */}
      <g display={layers === "photo" ? "none" : undefined}>
        <Outlines g={g} f={f} selected={selected} stroke={k} />
      {showCorridors && corridors.map(([a, b], i) => (
        <path key={`c-${i}`} d={line(a, b)} stroke="#fff" strokeWidth={9 * k} strokeLinecap="round" />
      ))}
      {showCorridors && corridors.map(([a, b], i) => (
        <path key={`r-${i}`} d={line(a, b)} pathLength={1} className="gg-draw-in" stroke={C.route} strokeWidth={5 * k} strokeLinecap="round" style={{ animationDelay: corridorDelay(i) }} />
      ))}
      {g.nodes.filter((n) => n.door?.length === 2).map((n) => {
        const [a, b] = n.door!.map(f.pt);
        return <line key={`door-${n.id}`} data-door-for={n.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={NODE_COLOR[n.type]} strokeWidth={3 * k} strokeLinecap="round" />;
      })}
      {chips.filter((c) => c.callout && c.leader).map((c) => (
        <line key={`label-${c.n.id}`} data-label-for={c.n.id} x1={c.leader!.from.x} y1={c.leader!.from.y} x2={c.leader!.to.x} y2={c.leader!.to.y} stroke={C.muted} strokeWidth={1.3 * k} strokeLinecap="round" />
      ))}
      {chips.map((c, i) => (
        <g
          key={c.n.id}
          transform={`translate(${c.x} ${c.y})`}
          data-node={interactive ? c.n.id : undefined}
          style={interactive ? { pointerEvents: "auto", cursor: "pointer" } : undefined}
        >
          <g className="gg-pop-in" style={{ animationDelay: `${Math.min(chipsStart + i * 0.04, 1.6)}s` }}>
            <title>{c.text}</title>
            <rect
              x={-c.w / 2} y={-c.h / 2} width={c.w} height={c.h} rx={5.5 * k}
              fill={selected === c.n.id ? C.brand : c.badge ? NODE_COLOR[c.n.type] : "#fff"}
              stroke={selected === c.n.id ? C.brand : c.badge ? NODE_COLOR[c.n.type] : C.border}
              strokeWidth={selected === c.n.id ? 2 * k : k}
            />
            <text textAnchor="middle" fontFamily={MAP_FONT} fontSize={c.fontSize} fontWeight={700} fill={selected === c.n.id || c.badge ? "#fff" : C.ink}>
              {c.lines.map((line, j) => (
                <tspan key={j} x={0} y={(j - (c.lines.length - 1) / 2) * c.lineHeight + c.fontSize * 0.35}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        </g>
      ))}
      {curP && (
        <g transform={`translate(${curP.x} ${curP.y})`}>
          <g className="gg-pop-in" style={{ animationDelay: `${Math.min(chipsStart + chips.length * 0.04, 1.6) + 0.15}s` }}>
            <circle r={14 * k} fill="none" stroke={C.warning} strokeWidth={2.5 * k} className="gg-pulse" style={{ animationDuration: "1.8s", transformBox: "fill-box", transformOrigin: "center" }} />
            <circle r={6 * k} fill={C.warning} stroke="#fff" strokeWidth={2 * k} />
            <rect x={-23 * k} y={-35 * k} width={46 * k} height={18 * k} rx={9 * k} fill={C.warning} />
            <text x={0} y={-26 * k + 9.5 * k * 0.35} textAnchor="middle" fontFamily={MAP_FONT} fontSize={9.5 * k} fontWeight={800} fill="#fff">
              현위치
            </text>
          </g>
        </g>
      )}
      </g>
    </svg>
  );
}

/**
 * Box with the frame's proportions (capped at `maxH` px tall), so the sketch fills it exactly and
 * HTML pins placed at frame fractions (`left/top` in %) stay on their spots at any width.
 */
export function MapBox({ frame, label, maxH = 260, children }: { frame: MapFrame; label: string; maxH?: number; children: ReactNode }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative mx-auto max-w-full overflow-hidden rounded-[18px] border border-line bg-[#FAF9F6]"
      style={{ aspectRatio: frame.aspect, width: `min(100%, ${Math.round(maxH * frame.aspect)}px)` }}
    >
      {children}
    </div>
  );
}
