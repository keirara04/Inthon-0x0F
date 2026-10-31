// Floor geometry helpers for the 3D view.
// snapOutlines is a port of 명성's orthogonal cleanup (PR #11, pipeline/layout.py `_straighten` + `_axis`).
import type { GraphEdge, GraphNode } from "./types";

type Pt = { x: number; y: number };

/**
 * Makes each edge purely horizontal or vertical (whichever it mostly is), with corners shared:
 * points joined by a horizontal edge get the same y (their median), by a vertical edge the same x.
 */
export function straighten(points: Pt[]): Pt[] {
  const n = points.length;
  const parent = [Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => i)];
  const find = (axis: number, i: number): number => (parent[axis][i] === i ? i : (parent[axis][i] = find(axis, parent[axis][i])));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n; // closing edge is implicit
    const horizontal = Math.abs(points[j].x - points[i].x) >= Math.abs(points[j].y - points[i].y);
    const axis = horizontal ? 1 : 0; // horizontal edge shares y (axis 1)
    parent[axis][find(axis, j)] = find(axis, i);
  }
  const median = (v: number[]) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const shared = (axis: number, key: "x" | "y") => {
    const groups = new Map<number, number[]>();
    points.forEach((p, i) => groups.set(find(axis, i), [...(groups.get(find(axis, i)) ?? []), p[key]]));
    return points.map((_, i) => median(groups.get(find(axis, i))!));
  };
  const xs = shared(0, "x");
  const ys = shared(1, "y");
  return points.map((_, i) => ({ x: xs[i], y: ys[i] }));
}

/** Clusters values closer than `tol` and maps each to its cluster's median, so near-equal walls coincide. */
export function snapAxis(values: number[], tol: number): (v: number) => number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const map = new Map<number, number>();
  let cluster: number[] = [];
  const flush = () => {
    const m = cluster[Math.floor((cluster.length - 1) / 2)];
    cluster.forEach((v) => map.set(v, m));
    cluster = [];
  };
  for (const v of sorted) {
    if (cluster.length && v - cluster[0] > tol) flush();
    cluster.push(v);
  }
  if (cluster.length) flush();
  return (v) => map.get(v) ?? v;
}

/** Drops repeated neighbours and points that sit on a straight run (a-p-b all on one line). */
function tidy(points: Pt[]): Pt[] {
  let out = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (out.length > 1 && out[0].x === out.at(-1)!.x && out[0].y === out.at(-1)!.y) out = out.slice(0, -1);
  for (let changed = true; changed && out.length > 3; ) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const [a, p, b] = [out.at(i - 1)!, out[i], out[(i + 1) % out.length]];
      if ((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y)) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Right-angled, wall-aligned outlines: straighten each outline, then snap x and y values that are
 * within `tolFrac` of the floor's span onto one shared value (명성 used 0.6%).
 * Outlines that collapse below 3 points are dropped.
 */
export function snapOutlines<N extends GraphNode>(nodes: N[], tolFrac = 0.006): N[] {
  const straight = nodes.map((n) => (n.outline && n.outline.length >= 3 ? { ...n, outline: straighten(n.outline) } : n));
  const all = straight.flatMap((n) => n.outline ?? []);
  if (!all.length) return straight;
  const span = Math.max(Math.max(...all.map((p) => p.x)) - Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.y)) - Math.min(...all.map((p) => p.y)));
  const sx = snapAxis(all.map((p) => p.x), span * tolFrac);
  const sy = snapAxis(all.map((p) => p.y), span * tolFrac);
  return straight.map((n) => {
    if (!n.outline) return n;
    const outline = tidy(n.outline.map((p) => ({ x: sx(p.x), y: sy(p.y) })));
    return outline.length >= 3 ? { ...n, outline } : { ...n, outline: undefined };
  });
}

/** Shortest path by straight-line edge length (Dijkstra); node ids from `from` to `to`, or [] if unreachable. */
export function shortestPath(nodes: GraphNode[], edges: GraphEdge[], from: string, to: string): string[] {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map<string, { id: string; w: number }[]>();
  for (const e of edges) {
    const [a, b] = [at.get(e.a), at.get(e.b)];
    if (!a || !b) continue;
    const w = Math.hypot(a.x - b.x, a.y - b.y);
    adj.set(a.id, [...(adj.get(a.id) ?? []), { id: b.id, w }]);
    adj.set(b.id, [...(adj.get(b.id) ?? []), { id: a.id, w }]);
  }
  const dist = new Map([[from, 0]]);
  const prev = new Map<string, string>();
  const open = new Set([from]);
  // ponytail: O(n²) Dijkstra, fine for a floor's ~50 nodes
  while (open.size) {
    const cur = [...open].reduce((a, b) => (dist.get(a)! <= dist.get(b)! ? a : b));
    open.delete(cur);
    if (cur === to) break;
    for (const { id, w } of adj.get(cur) ?? []) {
      const d = dist.get(cur)! + w;
      if (d < (dist.get(id) ?? Infinity)) {
        dist.set(id, d);
        prev.set(id, cur);
        open.add(id);
      }
    }
  }
  if (!dist.has(to)) return [];
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return path;
}


/** A measured room footprint, or null when only its position is known. Never invent a room size. */
export function roomPolygon(node: GraphNode, scale: number): { x: number; z: number }[] | null {
  const points = node.outline;
  if (!points || points.length < 3 || points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const area = points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
  if (Math.abs(area) < 1e-8) return null;
  return points.map((p) => ({ x: p.x * scale, z: p.y * scale }));
}
