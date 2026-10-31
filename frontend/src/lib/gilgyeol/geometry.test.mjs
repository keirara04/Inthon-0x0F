// Run: node --test src/lib/gilgyeol/geometry.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { fallbackOutlines, shortestPath, snapAxis, snapOutlines, straighten } from "./geometry.ts";

test("straighten squares off a hand-drawn rectangle", () => {
  const out = straighten([{ x: 0, y: 0.2 }, { x: 10, y: -0.2 }, { x: 10.3, y: 5 }, { x: -0.1, y: 5.2 }]);
  assert.equal(out[0].y, out[1].y); // top edge flat
  assert.equal(out[2].y, out[3].y); // bottom edge flat
  assert.equal(out[1].x, out[2].x); // right edge upright
  assert.equal(out[3].x, out[0].x); // left edge upright
});

test("snapAxis merges values within tolerance only", () => {
  const s = snapAxis([1, 1.05, 1.1, 3], 0.2);
  assert.equal(s(1), s(1.1));
  assert.notEqual(s(1), s(3));
});

test("snapOutlines makes neighbouring rooms share a wall", () => {
  const room = (id, x0, x1) => ({ id, type: "room", label: id, x: 0, y: 0, ocr: "", servedFloors: "", src: "ai", outline: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 50 }, { x: x0, y: 50 }] });
  const [a, b] = snapOutlines([room("a", 0, 49.8), room("b", 50.1, 100)]);
  assert.equal(a.outline[1].x, b.outline[0].x);
});

test("shortestPath follows edges and reports unreachable", () => {
  const n = (id, x) => ({ id, type: "junction", label: id, x, y: 0, ocr: "", servedFloors: "", src: "ai" });
  const nodes = [n("a", 0), n("b", 1), n("c", 2), n("d", 9)];
  const edges = [{ a: "a", b: "b", src: "ai" }, { a: "b", b: "c", src: "ai" }];
  assert.deepEqual(shortestPath(nodes, edges, "a", "c"), ["a", "b", "c"]);
  assert.deepEqual(shortestPath(nodes, edges, "a", "d"), []);
});

test("fallbackOutlines sizes rooms from their neighbours without overlap or covering the corridor", () => {
  // Three rooms in a row 20 apart, each with a door onto a corridor junction 15 below; one room already has an outline.
  const nodes = [
    { id: "r1", type: "room", label: "101호", x: 0, y: 0 },
    { id: "r2", type: "room", label: "102호", x: 20, y: 0 },
    { id: "r3", type: "room", label: "103호", x: 40, y: 0, outline: [{ x: 35, y: -5 }, { x: 45, y: -5 }, { x: 45, y: 5 }, { x: 35, y: 5 }] },
    { id: "j1", type: "junction", label: "", x: 0, y: 15 },
    { id: "j2", type: "junction", label: "", x: 20, y: 15 },
  ];
  const edges = [{ a: "r1", b: "j1" }, { a: "r2", b: "j2" }, { a: "j1", b: "j2" }];
  const out = fallbackOutlines(nodes, edges);
  const box = (id) => { const o = out.find((n) => n.id === id).outline; return { x0: Math.min(...o.map((p) => p.x)), x1: Math.max(...o.map((p) => p.x)), y1: Math.max(...o.map((p) => p.y)) }; };

  assert.equal(box("r1").x1, 9); // 45% of the 20 gap
  assert.equal(out.find((n) => n.id === "r1").outlineEstimated, true);
  assert.ok(box("r1").x1 < box("r2").x0, "neighbouring rooms don't overlap");
  assert.ok(box("r1").y1 < 15, "box stops before the corridor junction");
  assert.deepEqual(out.find((n) => n.id === "r3").outline, nodes[2].outline); // existing outline kept
  assert.equal(out.find((n) => n.id === "j1").outline, undefined); // corridors get none
});

test("fallbackOutlines leaves a lone room alone", () => {
  const nodes = [{ id: "r1", type: "room", label: "101호", x: 0, y: 0 }];
  assert.deepEqual(fallbackOutlines(nodes, []), nodes);
});
