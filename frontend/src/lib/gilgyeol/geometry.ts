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

const ROOMISH = new Set(["room", "stairs", "elevator_hall"]);

/**
 * Estimated rectangular outlines for rooms/stairs/elevators that have none (the evac-map AI no longer returns
 * outlines, to stay well under the time limit). Width: 45% of the gap to the nearest room in the same row, so
 * neighbours never overlap. Depth: same with the nearest room in the same column, capped at 80% of the way to the
 * corridor point its door connects to, so a box never covers the corridor. Nodes that have an outline are kept.
 */
export function fallbackOutlines<N extends GraphNode>(nodes: N[], edges: GraphEdge[]): N[] {
  const rooms = nodes.filter((n) => ROOMISH.has(n.type));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const nearest = (n: N, axis: "x" | "y") => {
    const other = axis === "x" ? "y" : "x";
    const ds = rooms
      .filter((m) => m !== n && Math.abs(m[other] - n[other]) < Math.abs(m[axis] - n[axis]))
      .map((m) => Math.abs(m[axis] - n[axis]));
    return ds.length ? Math.min(...ds) : null;
  };
  // Typical spacing, for rooms with no neighbour on an axis.
  const spacings = rooms.flatMap((n) => [nearest(n, "x"), nearest(n, "y")]).filter((d): d is number => d !== null).sort((a, b) => a - b);
  const typical = spacings.length ? spacings[Math.floor(spacings.length / 2)] : null;
  if (typical === null) return nodes; // a lone room: nothing to size it against

  return nodes.map((n) => {
    if (!ROOMISH.has(n.type) || (n.outline && n.outline.length >= 3)) return n;
    const gx = nearest(n, "x");
    const gy = nearest(n, "y");
    let hx = 0.45 * (gx ?? gy ?? typical);
    let hy = 0.45 * (gy ?? gx ?? typical);
    // Stop short of the corridor the door opens onto.
    for (const e of edges) {
      const otherId = e.a === n.id ? e.b : e.b === n.id ? e.a : null;
      const d = otherId ? byId.get(otherId) : undefined;
      if (!d || ROOMISH.has(d.type)) continue;
      const [dx, dy] = [Math.abs(d.x - n.x), Math.abs(d.y - n.y)];
      if (dy >= dx && dy > 0) hy = Math.min(hy, 0.8 * dy);
      else if (dx > 0) hx = Math.min(hx, 0.8 * dx);
    }
    // ponytail: plain rectangles from spacing; real wall shapes need the AI outlines back (≈ +6 s per read).
    hx = Math.min(hx, 2 * hy);
    hy = Math.min(hy, 2 * hx);
    const outline = [
      { x: n.x - hx, y: n.y - hy },
      { x: n.x + hx, y: n.y - hy },
      { x: n.x + hx, y: n.y + hy },
      { x: n.x - hx, y: n.y + hy },
    ];
    return { ...n, outline, outlineEstimated: true };
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

/** Ray-casting point-in-polygon. */
function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [a, b] = [poly[i], poly[j]];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Where a tap on the floor map lands in the graph (routes start at nodes): the room/stair/elevator whose
 * outline holds the tap, else the nearest node. `label` names it for people; a bare corridor point is
 * named after the closest place ("405호 앞 복도"). Same units for `p` and the nodes.
 */
export function pinNode<N extends GraphNode>(nodes: N[], p: Pt): { node: N; label: string } | null {
  const usable = nodes.filter((n) => n.type !== "landmark");
  const d = (n: Pt) => Math.hypot(n.x - p.x, n.y - p.y);
  const closest = (ns: N[]) => ns.reduce<N | null>((best, n) => (!best || d(n) < d(best) ? n : best), null);
  const room = usable.find((n) => n.outline && n.outline.length >= 3 && inside(p, n.outline));
  const node = room ?? closest(usable);
  if (!node) return null;
  if (node.type !== "junction") return { node, label: node.label };
  const named = closest(usable.filter((n) => n.type !== "junction"));
  return { node, label: named ? `${named.label} 앞 복도` : "복도" };
}

/** A room's outline at `scale`, or null when it has none usable (fallbackOutlines fills those first in 3D). */
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
