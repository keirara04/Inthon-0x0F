import type { GraphNode, NodeType } from "./types";

export const MAP_FONT = "-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
export type TextMeasure = (text: string) => number;
const approximateMeasure: TextMeasure = (text) => [...text].reduce((width, ch) => width + (/\s/u.test(ch) ? 0.33 : /[ㄱ-힣\u3000-\u9fff]/u.test(ch) ? 1 : 0.62), 0);

/** Width in em, measured with the same font used to draw the label. */
export function canvasTextMeasure(weight = 700): TextMeasure {
  if (typeof document === "undefined") return approximateMeasure;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return approximateMeasure;
  ctx.font = `${weight} 100px ${MAP_FONT}`;
  return (text) => ctx.measureText(text).width / 100;
}

export function mapNodeLabel(node: GraphNode): string {
  if (node.type === "room") {
    if (/화장실|restroom|bathroom/i.test(node.label)) {
      return "화장실";
    }
    const clean = node.label.trim();
    if (/^\d+[a-zA-Z]?$/.test(clean)) {
      return `${clean}호`;
    }
    return clean || "호실";
  }
  const fallback = { room: "호실", stairs: "계단", elevator_hall: "엘리베이터", exit: "비상구", entrance: "출입구", junction: "복도", landmark: "표지" };
  return node.label.trim() || fallback[node.type];
}

/** Grow the box and wrap first, then reduce the font only if the entire text still does not fit. */
export function fitMapText(text: string, options: {
  fontSize: number; maxWidth: number; maxHeight: number;
  paddingX?: number; paddingY?: number; measure?: TextMeasure;
  nowrap?: boolean;
}) {
  const measure = options.measure ?? approximateMeasure;
  const maxWidth = Math.max(0.001, options.maxWidth);
  const maxHeight = Math.max(0.001, options.maxHeight);
  const px = Math.min(options.paddingX ?? 0, maxWidth * 0.25);
  const py = Math.min(options.paddingY ?? 0, maxHeight * 0.25);
  const contentWidth = maxWidth - 2 * px;
  const contentHeight = maxHeight - 2 * py;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const paragraphs = text.split("\n").map((part) => [...segmenter.segment(part)].map((s) => s.segment));
  const wrap = (fontSize: number) => {
    if (options.nowrap) {
      return [text.replace(/\n+/g, " ").trim()];
    }
    const lines: string[] = [];
    for (const chars of paragraphs) {
      let line = "";
      for (const ch of chars) {
        if (line && measure(line + ch) * fontSize > contentWidth) { lines.push(line); line = ""; }
        line += ch;
      }
      lines.push(line);
    }
    return lines;
  };
  const fits = (fontSize: number, lines: string[]) => lines.length * fontSize * 1.2 <= contentHeight && lines.every((line) => measure(line) * fontSize <= contentWidth);
  let fontSize = options.fontSize;
  let lines = wrap(fontSize);
  if (!fits(fontSize, lines)) {
    let lo = 0;
    let hi = fontSize;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid, wrap(mid))) lo = mid;
      else hi = mid;
    }
    fontSize = lo;
    lines = wrap(fontSize);
  }
  const lineHeight = fontSize * 1.2;
  return {
    lines, fontSize, lineHeight, paddingX: px, paddingY: py,
    width: Math.min(maxWidth, Math.max(...lines.map((line) => measure(line) * fontSize), 0) + 2 * px),
    height: Math.min(maxHeight, lines.length * lineHeight + 2 * py),
  };
}

type Point = { x: number; y: number };
type Box = Point & { w: number; h: number };
type CalloutDir = "bottom" | "top" | "left" | "right";
export type MapChip = Box & { n: GraphNode; anchor: Point; text: string; lines: string[]; lineHeight: number; fontSize: number; badge?: string; callout?: boolean; leader?: { from: Point; to: Point } };
const BADGE: Partial<Record<NodeType, string>> = { stairs: "계", elevator_hall: "승", exit: "출", entrance: "입" };

function contains(p: Point, poly: Point[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

function polyBounds(poly: Point[]): Box {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}

/** A label box belongs inside its footprint, even when the graph node marks its doorway. */
function footprintBox(poly: Point[]): Box | null {
  if (poly.length < 3) return null;
  const xs = [...new Set(poly.map((p) => p.x))].sort((a, b) => a - b);
  const ys = [...new Set(poly.map((p) => p.y))].sort((a, b) => a - b);
  const [x0, x1, y0, y1] = [xs[0], xs.at(-1)!, ys[0], ys.at(-1)!];
  const mids = (values: number[]) => values.slice(1).map((v, i) => (values[i] + v) / 2);
  const candidates = [{ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, ...mids(xs).flatMap((x) => mids(ys).map((y) => ({ x, y })))];
  let best: Box | null = null;
  for (const c of candidates.filter((p) => contains(p, poly))) {
    let w = Math.min(c.x - x0, x1 - c.x) * 1.8, h = Math.min(c.y - y0, y1 - c.y) * 1.8;
    for (let i = 0; i < 40 && w > 1e-8 && h > 1e-8; i++, w *= 0.9, h *= 0.9) {
      const corners = [-1, 1].flatMap((x) => [-1, 1].map((y) => ({ x: c.x + x * w / 2, y: c.y + y * h / 2 })));
      const hasBoundaryInside = poly.some((p) => Math.abs(p.x - c.x) < w / 2 && Math.abs(p.y - c.y) < h / 2);
      if (corners.every((p) => contains(p, poly)) && !hasBoundaryInside) {
        if (!best || w * h > best.w * best.h + 1e-8) best = { ...c, w, h };
        break;
      }
    }
  }
  return best;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w / 2, b.x + b.w / 2) - Math.max(a.x - a.w / 2, b.x - b.w / 2)) * Math.max(0, Math.min(a.y + a.h / 2, b.y + b.h / 2) - Math.max(a.y - a.h / 2, b.y - b.h / 2));

function segmentBoxOverlap(a: Point, b: Point, box: Box, pad = 0): number {
  const x0 = box.x - box.w / 2 - pad, x1 = box.x + box.w / 2 + pad;
  const y0 = box.y - box.h / 2 - pad, y1 = box.y + box.h / 2 + pad;
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]]) {
    if (Math.abs(p) < 1e-8) {
      if (q < 0) return 0;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return 0;
    }
  }
  return Math.max(0, t1 - t0) * Math.hypot(dx, dy);
}

function nearestBoundary(p: Point, poly: Point[]) {
  return poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return { x: a.x + dx * t, y: a.y + dy * t };
  }).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
}

function tinyLeader(c: Box, poly: Point[], k: number): MapChip["leader"] {
  for (const [dx, dy] of [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
    const to = { x: c.x + Math.sign(dx) * c.w * 0.35, y: c.y + Math.sign(dy) * c.h / 2 };
    for (const length of [3.5 * k, 2 * k, k]) {
      const from = { x: to.x + dx * length, y: to.y + dy * length };
      if (contains(to, poly) && contains(from, poly)) return { from, to };
    }
  }
}

/** Keep readable labels inside their spaces; cramped or colliding labels branch out clearly without blocking paths. */
export function placeMapChips(
  nodes: GraphNode[],
  frame: { k: number; box: Box; pt: (n: Point) => Point; measure?: TextMeasure },
  reserved: Box[] = [],
  corridors: [Point, Point][] = [],
): MapChip[] {
  const { k, box } = frame;
  const chips: MapChip[] = [];
  const callouts: { n: GraphNode; p: Point; poly: Point[]; bounds: Box; display: string; text: string; badge?: string }[] = [];
  const places = nodes.filter((n) => n.type === "room" || BADGE[n.type])
    .map((n) => ({ n, p: frame.pt(n) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x || a.n.id.localeCompare(b.n.id));
  const ordered = [...places.filter((x) => x.n.outline && x.n.outline.length >= 3), ...places.filter((x) => !x.n.outline || x.n.outline.length < 3)];
  const allOutlines = nodes.filter((o) => o.outline && o.outline.length >= 3).map((o) => ({ id: o.id, b: polyBounds(o.outline!.map(frame.pt)) }));

  for (const { n, p } of ordered) {
    const badge = BADGE[n.type];
    const isRoom = n.type === "room";
    const isRestroom = isRoom && /화장실|bathroom|restroom/i.test(n.label || "");
    const text = isRestroom ? "화장실" : mapNodeLabel(n);
    const display = text;
    const poly = n.outline && n.outline.length >= 3 ? n.outline.map(frame.pt) : undefined;
    const footprint = poly ? footprintBox(poly) : null;
    const nearest = Math.min(...places.filter((o) => o.n.id !== n.id).map((o) => Math.hypot(o.p.x - p.x, o.p.y - p.y)).filter((d) => d > 1e-8), Infinity);
    const pointSpace = isRoom ? nearest * 0.8 : Infinity;
    const maxWidth = footprint?.w ?? Math.min(76 * k, box.w, pointSpace);
    const maxHeight = footprint?.h ?? Math.min(34 * k, box.h, pointSpace);
    const layout = fitMapText(display, {
      fontSize: 10 * k,
      maxWidth,
      maxHeight: Math.min(maxHeight, 32 * k),
      paddingX: footprint ? 4 * k : 6 * k,
      paddingY: footprint ? 3 * k : 4 * k,
      measure: frame.measure,
      nowrap: isRoom,
    });
    const { width: w, height: h, fontSize, lines, lineHeight } = layout;
    const centre = footprint ?? p;
    const x = footprint ? centre.x : Math.max(box.x + w / 2, Math.min(box.x + box.w - w / 2, centre.x));
    const y = footprint ? centre.y : Math.max(box.y + h / 2, Math.min(box.y + box.h - h / 2, centre.y));
    const spot: Box = { x, y, w, h };

    if (footprint && poly) {
      const collides = [...chips, ...reserved].some((o) => overlap(spot, { ...o, w: o.w + 4 * k, h: o.h + 4 * k }) > 0);
      const hitsPath = Boolean(badge) && corridors.some(([a, b]) => segmentBoxOverlap(a, b, spot, 2 * k) > 0);
      if (fontSize < 9 * k || lines.length > 2 || collides || hitsPath) {
        callouts.push({ n, p, poly, bounds: polyBounds(poly), display, text, badge });
        continue;
      }
    } else if (badge) {
      const collidesChip = [...chips, ...reserved].some((o) => overlap(spot, { ...o, w: o.w + 4 * k, h: o.h + 4 * k }) > 0);
      const collidesSpace = allOutlines.some((o) => o.id !== n.id && overlap(spot, { ...o.b, w: o.b.w + 2 * k, h: o.b.h + 2 * k }) > 0);
      const hitsPath = corridors.some(([a, b]) => segmentBoxOverlap(a, b, spot, 1.5 * k) > 0);
      if (collidesChip || collidesSpace || hitsPath) {
        const doorPts = n.door?.length === 2 ? n.door.map(frame.pt) : undefined;
        const dx = doorPts ? Math.max(Math.abs(doorPts[1].x - doorPts[0].x) / 2, 2 * k) : 2 * k;
        const dy = doorPts ? Math.max(Math.abs(doorPts[1].y - doorPts[0].y) / 2, 2 * k) : 2 * k;
        const cx = doorPts ? (doorPts[0].x + doorPts[1].x) / 2 : p.x;
        const cy = doorPts ? (doorPts[0].y + doorPts[1].y) / 2 : p.y;
        const synthPoly = [{ x: cx - dx, y: cy - dy }, { x: cx + dx, y: cy - dy }, { x: cx + dx, y: cy + dy }, { x: cx - dx, y: cy + dy }];
        callouts.push({ n, p, poly: synthPoly, bounds: polyBounds(synthPoly), display, text, badge });
        continue;
      }
    }
    chips.push({ n, x, y, w, h, anchor: p, text, lines, lineHeight, fontSize, badge, leader: poly && footprint ? tinyLeader({ x, y, w, h }, poly, k) : undefined });
  }

  callouts.sort((a, b) => {
    const sameRow = Math.abs(a.bounds.y - b.bounds.y) < Math.max(a.bounds.h, b.bounds.h, 20 * k) * 0.6;
    return (sameRow ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y) || a.bounds.x - b.bounds.x || a.n.id.localeCompare(b.n.id);
  });

  const segmentsCross = (a: Point, b: Point, c: Point, d: Point) => {
    const ccw = (p1: Point, p2: Point, p3: Point) => (p3.y - p1.y) * (p2.x - p1.x) > (p2.y - p1.y) * (p3.x - p1.x);
    return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);
  };

  const placedCallouts: { bounds: Box; chip: Box; dir: CalloutDir; leader: { from: Point; to: Point } }[] = [];
  for (const { n, p, poly, bounds, display, text, badge } of callouts) {
    const isRoom = n.type === "room";
    const layout = fitMapText(display, {
      fontSize: 10 * k,
      maxWidth: Math.min(78 * k, box.w),
      maxHeight: Math.min(60 * k, box.h),
      paddingX: 5.5 * k,
      paddingY: 3.5 * k,
      measure: frame.measure,
      nowrap: isRoom,
    });
    const { width: w, height: h, fontSize, lines, lineHeight } = layout;
    const candidates: (Box & { dir: CalloutDir; shift: number; leaderLen: number; leader: { from: Point; to: Point } })[] = [];
    for (const gap of [8 * k, 13 * k, 18 * k, 23 * k, 32 * k, 44 * k]) {
      for (const shift of [-12 * k, 12 * k, -20 * k, 20 * k, -30 * k, 30 * k, -42 * k, 42 * k, 0]) {
        const dirs: { dir: CalloutDir; x: number; y: number }[] = [
          { dir: "bottom", x: bounds.x + shift, y: bounds.y + (bounds.h + h) / 2 + gap },
          { dir: "top",    x: bounds.x + shift, y: bounds.y - (bounds.h + h) / 2 - gap },
          { dir: "left",   x: bounds.x - (bounds.w + w) / 2 - gap, y: bounds.y + shift },
          { dir: "right",  x: bounds.x + (bounds.w + w) / 2 + gap, y: bounds.y + shift },
        ];
        for (const pos of dirs) {
          const c = { x: clamp(pos.x, box.x + w / 2, box.x + box.w - w / 2), y: clamp(pos.y, box.y + h / 2, box.y + box.h - h / 2), w, h };
          const wallAim = pos.dir === "bottom" ? { x: bounds.x + clamp(shift * 0.15, -bounds.w * 0.25, bounds.w * 0.25), y: bounds.y + bounds.h / 2 }
            : pos.dir === "top" ? { x: bounds.x + clamp(shift * 0.15, -bounds.w * 0.25, bounds.w * 0.25), y: bounds.y - bounds.h / 2 }
            : pos.dir === "left" ? { x: bounds.x - bounds.w / 2, y: bounds.y + clamp(shift * 0.15, -bounds.h * 0.25, bounds.h * 0.25) }
            : { x: bounds.x + bounds.w / 2, y: bounds.y + clamp(shift * 0.15, -bounds.h * 0.25, bounds.h * 0.25) };
          const from = nearestBoundary(wallAim, poly);
          const to = pos.dir === "bottom" || pos.dir === "top"
            ? {
                x: clamp(c.x + (from.x - c.x) * 0.2, c.x - w / 2 + 4 * k, c.x + w / 2 - 4 * k),
                y: pos.dir === "bottom" ? c.y - h / 2 : c.y + h / 2,
              }
            : {
                x: pos.dir === "left" ? c.x + w / 2 : c.x - w / 2,
                y: clamp(c.y + (from.y - c.y) * 0.2, c.y - h / 2 + 3 * k, c.y + h / 2 - 3 * k),
              };
          const leaderLen = Math.hypot(to.x - from.x, to.y - from.y);
          if (leaderLen >= 4 * k && leaderLen <= 48 * k) {
            candidates.push({ ...c, dir: pos.dir, shift, leaderLen, leader: { from, to } });
          }
        }
      }
    }
    const isRowSibling = (other: Box) =>
      Math.abs(other.y - bounds.y) < Math.max(other.h, bounds.h, 20 * k) * 0.6 &&
      Math.abs(other.x - bounds.x) < 70 * k;
    const nearbyPlaced = placedCallouts.filter((o) => Math.hypot(o.bounds.x - bounds.x, o.bounds.y - bounds.y) < 90 * k);
    const siblingCallouts = callouts.filter((o) => o.n.id !== n.id && isRowSibling(o.bounds));
    const score = (c: typeof candidates[number]) => {
      const collisions = [...chips, ...reserved].reduce((sum, o) => sum + overlap(c, { ...o, w: o.w + 4.5 * k, h: o.h + 4.5 * k }), 0);
      const pathHits = corridors.reduce((sum, [a, b]) => sum + segmentBoxOverlap(a, b, c, 3.5 * k), 0);
      const leaderHitsChip = [...chips, ...reserved].reduce((sum, o) => sum + segmentBoxOverlap(c.leader.from, c.leader.to, o, 1.5 * k), 0);
      const coversRoom = allOutlines.filter((o) => o.id !== n.id).reduce((sum, o) => sum + overlap(c, o.b), 0);
      const coversOwn = overlap(c, { ...bounds, w: bounds.w + 2 * k, h: bounds.h + 2 * k });
      const sameDirBonus = nearbyPlaced.some((o) => o.dir === c.dir) ? -30 * k : 0;
      const spreadBonus = siblingCallouts.reduce((sum, o) => {
        const dx = bounds.x - o.bounds.x;
        if (Math.abs(dx) <= 1e-4) return sum;
        if (Math.sign(c.shift) === Math.sign(dx)) return sum - 4 * k;
        if (Math.sign(c.shift) === -Math.sign(dx)) return sum + 25 * k;
        return sum;
      }, 0);
      const orderPenalty = nearbyPlaced.reduce((sum, o) => {
        const crossedLeader = segmentsCross(c.leader.from, c.leader.to, o.leader.from, o.leader.to) ? 50000 : 0;
        if (!isRowSibling(o.bounds)) return sum + crossedLeader;
        const dx = bounds.x - o.bounds.x;
        const invertedX = (dx > 2 * k && c.x <= o.chip.x + 2 * k) || (dx < -2 * k && c.x >= o.chip.x - 2 * k) ? 50000 : 0;
        return sum + crossedLeader + invertedX;
      }, 0);
      const ldx = Math.abs(c.leader.to.x - c.leader.from.x);
      const ldy = Math.abs(c.leader.to.y - c.leader.from.y);
      const straightPenalty = ldx < 3.5 * k || ldy < 3.5 * k ? 1500 : 0;
      const overReachPenalty = c.leaderLen > 24 * k ? 5000 : 0;
      return (
        collisions * 10000 +
        orderPenalty +
        pathHits * 8000 +
        leaderHitsChip * 2000 +
        coversOwn * 500 +
        coversRoom * 25 +
        overReachPenalty +
        straightPenalty +
        c.leaderLen +
        Math.abs(c.shift) * 0.25 +
        sameDirBonus +
        spreadBonus
      );
    };
    const best = candidates.sort((a, b) => score(a) - score(b))[0];
    if (best) placedCallouts.push({ bounds, chip: best, dir: best.dir, leader: best.leader });
    const spot = best ?? { x: bounds.x, y: bounds.y, w, h };
    chips.push({ n, x: spot.x, y: spot.y, w: spot.w, h: spot.h, leader: best?.leader, anchor: p, text, lines, lineHeight, fontSize, badge, callout: true });
  }
  return chips.sort((a, b) => places.findIndex((p) => p.n.id === a.n.id) - places.findIndex((p) => p.n.id === b.n.id));
}
