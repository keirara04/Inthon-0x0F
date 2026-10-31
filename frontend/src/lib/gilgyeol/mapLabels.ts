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
  const fallback = { room: "호실", stairs: "계단", elevator_hall: "엘리베이터", exit: "비상구", entrance: "출입구", junction: "복도", landmark: "표지" };
  return node.label.trim() || fallback[node.type];
}

/** Grow the box and wrap first, then reduce the font only if the entire text still does not fit. */
export function fitMapText(text: string, options: {
  fontSize: number; maxWidth: number; maxHeight: number;
  paddingX?: number; paddingY?: number; measure?: TextMeasure;
}) {
  const measure = options.measure ?? approximateMeasure;
  const maxWidth = Math.max(0.001, options.maxWidth);
  const maxHeight = Math.max(0.001, options.maxHeight);
  const px = Math.min(options.paddingX ?? 0, maxWidth * 0.2);
  const py = Math.min(options.paddingY ?? 0, maxHeight * 0.2);
  const contentWidth = maxWidth - 2 * px;
  const contentHeight = maxHeight - 2 * py;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const paragraphs = text.split("\n").map((part) => [...segmenter.segment(part)].map((s) => s.segment));
  const wrap = (fontSize: number) => {
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
export type MapChip = Box & { n: GraphNode; anchor: Point; text: string; lines: string[]; lineHeight: number; fontSize: number; badge?: string };
const BADGE: Partial<Record<NodeType, string>> = { stairs: "계", elevator_hall: "승", exit: "출", entrance: "입" };
/** Keep every place named and selectable; move crowded labels instead of replacing them with dots. */
export function placeMapChips(nodes: GraphNode[], frame: { k: number; box: Box; pt: (n: GraphNode) => Point; measure?: TextMeasure }, reserved: Box[] = []): MapChip[] {
  const { k, box } = frame;
  const gap = 3 * k;
  const chips: MapChip[] = [];
  const places = nodes.filter((n) => n.type === "room" || BADGE[n.type])
    .map((n) => ({ n, p: frame.pt(n) }))
    .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x || a.n.id.localeCompare(b.n.id));

  for (const { n, p } of places) {
    const badge = BADGE[n.type];
    const text = mapNodeLabel(n);
    const layout = fitMapText(text, {
      fontSize: 10 * k, maxWidth: Math.min(110 * k, box.w), maxHeight: Math.min(75 * k, box.h),
      paddingX: 5 * k, paddingY: 3.5 * k, measure: frame.measure,
    });
    const { width: w, height: h, fontSize, lines, lineHeight } = layout;
    // Search both axes across the visible map, nearest first. Edge candidates keep labels inside the crop.
    const axis = (at: number, lo: number, hi: number, step: number) => {
      const clamp = (value: number) => Math.max(lo, Math.min(hi, value));
      const values = new Set([clamp(at), lo, hi]);
      for (let d = step; d <= hi - lo + step; d += step) {
        values.add(clamp(at - d));
        values.add(clamp(at + d));
      }
      return [...values];
    };
    const xs = axis(p.x, box.x + w / 2, box.x + box.w - w / 2, w + gap);
    const ys = axis(p.y, box.y + h / 2, box.y + box.h - h / 2, h + gap);
    const candidates = ys.flatMap((y) => xs.map((x) => ({ x, y, w, h })))
      .sort((a, b) => (a.x - p.x) ** 2 + (a.y - p.y) ** 2 - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2));
    const overlap = (c: Box) => [...reserved, ...chips].reduce((sum, o) =>
      sum + Math.max(0, (o.w + c.w) / 2 + gap - Math.abs(o.x - c.x)) * Math.max(0, (o.h + c.h) / 2 + gap - Math.abs(o.y - c.y)), 0);
    let best = candidates[0];
    let least = Infinity;
    for (const candidate of candidates) {
      const area = overlap(candidate);
      if (area < least) { best = candidate; least = area; }
      if (area === 0) break;
    }
    // Even an exceptionally dense map keeps all labels, choosing the least overlap rather than hiding a room.
    chips.push({ n, ...best, anchor: p, text, lines, lineHeight, fontSize, badge });
  }
  return chips;
}
