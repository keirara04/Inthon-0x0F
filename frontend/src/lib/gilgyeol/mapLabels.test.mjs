import { test } from "node:test";
import assert from "node:assert/strict";
import { fitMapText, mapNodeLabel, placeMapChips } from "./mapLabels.ts";

const node = (id, x, y, type = "room", label = id) => ({ id, x, y, type, label, ocr: "", servedFloors: "", src: "ai" });
const frame = { k: 568.235294117647 / 300, box: { x: 82.0588235294, y: 207.3497442455, w: 568.235294117647, h: 358.4814578005 }, pt: (n) => ({ x: n.x, y: n.y }) };
// Coordinates from the uploaded 2F map. The old three-position layout reduced 209 to an unlabeled dot.
const floor = [
  node("204", 426.47, 296.74), node("203", 511.76, 296.74),
  node("stairs-1", 261.76, 313.04, "stairs"), node("elevator", 358.82, 319.57, "elevator_hall"), node("stairs-2", 602.94, 326.09, "stairs"),
  node("210", 352.94, 384.78, "room", "210호(화장실)"), node("205", 211.76, 401.09),
  node("201", 426.47, 410.87), node("202", 555.88, 410.87), node("209", 352.94, 430.43, "room", "209호(화장실)"),
  node("206", 164.71, 518.48), node("207", 247.06, 518.48), node("208", 338.24, 518.48),
];

test("both bathrooms remain named and selectable alongside all other places", () => {
  const chips = placeMapChips(floor, frame);
  assert.equal(chips.length, floor.length);
  assert.equal(chips.find((c) => c.n.id === "209").text, "209호(화장실)");
  assert.equal(chips.find((c) => c.n.id === "210").text, "210호(화장실)");
  for (const [i, a] of chips.entries()) {
    for (const b of chips.slice(i + 1)) {
      assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.y - b.y) * 2 >= a.h + b.h, `${a.n.id} and ${b.n.id} overlap`);
    }
    assert.ok(a.x - a.w / 2 >= frame.box.x - 1e-8);
    assert.ok(a.x + a.w / 2 <= frame.box.x + frame.box.w + 1e-8);
    assert.ok(a.y - a.h / 2 >= frame.box.y - 1e-8);
    assert.ok(a.y + a.h / 2 <= frame.box.y + frame.box.h + 1e-8);
  }
});

test("moving labels preserves the room coordinates and connection anchors", () => {
  const before = structuredClone(floor);
  const chips = placeMapChips(floor, frame);
  assert.deepEqual(floor, before);
  assert.ok(chips.some((c) => c.x !== c.anchor.x || c.y !== c.anchor.y));
  for (const c of chips) assert.deepEqual(c.anchor, { x: c.n.x, y: c.n.y });
});

test("current-location marker is reserved and layout is deterministic", () => {
  const reserved = [{ x: 352.94, y: 374.78, w: 44 * frame.k, h: 50 * frame.k }];
  const chips = placeMapChips(floor, frame, reserved);
  assert.deepEqual(chips, placeMapChips([...floor].reverse(), frame, reserved));
  for (const c of chips) {
    const r = reserved[0];
    assert.ok(Math.abs(c.x - r.x) * 2 >= c.w + r.w || Math.abs(c.y - r.y) * 2 >= c.h + r.h);
  }
});

test("even coincident room centres retain separate labels", () => {
  const crowded = Array.from({ length: 12 }, (_, i) => node(`room-${i}`, 350, 400));
  const chips = placeMapChips(crowded, frame);
  assert.equal(new Set(chips.map((c) => c.n.id)).size, crowded.length);
  assert.equal(new Set(chips.map((c) => `${c.x},${c.y}`)).size, crowded.length);
  assert.deepEqual(placeMapChips([], frame), []);
});


test("long labels stay inside unusually narrow map crops", () => {
  const narrow = { ...frame, box: { x: 330, y: 207, w: 40, h: 360 } };
  const [chip] = placeMapChips([node("209", 350, 430, "room", "209호(화장실)")], narrow);
  assert.ok(chip.w <= narrow.box.w);
  assert.ok(chip.fontSize <= 10 * frame.k);
  assert.ok(chip.lines.length > 1);
  assert.ok(chip.x - chip.w / 2 >= narrow.box.x);
  assert.ok(chip.x + chip.w / 2 <= narrow.box.x + narrow.box.w);
});


test("full names and facility names are kept without an eight-character limit", () => {
  const full = "209호(화장실) · 장애인 이용 가능";
  const [chip] = placeMapChips([node("209", 350, 430, "room", full)], frame);
  assert.equal(chip.text, full);
  assert.equal(chip.lines.join(""), full);
  assert.ok(chip.h > 17 * frame.k);
  assert.equal(mapNodeLabel(node("elevator", 0, 0, "elevator_hall", "중앙 엘리베이터 A")), "중앙 엘리베이터 A");
});

test("wrapping grows the label before reducing the font", () => {
  const measure = (text) => [...text].length;
  const fit = fitMapText("ABCDEFGHIJ", { fontSize: 10, maxWidth: 60, maxHeight: 60, measure });
  assert.equal(fit.fontSize, 10);
  assert.deepEqual(fit.lines, ["ABCDEF", "GHIJ"]);
  assert.equal(fit.height, 24);
  assert.equal(fit.width, 60);
});

test("long 2D and 3D labels fit the bounds with every character retained", () => {
  const text = "209호(화장실) 장애인 및 가족 이용 가능 · Long English room name ".repeat(4);
  for (const [maxWidth, maxHeight] of [[110, 75], [160, 100], [30, 20]]) {
    const fit = fitMapText(text, { fontSize: 20, maxWidth, maxHeight, paddingX: 4, paddingY: 4 });
    assert.equal(fit.lines.join(""), text);
    assert.ok(fit.fontSize > 0 && fit.fontSize < 20);
    assert.ok(fit.width <= maxWidth && fit.height <= maxHeight);
    assert.ok(fit.lines.length * fit.lineHeight + 2 * fit.paddingY <= maxHeight + 1e-8);
  }
});

test("wrapping keeps emoji graphemes intact and preserves explicit lines", () => {
  const emoji = "👨‍👩‍👧‍👦";
  const fit = fitMapText(emoji.repeat(3), { fontSize: 10, maxWidth: 12, maxHeight: 100, measure: (text) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length });
  assert.deepEqual(fit.lines, [emoji, emoji, emoji]);
  assert.deepEqual(fitMapText("209호\n화장실", { fontSize: 10, maxWidth: 100, maxHeight: 100 }).lines, ["209호", "화장실"]);
});
