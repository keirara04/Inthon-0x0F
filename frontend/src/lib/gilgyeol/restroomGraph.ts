import type { FloorGraph, GraphNode } from "./types";
import { snapOutlines } from "./geometry.ts";

type Point = { x: number; y: number };
const bathroomNumber = (n: GraphNode) => n.type === "room" && /화장실|bathroom|restroom/i.test(n.label) ? /^\s*(\d+)\s*([a-z])?\s*(?:호)?/i.exec(n.label) : null;

function inside(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Union the occupied cells, retaining an L-shaped exterior rather than filling a bounding box. */
function unionOutline(nodes: GraphNode[]): Point[] | null {
  if (nodes.some((n) => !n.outline || n.outline.length < 3)) return null;
  const polygons = snapOutlines(nodes).map((n) => n.outline!);
  const xs = [...new Set(polygons.flatMap((p) => p.map((q) => q.x)))].sort((a, b) => a - b);
  const ys = [...new Set(polygons.flatMap((p) => p.map((q) => q.y)))].sort((a, b) => a - b);
  const occupied = new Set<string>();
  for (let x = 0; x < xs.length - 1; x++) for (let y = 0; y < ys.length - 1; y++) {
    if (polygons.some((poly) => inside({ x: (xs[x] + xs[x + 1]) / 2, y: (ys[y] + ys[y + 1]) / 2 }, poly))) occupied.add(`${x},${y}`);
  }
  const boundary = new Map<string, string>();
  for (const cell of occupied) {
    const [x, y] = cell.split(",").map(Number);
    const edges = [
      { neighbour: `${x},${y - 1}`, a: `${x},${y}`, b: `${x + 1},${y}` },
      { neighbour: `${x + 1},${y}`, a: `${x + 1},${y}`, b: `${x + 1},${y + 1}` },
      { neighbour: `${x},${y + 1}`, a: `${x + 1},${y + 1}`, b: `${x},${y + 1}` },
      { neighbour: `${x - 1},${y}`, a: `${x},${y + 1}`, b: `${x},${y}` },
    ];
    for (const e of edges.filter((e) => !occupied.has(e.neighbour))) {
      if (boundary.has(e.a)) return null; // Only a shared corner, not one continuous bathroom.
      boundary.set(e.a, e.b);
    }
  }
  const first = boundary.keys().next().value;
  if (!first) return null;
  const points: Point[] = [];
  let next = first;
  do {
    const [x, y] = next.split(",").map(Number);
    points.push({ x: xs[x], y: ys[y] });
    const end = boundary.get(next);
    if (!end) return null;
    boundary.delete(next);
    next = end;
  } while (next !== first);
  if (boundary.size) return null; // Disconnected rooms or an enclosed void must stay separate.
  return points.filter((p, i) => {
    const a = points.at(i - 1)!, b = points[(i + 1) % points.length];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

/** 106 + 106A is one bathroom; 106 and 107 remain distinct. The input graph is never mutated. */
export function combineRestroomSections<T extends FloorGraph>(graph: T): T {
  const groups = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    const number = bathroomNumber(n)?.[1];
    if (number) groups.set(number, [...(groups.get(number) ?? []), n]);
  }
  const replacements = new Map<string, string>(), combined = new Map<string, GraphNode>();
  for (const [number, members] of groups) {
    if (members.length < 2 || !members.some((n) => bathroomNumber(n)?.[2])) continue;
    const outline = unionOutline(members);
    if (!outline) continue;
    const primary = members.find((n) => !bathroomNumber(n)?.[2]) ?? [...members].sort((a, b) => a.id.localeCompare(b.id))[0];
    for (const n of members) replacements.set(n.id, primary.id);
    combined.set(primary.id, { ...primary, label: "화장실", outline });
  }
  const nodes = graph.nodes
    .filter((n) => !replacements.has(n.id) || combined.has(n.id))
    .map((n) => {
      const merged = combined.get(n.id);
      if (merged) return merged;
      if (n.type === "room" && /화장실|bathroom|restroom/i.test(n.label)) {
        return { ...n, label: "화장실" };
      }
      return n;
    });
  if (!replacements.size && nodes.every((n, i) => n === graph.nodes[i])) return graph;
  const seen = new Set<string>();
  const edges = graph.edges.flatMap((edge) => {
    const a = replacements.get(edge.a) ?? edge.a, b = replacements.get(edge.b) ?? edge.b;
    const key = [a, b].sort().join("|");
    if (a === b || seen.has(key)) return [];
    seen.add(key);
    return [{ ...edge, a, b }];
  });
  return { ...graph, nodes, edges };
}
