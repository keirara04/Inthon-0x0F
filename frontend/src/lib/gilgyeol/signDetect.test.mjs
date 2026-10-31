// Run: node --test src/lib/gilgyeol/signDetect.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { boxDrift, detectSign, smoothBox } from "./signDetect.ts";

/** Grey granite-ish frame with optional coloured rectangles painted on. */
function frame(w, h, rects) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([168, 166, 160, 255], i * 4);
  for (const { x, y, rw, rh, rgb } of rects)
    for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) px.set([...rgb, 255], (yy * w + xx) * 4);
  return px;
}

test("finds the plaque from its red title band", () => {
  const px = frame(160, 120, [
    { x: 30, y: 20, rw: 100, rh: 66, rgb: [222, 214, 196] }, // beige plaque
    { x: 30, y: 20, rw: 100, rh: 10, rgb: [150, 30, 50] }, // burgundy title band
  ]);
  const box = detectSign(px, 160, 120);
  assert.ok(box);
  assert.ok(Math.abs(box.x - 30 / 160) < 0.02 && Math.abs(box.w - 100 / 160) < 0.02);
  assert.ok(Math.abs(box.y - 20 / 120) < 0.02);
  assert.ok(box.h > 0.4 && box.h < 0.65); // extended down to the plaque shape
});

test("ignores a plain wall and a tall coloured object", () => {
  assert.equal(detectSign(frame(160, 120, []), 160, 120), null);
  const shirt = frame(160, 120, [{ x: 60, y: 30, rw: 30, rh: 70, rgb: [40, 90, 200] }]);
  assert.equal(detectSign(shirt, 160, 120), null);
});

test("smoothing glides and drift measures corner movement", () => {
  const a = { x: 0, y: 0, w: 0.5, h: 0.5 };
  const b = { x: 0.1, y: 0, w: 0.5, h: 0.5 };
  assert.ok(Math.abs(smoothBox(a, b).x - 0.05) < 1e-9);
  assert.ok(Math.abs(boxDrift(a, b) - 0.1) < 1e-9);
});
