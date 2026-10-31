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
].map((n) => {
  const [w, h] = /화장실/.test(n.label) ? [36, 36] : n.type === "room" ? [80, 60] : [30, 30];
  return { ...n, outline: [{ x: n.x - w / 2, y: n.y - h / 2 }, { x: n.x + w / 2, y: n.y - h / 2 }, { x: n.x + w / 2, y: n.y + h / 2 }, { x: n.x - w / 2, y: n.y + h / 2 }] };
});

test("both bathrooms remain named and selectable alongside all other places", () => {
  const chips = placeMapChips(floor, frame);
  assert.equal(chips.length, floor.length);
  assert.equal(chips.find((c) => c.n.id === "209").text, "화장실");
  assert.equal(chips.find((c) => c.n.id === "210").text, "화장실");
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

test("labels stay over their own rooms without changing graph coordinates", () => {
  const before = structuredClone(floor);
  const chips = placeMapChips(floor, frame);
  assert.deepEqual(floor, before);
  for (const c of chips) {
    assert.deepEqual(c.anchor, { x: c.n.x, y: c.n.y });
    if (!c.callout) {
      assert.equal(c.x, c.n.x);
      assert.equal(c.y, c.n.y);
    } else {
      assert.ok(c.fontSize >= 9 * frame.k);
      assert.ok(Math.hypot(c.leader.to.x - c.leader.from.x, c.leader.to.y - c.leader.from.y) <= 24 * frame.k);
    }
  }
});

test("a node at the doorway gets a label inside the room, fitted without spilling into neighbours", () => {
  const n = { ...node("room", 100, 220, "room", "101호"), outline: [{ x: 100, y: 220 }, { x: 180, y: 220 }, { x: 180, y: 280 }, { x: 100, y: 280 }] };
  const [c] = placeMapChips([n], frame);
  assert.equal(c.x, 140);
  assert.equal(c.y, 250);
  assert.ok(c.x - c.w / 2 > 100 && c.x + c.w / 2 < 180);
  assert.ok(c.y - c.h / 2 > 220 && c.y + c.h / 2 < 280);
  assert.equal(c.callout, undefined, "a label that fits stays inside the room");
  assert.ok(c.leader, "fitted labels still have a tiny connector");
  assert.ok(Math.hypot(c.leader.to.x - c.leader.from.x, c.leader.to.y - c.leader.from.y) <= 4 * frame.k);
  for (const p of [c.leader.from, c.leader.to]) assert.ok(p.x > 100 && p.x < 180 && p.y > 220 && p.y < 280);
  assert.equal(c.lines.join(""), "101호");
  assert.deepEqual(placeMapChips(floor, frame), placeMapChips([...floor].reverse(), frame));
});

test("only a cramped footprint gets a readable nearby callout from its wall, not its door node", () => {
  const n = { ...node("106", 340, 320, "room", "106호(화장실)"), outline: [{ x: 340, y: 320 }, { x: 360, y: 320 }, { x: 360, y: 420 }, { x: 340, y: 420 }] };
  const [c] = placeMapChips([n], frame);
  assert.ok(c.leader);
  assert.equal(c.callout, true);
  assert.ok(c.fontSize >= 9 * frame.k);
  assert.deepEqual(c.lines, ["화장실"]);
  assert.ok(Math.hypot(c.leader.to.x - c.leader.from.x, c.leader.to.y - c.leader.from.y) <= 24 * frame.k);
  assert.ok(c.leader.from.x === 340 || c.leader.from.x === 360 || c.leader.from.y === 320 || c.leader.from.y === 420);
  assert.notDeepEqual(c.leader.from, c.anchor, "do not draw a line all the way from the graph's door coordinate");
});

test("even coincident room centres retain separate labels", () => {
  const crowded = Array.from({ length: 12 }, (_, i) => node(`room-${i}`, 350, 400));
  const chips = placeMapChips(crowded, frame);
  assert.equal(new Set(chips.map((c) => c.n.id)).size, crowded.length);
  assert.ok(chips.every((c) => c.x === 350 && c.y === 400), "unknown room outlines must not scatter labels around unrelated rooms");
  assert.deepEqual(placeMapChips([], frame), []);
});

test("a concave room keeps its label in an occupied part of its outline", () => {
  const n = { ...node("L", 80, 80), outline: [{ x: 100, y: 220 }, { x: 200, y: 220 }, { x: 200, y: 250 }, { x: 130, y: 250 }, { x: 130, y: 320 }, { x: 100, y: 320 }] };
  const [chip] = placeMapChips([n], frame);
  for (const x of [chip.x - chip.w / 2, chip.x + chip.w / 2]) for (const y of [chip.y - chip.h / 2, chip.y + chip.h / 2]) {
    assert.ok(x >= 100 && x <= 200 && y >= 220 && y <= 320 && (x <= 130 || y <= 250));
  }
});


test("long labels stay inside unusually narrow map crops", () => {
  const narrow = { ...frame, box: { x: 330, y: 207, w: 40, h: 360 } };
  const [chip] = placeMapChips([node("209", 350, 430, "room", "209호(화장실)")], narrow);
  assert.ok(chip.w <= narrow.box.w);
  assert.ok(chip.fontSize <= 10 * frame.k);
  assert.ok(chip.lines.length >= 1);
  assert.ok(chip.x - chip.w / 2 >= narrow.box.x);
  assert.ok(chip.x + chip.w / 2 <= narrow.box.x + narrow.box.w);
});


test("full names and facility names are kept without an eight-character limit", () => {
  const full = "209호 세미나실 · 장애인 이용 가능";
  const [chip] = placeMapChips([node("209", 350, 430, "room", full)], frame);
  assert.equal(chip.text, full);
  assert.equal(chip.lines.join(""), full);
  assert.equal(chip.lines.length, 1);
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

test("room labels retain '호' and never break into multiple lines", () => {
  const rooms = [
    node("101", 100, 200, "room", "101"),
    node("105", 200, 200, "room", "105호"),
    node("106", 300, 200, "room", "106 화장실"),
  ];
  const chips = placeMapChips(rooms, frame);
  const chip101 = chips.find((c) => c.n.id === "101");
  const chip105 = chips.find((c) => c.n.id === "105");
  const chip106 = chips.find((c) => c.n.id === "106");
  assert.equal(chip101.text, "101호");
  assert.equal(chip101.lines.length, 1);
  assert.equal(chip105.text, "105호");
  assert.equal(chip105.lines.length, 1);
  assert.equal(chip106.text, "화장실");
  assert.equal(chip106.lines.length, 1);
});

test("adjacent narrow restrooms branch in the same direction without blocking corridors, and stair/exit badges never overlap", () => {
  const f = { k: 2.2, box: { x: 0, y: 100, w: 1000, h: 850 }, pt: (n) => ({ x: n.x, y: n.y }) };
  const nodes = [
    { ...node("106", 380, 620, "room", "화장실"), outline: [{ x: 350, y: 480 }, { x: 410, y: 480 }, { x: 410, y: 765 }, { x: 350, y: 765 }] },
    { ...node("107", 450, 620, "room", "화장실"), outline: [{ x: 420, y: 480 }, { x: 480, y: 480 }, { x: 480, y: 765 }, { x: 420, y: 765 }] },
    { ...node("101", 555, 690, "room", "101호"), outline: [{ x: 485, y: 620 }, { x: 625, y: 620 }, { x: 625, y: 765 }, { x: 485, y: 765 }] },
    { ...node("102", 555, 550, "room", "102호"), outline: [{ x: 485, y: 480 }, { x: 625, y: 480 }, { x: 625, y: 615 }, { x: 485, y: 615 }] },
    { ...node("stairs-2", 825, 370, "stairs", "계단"), outline: [{ x: 740, y: 330 }, { x: 910, y: 330 }, { x: 910, y: 410 }, { x: 740, y: 410 }] },
    { ...node("exit-2", 910, 370, "exit", "비상구"), door: [{ x: 910, y: 345 }, { x: 910, y: 395 }] },
  ];
  const corridors = [
    [{ x: 230, y: 280 }, { x: 230, y: 860 }],
    [{ x: 230, y: 445 }, { x: 805, y: 445 }],
    [{ x: 805, y: 445 }, { x: 805, y: 410 }],
  ];
  // Make right restroom node have a smaller y so it would sort first by y-coordinate alone
  nodes.find((n) => n.id === "107").y = 580;
  nodes.find((n) => n.id === "106").y = 650;

  const chips = placeMapChips(nodes, f, [], corridors);
  const c106 = chips.find((c) => c.n.id === "106");
  const c107 = chips.find((c) => c.n.id === "107");
  const cStair = chips.find((c) => c.n.id === "stairs-2");
  const cExit = chips.find((c) => c.n.id === "exit-2");

  // Both restrooms branch downward in the same direction (below y=765), clear of the corridors at x=230 and y=445
  assert.ok(c106.y > 765 && c107.y > 765, `both restrooms should branch downward in the same direction: ${c106.y}, ${c107.y}`);
  assert.ok(c106.x < c107.x, `left toilet (106) must branch to the left of right toilet (107): ${c106.x} vs ${c107.x}`);
  assert.ok(c106.x - c106.w / 2 > 240, "restroom 106 must not block the vertical corridor at x=230");
  assert.ok(Math.hypot(c106.leader.to.x - c106.leader.from.x, c106.leader.to.y - c106.leader.from.y) >= 8 * f.k - 1e-4, "leader is long enough to be distinct");
  assert.ok(Math.hypot(c107.leader.to.x - c107.leader.from.x, c107.leader.to.y - c107.leader.from.y) >= 8 * f.k - 1e-4, "leader is long enough to be distinct");

  // No two chips overlap
  for (const [i, a] of chips.entries()) {
    for (const b of chips.slice(i + 1)) {
      assert.ok(Math.abs(a.x - b.x) * 2 >= a.w + b.w || Math.abs(a.y - b.y) * 2 >= a.h + b.h, `${a.n.id} and ${b.n.id} overlap`);
    }
  }
  assert.ok(cExit.leader, "overlapping exit badge branches out with a leader");
  assert.ok(Math.abs(cStair.x - cExit.x) * 2 >= cStair.w + cExit.w || Math.abs(cStair.y - cExit.y) * 2 >= cStair.h + cExit.h);
  for (const c of [c106, c107, cExit]) {
    assert.ok(Math.abs(c.leader.to.x - c.leader.from.x) > 2 * f.k, `${c.n.id} leader should not be vertical`);
    assert.ok(Math.abs(c.leader.to.y - c.leader.from.y) > 2 * f.k, `${c.n.id} leader should not be horizontal`);
  }
});

