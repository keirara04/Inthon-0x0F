// Finds an evacuation-map sign in a small camera frame, cheaply enough to run several times a second.
//
// Korean 피난안내도 plaques share one feature that survives distance, angle and glare: a wide, strongly
// coloured title band (red, green or blue, often with yellow-black stripes) across the top of the plaque.
// We find the largest wide, solid block of saturated colour and extend it down to the plaque's usual shape.

/** Fractions of the frame (0–1), top-left origin. */
export type Box = { x: number; y: number; w: number; h: number };

/** Plaque height ÷ width. Signs are close to A-series landscape; the 우정정보관 4F plaque measures 0.64. */
const PLAQUE_RATIO = 0.64;

/**
 * Detects the sign in RGBA pixels (`w`×`h`, e.g. 160×120 from a canvas). Returns the plaque's box, or null.
 * ponytail: header-band heuristic, axis-aligned box only; a sign without a coloured title band falls back
 * to the manual shutter. Upgrade path: a perspective quad (corner refinement) if tilted shots matter.
 */
export function detectSign(px: Uint8ClampedArray, w: number, h: number): Box | null {
  const n = w * h;
  const coloured = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const max = Math.max(r, g, b);
    // Saturation threshold 50 (was 70): under 1F lighting the red title band measured 68 and was missed.
    coloured[i] = max > 90 && max - Math.min(r, g, b) > 50 ? 1 : 0;
  }

  // Largest wide, solid connected block of colour.
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let best: { x0: number; x1: number; y0: number; y1: number; count: number } | null = null;
  for (let start = 0; start < n; start++) {
    if (!coloured[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let [x0, x1, y0, y1, count] = [w, 0, h, 0, 0];
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const y = (i - x) / w;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || seen[j] || !coloured[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue; // don't wrap rows
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    // A title band: at least a fifth of the frame wide, clearly wider than tall, mostly filled.
    if (bw < w * 0.2 || bw / bh < 2.5 || count / (bw * bh) < 0.55) continue;
    if (!best || count > best.count) best = { x0, x1, y0, y1, count };
  }
  if (!best) return null;

  // Title bands often end in yellow-black hazard stripes, which break the colour run. Follow the band's
  // middle row outward while pixels stay coloured or dark, so the box covers the stripes too.
  const mid = Math.round((best.y0 + best.y1) / 2);
  const bandLike = (x: number) => {
    const i = mid * w + x;
    const luma = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    return coloured[i] === 1 || luma < 70;
  };
  while (best.x1 + 1 < w && bandLike(best.x1 + 1)) best.x1++;
  while (best.x0 > 0 && bandLike(best.x0 - 1)) best.x0--;

  const bw = best.x1 - best.x0 + 1;
  const top = best.y0 / h;
  const height = Math.min((bw * PLAQUE_RATIO) / h, 1 - top);
  return { x: best.x0 / w, y: top, w: bw / w, h: height };
}

/** The box grown by `m` of its own size on every side (clamped to the frame), so a crop keeps the sign's edges. */
export function withMargin(b: Box, m = 0.07): Box {
  const x0 = Math.max(0, b.x - b.w * m);
  const y0 = Math.max(0, b.y - b.h * m);
  const x1 = Math.min(1, b.x + b.w * (1 + m));
  const y1 = Math.min(1, b.y + b.h * (1 + m));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Runs detectSign on any image (camera frame, decoded photo) via a 160px-wide canvas. Browser only. */
export function detectSignIn(src: CanvasImageSource, sw: number, sh: number): Box | null {
  const W = 160;
  const H = Math.max(1, Math.round((W * sh) / sw));
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, W, H);
  return detectSign(ctx.getImageData(0, 0, W, H).data, W, H);
}

/** Largest corner movement between two boxes, in frame fractions. */
export function boxDrift(a: Box, b: Box): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.x + a.w - b.x - b.w), Math.abs(a.y + a.h - b.y - b.h));
}

/** Moves `prev` part of the way toward `next`, so the on-screen frame glides instead of jittering. */
export function smoothBox(prev: Box | null, next: Box, k = 0.5): Box {
  if (!prev) return next;
  return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k, w: prev.w + (next.w - prev.w) * k, h: prev.h + (next.h - prev.h) * k };
}
