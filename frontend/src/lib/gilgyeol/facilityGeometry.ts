import type { FloorGraph, GraphNode } from "./types";
import { combineRestroomSections } from "./restroomGraph.ts";

type Pt = { x: number; y: number };
export type Segment = [Pt, Pt];
const cross = (a: Pt, b: Pt) => a.x * b.y - a.y * b.x;
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });

export function visibleSegment(points?: Pt[]): Segment | null {
  return points?.length === 2 && points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) > 1e-8 ? [points[0], points[1]] : null;
}

function projection(p: Pt, a: Pt, b: Pt) {
  const v = sub(b, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / (v.x * v.x + v.y * v.y || 1)));
  const point = { x: a.x + t * v.x, y: a.y + t * v.y };
  return { point, t, distance: Math.hypot(p.x - point.x, p.y - point.y) };
}

/** Snap an opening to its own wall, so a path never chooses a different wall for the door gap. */
export function facilityThreshold(node: GraphNode, approach?: Pt, otherNodes: GraphNode[] = []): Segment | null {
  const poly = node.outline;
  const actual = visibleSegment(node.door);
  if (!poly || poly.length < 3) return actual;
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [w, h] = [x1 - x0, y1 - y0];
  const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  const actualMid = actual ? { x: (actual[0].x + actual[1].x) / 2, y: (actual[0].y + actual[1].y) / 2 } : undefined;
  const target = actualMid ?? approach;
  if (!target) return actual;
  const probe = Math.max(Math.min(w, h) * 0.2, 1e-3);
  let edges = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const ev = sub(b, a), len = Math.hypot(ev.x, ev.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const n1 = { x: -ev.y / len, y: ev.x / len };
    const normal = (mid.x - center.x) * n1.x + (mid.y - center.y) * n1.y >= 0 ? n1 : { x: -n1.x, y: -n1.y };
    const ref = approach ?? target;
    const clearance = (ref.x - mid.x) * normal.x + (ref.y - mid.y) * normal.y;
    const actualDist = actualMid ? projection(actualMid, a, b).distance : Infinity;
    const blockedByRoom = otherNodes.some((r) => r.id !== node.id && r.type === "room" && r.outline && r.outline.length >= 3 && (
      insideFootprint({ x: mid.x + normal.x * probe, y: mid.y + normal.y * probe }, r.outline) ||
      insideFootprint({ x: mid.x + normal.x * probe * 0.4, y: mid.y + normal.y * probe * 0.4 }, r.outline)
    ));
    const hasExteriorExit = otherNodes.some((ex) => ex.id !== node.id && ex.type === "exit" && !insideFootprint(ex, poly) &&
      (ex.x - mid.x) * normal.x + (ex.y - mid.y) * normal.y > -1e-4 &&
      projection(ex, a, b).distance <= Math.min(w, h) * 0.85
    );
    return { a, b, len, normal, clearance, actualDist, blockedByRoom, hasExteriorExit, ...projection(target, a, b) };
  }).filter(({ len }) => len > 1e-8);
  const endScore = (e: typeof edges[number]) => w >= h ? Math.abs(e.normal.x) : Math.abs(e.normal.y);
  if (node.type === "stairs") {
    if (approach && !insideFootprint(approach, poly)) {
      const facing = edges.filter((e) => e.clearance > 1e-6);
      const unblocked = facing.filter((e) => !e.blockedByRoom && !e.hasExteriorExit);
      const roomClear = facing.filter((e) => !e.blockedByRoom);
      const pool = unblocked.length ? unblocked : roomClear.length ? roomClear : facing;
      if (pool.length) {
        const actualOnPool = actualMid && pool.some((e) => e.actualDist <= Math.min(w, h) * 0.25);
        edges = actualOnPool ? pool : pool.map((e) => ({ ...e, ...projection(approach, e.a, e.b) }));
      }
    } else if (!actual) {
      const endWalls = edges.filter((e) => !e.blockedByRoom && !e.hasExteriorExit && endScore(e) >= 0.7);
      if (endWalls.length) edges = endWalls;
    }
  }
  const edge = edges.sort((a, b) =>
    Math.abs(a.distance - b.distance) > 1e-6 ? a.distance - b.distance
      : Math.abs(endScore(b) - endScore(a)) > 1e-6 ? endScore(b) - endScore(a)
        : b.clearance - a.clearance
  )[0];
  if (!edge) return actual;
  const v = sub(edge.b, edge.a), length = edge.len;
  const width = actual && Math.hypot(actual[1].x - actual[0].x, actual[1].y - actual[0].y) <= length * 0.9
    ? Math.hypot(actual[1].x - actual[0].x, actual[1].y - actual[0].y)
    : Math.min(w, h) * 0.4;
  const half = Math.min(width / 2, length * 0.35);
  const minMargin = node.type === "stairs" ? Math.max(length * 0.28, half * 1.1) : 0;
  const t = length <= 2 * (half + minMargin)
    ? 0.5
    : Math.max((half + minMargin) / length, Math.min(1 - (half + minMargin) / length, edge.t));
  const c = { x: edge.a.x + t * v.x, y: edge.a.y + t * v.y };
  return [{ x: c.x - v.x / length * half, y: c.y - v.y / length * half }, { x: c.x + v.x / length * half, y: c.y + v.y / length * half }];
}

/** A nearby current-position marker is useful for a lift whose door side could not be read. */
function facilityApproach(graph: FloorGraph & { current_node_id: string | null }, node: GraphNode): Pt | undefined {
  const current = graph.nodes.find((n) => n.id === graph.current_node_id);
  if (node.type === "elevator_hall" && !visibleSegment(node.door) && current && node.outline?.length) {
    const span = Math.max(...node.outline.map((p) => p.x)) - Math.min(...node.outline.map((p) => p.x))
      + Math.max(...node.outline.map((p) => p.y)) - Math.min(...node.outline.map((p) => p.y));
    if (Math.hypot(current.x - node.x, current.y - node.y) < span * 2 && !insideFootprint(current, node.outline)) return current;
  }
  const poly = node.outline;
  const facesUnblockedWall = (j: Pt) => {
    if (node.type !== "stairs" || !poly || poly.length < 3) return true;
    const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
    const [w, h] = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
    const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const probe = Math.max(Math.min(w, h) * 0.2, 1e-3);
    return poly.some((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const ev = sub(b, a), len = Math.hypot(ev.x, ev.y);
      if (len <= 1e-8) return false;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const n1 = { x: -ev.y / len, y: ev.x / len };
      const normal = (mid.x - center.x) * n1.x + (mid.y - center.y) * n1.y >= 0 ? n1 : { x: -n1.x, y: -n1.y };
      if ((j.x - mid.x) * normal.x + (j.y - mid.y) * normal.y <= 1e-6) return false;
      const blockedByRoom = graph.nodes.some((r) => r.id !== node.id && r.type === "room" && r.outline && r.outline.length >= 3 && (
        insideFootprint({ x: mid.x + normal.x * probe, y: mid.y + normal.y * probe }, r.outline) ||
        insideFootprint({ x: mid.x + normal.x * probe * 0.4, y: mid.y + normal.y * probe * 0.4 }, r.outline)
      ));
      const hasExteriorExit = graph.nodes.some((ex) => ex.id !== node.id && ex.type === "exit" && !insideFootprint(ex, poly) &&
        (ex.x - mid.x) * normal.x + (ex.y - mid.y) * normal.y > -1e-4 &&
        projection(ex, a, b).distance <= Math.min(w, h) * 0.85
      );
      return !blockedByRoom && !hasExteriorExit;
    });
  };
  const isCorridorJunction = (n?: GraphNode): n is GraphNode =>
    n?.type === "junction" && (node.type === "elevator_hall" || (n.id !== graph.current_node_id && !n.id.endsWith("-approach")));
  const neighbours = graph.edges.flatMap((e) => e.a === node.id ? [e.b] : e.b === node.id ? [e.a] : [])
    .map((id) => graph.nodes.find((n) => n.id === id)).filter(isCorridorJunction);
  const validNeighbours = neighbours.filter(facesUnblockedWall);
  if (validNeighbours.length) {
    return validNeighbours.sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))[0];
  }
  const junctions = graph.nodes.filter(isCorridorJunction);
  const validJunctions = junctions.filter(facesUnblockedWall);
  const pool = validJunctions.length ? validJunctions : neighbours.length ? neighbours : junctions;
  return pool.sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))[0];
}

const isEntranceFacility = (n?: GraphNode) => n && ["stairs", "elevator_hall", "entrance", "exit"].includes(n.type);

function pruneOrphanedJunctions(nodes: GraphNode[], edges: FloorGraph["edges"], candidates: Set<string>, currentNodeId: string | null) {
  let nextNodes = nodes, nextEdges = edges;
  for (const id of candidates) {
    if (id === currentNodeId) continue;
    const incident = nextEdges.filter((e) => e.a === id || e.b === id);
    const hasFacility = incident.some((e) => {
      const otherId = e.a === id ? e.b : e.a;
      const other = nextNodes.find((n) => n.id === otherId);
      return other && other.type !== "junction";
    });
    if (!hasFacility && incident.length <= 1) {
      nextEdges = nextEdges.filter((e) => e.a !== id && e.b !== id);
      nextNodes = nextNodes.filter((n) => n.id !== id);
    }
  }
  return { nodes: nextNodes, edges: nextEdges };
}

/** Keep the extracted facility footprint, opening and rendered approach in the same coordinate space. */
export function facilityGraph<T extends FloorGraph & { current_node_id: string | null }>(input: T): T {
  const graph = alignExitConnections(combineRestroomSections(input));
  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  let edges = [...graph.edges];
  const detachedJunctions = new Set<string>();
  const mappedNodes = graph.nodes.map((n) => {
    if (n.type !== "stairs" && n.type !== "elevator_hall") return n;
    const approach = facilityApproach(graph, n);
    const door = facilityThreshold(n, approach, graph.nodes);
    if (n.type === "stairs" && door) {
      const doorMid = { x: (door[0].x + door[1].x) / 2, y: (door[0].y + door[1].y) / 2 };
      const xs = n.outline?.map((p) => p.x) ?? [n.x], ys = n.outline?.map((p) => p.y) ?? [n.y];
      const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
      const outward = { x: doorMid.x - center.x, y: doorMid.y - center.y };
      const facesDoor = (j?: GraphNode): j is GraphNode =>
        Boolean(j && j.type === "junction" && j.id !== graph.current_node_id && !j.id.endsWith("-approach") &&
          ((j.x - doorMid.x) * outward.x + (j.y - doorMid.y) * outward.y > 1e-4 || Math.hypot(outward.x, outward.y) < 1e-6));
      const hasFacingConn = edges.some((e) => (e.a === n.id && facesDoor(at.get(e.b))) || (e.b === n.id && facesDoor(at.get(e.a))));
      if (!hasFacingConn) {
        const candidate = graph.nodes.filter(facesDoor)
          .sort((a, b) => Math.hypot(a.x - doorMid.x, a.y - doorMid.y) - Math.hypot(b.x - doorMid.x, b.y - doorMid.y))[0]
          ?? (approach && "id" in approach ? (approach as GraphNode) : undefined);
        if (candidate) {
          for (const e of edges) {
            if (e.a === n.id && at.get(e.b)?.type === "junction") detachedJunctions.add(e.b);
            if (e.b === n.id && at.get(e.a)?.type === "junction") detachedJunctions.add(e.a);
          }
          edges = edges.filter((e) => e.a !== n.id && e.b !== n.id);
          edges.push({ a: candidate.id, b: n.id, src: "ai", headingDeg: null });
        }
      }
    }
    return door ? { ...n, door } : n;
  });
  const pruned = pruneOrphanedJunctions(mappedNodes, edges, detachedJunctions, graph.current_node_id);
  return { ...graph, nodes: pruned.nodes, edges: pruned.edges };
}

/** Corridors stop at facility thresholds; shared and reversed spans are drawn only once. */
export function corridorSegments(graph: FloorGraph): Segment[] {
  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  const stairSpaces = graph.nodes.filter((n) => n.type === "stairs" && n.outline && n.outline.length >= 3);
  const allSpaces = graph.nodes.filter((n) => n.outline && n.outline.length >= 3);
  const endpoint = (n: GraphNode): Pt => {
    const door = (n.type === "stairs" || n.type === "elevator_hall") && visibleSegment(n.door);
    return door ? { x: (door[0].x + door[1].x) / 2, y: (door[0].y + door[1].y) / 2 } : n;
  };
  const lines = graph.edges.flatMap((e): Segment[] => {
    const a = at.get(e.a), b = at.get(e.b);
    if (!a || !b || a.type === "room" || b.type === "room") return [];
    if (isEntranceFacility(a) && isEntranceFacility(b)) return []; // paths are not forced between entrances
    const [pa, pb] = [endpoint(a), endpoint(b)];
    const exitNode = a.type === "exit" ? a : b.type === "exit" ? b : undefined;
    if (exitNode && stairSpaces.some((s) => crossesSpace(pa, pb, [s]))) {
      return [];
    }
    const facilityNode = (a.type === "stairs" || a.type === "elevator_hall") ? a : (b.type === "stairs" || b.type === "elevator_hall") ? b : undefined;
    const juncNode = a.type === "junction" ? a : b.type === "junction" ? b : undefined;
    const door = facilityNode && visibleSegment(facilityNode.door);
    if (facilityNode && juncNode && door) {
      const doorMid = endpoint(facilityNode);
      const horizDoor = Math.abs(door[1].x - door[0].x) >= Math.abs(door[1].y - door[0].y);
      const juncNeighbours = graph.edges.flatMap((oe) => oe.a === juncNode.id ? [at.get(oe.b)] : oe.b === juncNode.id ? [at.get(oe.a)] : [])
        .filter((n): n is GraphNode => n?.type === "junction");
      for (const other of juncNeighbours) {
        const aligned = horizDoor
          ? Math.abs(other.y - juncNode.y) <= Math.abs(other.x - juncNode.x) * 0.3
          : Math.abs(other.x - juncNode.x) <= Math.abs(other.y - juncNode.y) * 0.3;
        if (!aligned) continue;
        const proj = projection(doorMid, juncNode, other);
        if (proj.t > 1e-4 && proj.t < 1 - 1e-4 && !crossesSpace(proj.point, doorMid, allSpaces)) {
          const branch: Segment = [proj.point, doorMid];
          return visibleSegment(branch) ? [branch] : [];
        }
      }
      const alignedCorridor = juncNeighbours.some((n) => horizDoor
        ? Math.abs(n.y - juncNode.y) <= Math.abs(n.x - juncNode.x) * 0.3
        : Math.abs(n.x - juncNode.x) <= Math.abs(n.y - juncNode.y) * 0.3);
      if (alignedCorridor && Math.abs(doorMid.x - juncNode.x) > 1e-4 && Math.abs(doorMid.y - juncNode.y) > 1e-4) {
        const elbow = horizDoor ? { x: doorMid.x, y: juncNode.y } : { x: juncNode.x, y: doorMid.y };
        if (!crossesSpace(juncNode, elbow, allSpaces) && !crossesSpace(elbow, doorMid, allSpaces)) {
          return [[juncNode, elbow], [elbow, doorMid]].filter((seg): seg is Segment => Boolean(visibleSegment(seg)));
        }
      }
    }
    const segment: Segment = [pa, pb];
    return visibleSegment(segment) ? [segment] : [];
  });
  const unique = new Map<string, Segment>();
  const key = (p: Pt) => `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
  for (const [a, b] of lines) {
    const v = sub(b, a), cuts = [0, 1], length2 = v.x * v.x + v.y * v.y;
    for (const [c, d] of lines) {
      const edge = sub(d, c), relative = sub(c, a), den = cross(v, edge);
      if (Math.abs(den) < 1e-8) {
        if (Math.abs(cross(relative, v)) > 1e-8) continue;
        for (const p of [c, d]) {
          const t = ((p.x - a.x) * v.x + (p.y - a.y) * v.y) / length2;
          if (t > 0 && t < 1) cuts.push(t);
        }
      } else {
        const t = cross(relative, edge) / den, u = cross(relative, v) / den;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    cuts.slice(1).forEach((t, i) => {
      if (t - cuts[i] < 1e-8) return;
      const p = { x: a.x + v.x * cuts[i], y: a.y + v.y * cuts[i] }, q = { x: a.x + v.x * t, y: a.y + v.y * t };
      const id = [key(p), key(q)].sort().join("|");
      if (!unique.has(id)) unique.set(id, [p, q]);
    });
  }
  return [...unique.values()];
}

export function insideFootprint(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (projection(p, a, b).distance < 1e-8) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Use the photographed threshold. Legacy points inside a stairwell are placed on its corridor-facing wall. */
export function portalSegment(node: GraphNode, spaces: GraphNode[], approach: Pt | undefined, width: number): Segment {
  const actual = visibleSegment(node.door);
  if (actual) {
    if (node.type !== "exit" || !approach) return actual;
    const centre = { x: (actual[0].x + actual[1].x) / 2, y: (actual[0].y + actual[1].y) / 2 };
    const travel = sub(approach, centre);
    const half = Math.hypot(actual[1].x - actual[0].x, actual[1].y - actual[0].y) / 2;
    const step = Math.max(half * 2.5, 1e-3);
    const hitsStairY = spaces.some((s) => s.type === "stairs" && s.outline && s.outline.length >= 3 && (
      insideFootprint({ x: centre.x, y: centre.y - step }, s.outline) ||
      insideFootprint({ x: centre.x, y: centre.y + step }, s.outline) ||
      insideFootprint({ x: centre.x, y: centre.y - half * 1.1 }, s.outline) ||
      insideFootprint({ x: centre.x, y: centre.y + half * 1.1 }, s.outline)
    ));
    const hitsStairX = spaces.some((s) => s.type === "stairs" && s.outline && s.outline.length >= 3 && (
      insideFootprint({ x: centre.x - step, y: centre.y }, s.outline) ||
      insideFootprint({ x: centre.x + step, y: centre.y }, s.outline) ||
      insideFootprint({ x: centre.x - half * 1.1, y: centre.y }, s.outline) ||
      insideFootprint({ x: centre.x + half * 1.1, y: centre.y }, s.outline)
    ));
    // An exit opens across its approach and never faces into an adjacent stairwell wall.
    const useVertical = hitsStairY && !hitsStairX
      ? true
      : hitsStairX && !hitsStairY
        ? false
        : Math.abs(travel.x) >= Math.abs(travel.y);
    if (useVertical) {
      let cy = centre.y;
      for (const s of spaces) {
        if (s.type !== "stairs" || !s.outline || s.outline.length < 3) continue;
        const topIn = insideFootprint({ x: centre.x, y: cy - half }, s.outline);
        const botIn = insideFootprint({ x: centre.x, y: cy + half }, s.outline);
        if (topIn && !botIn) {
          cy = Math.max(cy, Math.max(...s.outline.map((p) => p.y)) + half * 1.15);
        } else if (botIn && !topIn) {
          cy = Math.min(cy, Math.min(...s.outline.map((p) => p.y)) - half * 1.15);
        }
      }
      return [{ x: centre.x, y: cy - half }, { x: centre.x, y: cy + half }];
    }
    let cx = centre.x;
    for (const s of spaces) {
      if (s.type !== "stairs" || !s.outline || s.outline.length < 3) continue;
      const leftIn = insideFootprint({ x: cx - half, y: centre.y }, s.outline);
      const rightIn = insideFootprint({ x: cx + half, y: centre.y }, s.outline);
      if (leftIn && !rightIn) {
        cx = Math.max(cx, Math.max(...s.outline.map((p) => p.x)) + half * 1.15);
      } else if (rightIn && !leftIn) {
        cx = Math.min(cx, Math.min(...s.outline.map((p) => p.x)) - half * 1.15);
      }
    }
    return [{ x: cx - half, y: centre.y }, { x: cx + half, y: centre.y }];
  }
  const containing = spaces.find((n) => n.outline && n.outline.length >= 3 && insideFootprint(node, n.outline));
  if (containing?.outline) {
    const poly = containing.outline;
    const edges = poly.map((a, i) => ({ a, b: poly[(i + 1) % poly.length], ...projection(approach ?? node, a, poly[(i + 1) % poly.length]) }))
      .filter(({ a, b }) => Math.hypot(b.x - a.x, b.y - a.y) > 1e-8)
      .sort((a, b) => a.distance - b.distance);
    if (edges.length) {
      const e = edges[0], v = sub(e.b, e.a), length = Math.hypot(v.x, v.y);
      const half = Math.min(width / 2, length * 0.4);
      const t = Math.max(half / length, Math.min(1 - half / length, e.t));
      const c = { x: e.a.x + t * v.x, y: e.a.y + t * v.y };
      return [{ x: c.x - v.x / length * half, y: c.y - v.y / length * half }, { x: c.x + v.x / length * half, y: c.y + v.y / length * half }];
    }
  }
  // Without a wall segment, the frame is perpendicular to the connected corridor approach.
  const direction = approach ? sub(approach, node) : { x: 0, y: 1 };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const tangent = { x: direction.y / length * width / 2, y: -direction.x / length * width / 2 };
  return [{ x: node.x - tangent.x, y: node.y - tangent.y }, { x: node.x + tangent.x, y: node.y + tangent.y }];
}

/** Neutral tread marks run down the stairwell's long axis, without implying ascent direction. */
export function stairTreads(node: GraphNode, poly: Pt[], count = 8): Segment[] {
  if (poly.length < 3) return [];
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const flight: Segment = x1 - x0 >= y1 - y0
    ? [{ x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 }]
    : [{ x: (x0 + x1) / 2, y: y0 }, { x: (x0 + x1) / 2, y: y1 }];
  const v = sub(flight[1], flight[0]);
  const length = Math.hypot(v.x, v.y);
  const across = { x: -v.y / length, y: v.x / length };
  const door = visibleSegment(node.door);
  const landing = door ? Math.hypot(door[1].x - door[0].x, door[1].y - door[0].y) * 0.6 : 0;
  const treads: Segment[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const c = { x: flight[0].x + v.x * t, y: flight[0].y + v.y * t };
    if (!insideFootprint(c, poly) || (door && projection(c, door[0], door[1]).distance < landing)) continue;
    const intersections = poly.flatMap((a, j) => {
      const edge = sub(poly[(j + 1) % poly.length], a), relative = sub(a, c), den = cross(across, edge);
      if (Math.abs(den) < 1e-8) return [];
      const u = cross(relative, across) / den;
      return u >= -1e-8 && u <= 1 + 1e-8 ? [cross(relative, edge) / den] : [];
    });
    const lo = Math.max(...intersections.filter((x) => x <= 0));
    const hi = Math.min(...intersections.filter((x) => x >= 0));
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-8) continue;
    const pad = (hi - lo) * 0.1;
    treads.push([{ x: c.x + across.x * (lo + pad), y: c.y + across.y * (lo + pad) }, { x: c.x + across.x * (hi - pad), y: c.y + across.y * (hi - pad) }]);
  }
  return treads;
}

/** Do not turn a shortcut through a room into a corridor. Boundary-touching is allowed. */
function crossesSpace(a: Pt, b: Pt, spaces: GraphNode[]) {
  const travel = sub(b, a);
  return spaces.some(({ outline: poly }) => {
    if (!poly || poly.length < 3) return false;
    const cuts = [0, 1];
    poly.forEach((p, i) => {
      const edge = sub(poly[(i + 1) % poly.length], p), relative = sub(p, a), den = cross(travel, edge);
      if (Math.abs(den) < 1e-8) return;
      const t = cross(relative, edge) / den, u = cross(relative, travel) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t);
    });
    cuts.sort((x, y) => x - y);
    return cuts.slice(1).some((t, i) => {
      const mid = (cuts[i] + t) / 2;
      const p = { x: a.x + travel.x * mid, y: a.y + travel.y * mid };
      return insideFootprint(p, poly) && !poly.some((q, j) => projection(p, q, poly[(j + 1) % poly.length]).distance < 1e-8);
    });
  });
}

/** Attach draft exits across an existing corridor, independently of the current-position marker. */
export function alignExitConnections<T extends FloorGraph & { current_node_id: string | null }>(graph: T): T {
  let nodes = [...graph.nodes], edges = [...graph.edges];
  const atInitial = new Map(nodes.map((n) => [n.id, n]));
  edges = edges.filter((e) => !isEntranceFacility(atInitial.get(e.a)) || !isEntranceFacility(atInitial.get(e.b)));
  const spaces = nodes.filter((n) => n.outline && n.outline.length >= 3);
  const detachedJunctions = new Set<string>();
  for (const exit of nodes.filter((n) => n.type === "exit" && visibleSegment(n.door))) {
    const at = new Map(nodes.map((n) => [n.id, n]));
    const junctions = nodes.filter((n) => n.type === "junction" && n.id !== graph.current_node_id);
    const connected = edges.flatMap((e) => e.a === exit.id ? [at.get(e.b)] : e.b === exit.id ? [at.get(e.a)] : [])
      .find((n) => n?.type === "junction" && n.id !== graph.current_node_id);
    const corridorHits = edges.flatMap((edge) => {
      const a = at.get(edge.a), b = at.get(edge.b);
      if (!a || !b || a.type !== "junction" || b.type !== "junction" || a.id === graph.current_node_id || b.id === graph.current_node_id) return [];
      const p = projection(exit, a, b);
      if (p.t <= 1e-4 || p.t >= 1 - 1e-4 || crossesSpace(exit, p.point, spaces)) return [];
      return [p];
    }).sort((a, b) => a.distance - b.distance);
    const approach = corridorHits[0]?.point ?? connected ?? junctions.sort((a, b) => Math.hypot(a.x - exit.x, a.y - exit.y) - Math.hypot(b.x - exit.x, b.y - exit.y))[0];
    if (!approach) continue;
    const door = portalSegment(exit, spaces, approach, 1);
    const doorMid = { x: (door[0].x + door[1].x) / 2, y: (door[0].y + door[1].y) / 2 };
    const updatedExit = { ...exit, x: doorMid.x, y: doorMid.y, door };
    nodes = nodes.map((n) => n.id === exit.id ? updatedExit : n);
    const tangent = sub(door[1], door[0]);
    const candidates = edges.flatMap((edge) => {
      const a = at.get(edge.a), b = at.get(edge.b);
      if (!a || !b || a.type !== "junction" || b.type !== "junction" || a.id === graph.current_node_id || b.id === graph.current_node_id) return [];
      const p = projection(updatedExit, a, b), travel = sub(p.point, updatedExit);
      const distance = Math.hypot(travel.x, travel.y);
      if (distance < 1e-8 || Math.abs(travel.x * tangent.x + travel.y * tangent.y) > distance * Math.hypot(tangent.x, tangent.y) * 0.05 || crossesSpace(updatedExit, p.point, spaces)) return [];
      return [{ edge, a, b, ...p }];
    }).sort((a, b) => a.distance - b.distance);
    const hit = candidates[0];
    if (!hit) continue; // No observed corridor to attach to; leave the graph available for review.
    let junction = hit.t < 1e-8 ? hit.a : hit.t > 1 - 1e-8 ? hit.b : undefined;
    if (!junction) {
      let id = `${exit.id}-approach`;
      while (at.has(id)) id += "-1";
      junction = { ...hit.a, id, label: "출구 앞 복도", ...hit.point };
      nodes.push(junction);
      edges = edges.filter((e) => e !== hit.edge);
      edges.push(
        { ...hit.edge, b: id, lengthM: hit.edge.lengthM === undefined ? undefined : hit.edge.lengthM * hit.t },
        { ...hit.edge, a: id, lengthM: hit.edge.lengthM === undefined ? undefined : hit.edge.lengthM * (1 - hit.t) },
      );
    }
    if (connected && connected.id !== junction.id) detachedJunctions.add(connected.id);
    edges = edges.filter((e) => e.a !== exit.id && e.b !== exit.id);
    edges.push({ a: junction.id, b: exit.id, src: "ai", headingDeg: null });
  }
  const pruned = pruneOrphanedJunctions(nodes, edges, detachedJunctions, graph.current_node_id);
  return { ...graph, nodes: pruned.nodes, edges: pruned.edges };
}
