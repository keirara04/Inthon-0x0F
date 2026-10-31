import { test } from "node:test";
import assert from "node:assert/strict";
import { combineRestroomSections } from "./restroomGraph.ts";
import { shortestPath } from "./geometry.ts";

const room = (id, label, x, y, w, h) => ({ id, label, type: "room", x: x + w / 2, y: y + h / 2, ocr: "", servedFloors: "", src: "ai", outline: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] });
const area = (p) => Math.abs(p.reduce((a, v, i) => a + v.x * p[(i + 1) % p.length].y - v.y * p[(i + 1) % p.length].x, 0)) / 2;

test("106/106A and 107/107A become two complete bathrooms with retained corridor access", () => {
  const nodes = [room("106A", "106A호(화장실)", 0, 0, 4, 2), room("106", "106호(화장실)", 0, 2, 4, 6), room("107A", "107A호(화장실)", 6, 0, 4, 2), room("107", "107호(화장실)", 6, 2, 4, 6), { id: "hall", type: "junction", x: 5, y: -1 }];
  const graph = { nodes, edges: [{ a: "hall", b: "106A" }, { a: "106A", b: "106" }, { a: "hall", b: "106" }, { a: "hall", b: "107A" }, { a: "107A", b: "107" }] };
  const before = structuredClone(graph), g = combineRestroomSections(graph);
  assert.deepEqual(g.nodes.filter((n) => n.type === "room").map((n) => n.label), ["화장실", "화장실"]);
  assert.equal(area(g.nodes.find((n) => n.id === "106").outline), 32);
  assert.equal(g.edges.length, 2);
  assert.deepEqual(shortestPath(g.nodes, g.edges, "106", "107"), ["106", "hall", "107"]);
  assert.deepEqual(graph, before);
  assert.deepEqual(combineRestroomSections(g), g);
});

test("merging preserves an L-shaped exterior without filling the neighbouring space", () => {
  const g = combineRestroomSections({ nodes: [room("a", "106A호(화장실)", 0, 0, 4, 2), room("b", "106호(화장실)", 0, 2, 2, 4)], edges: [] });
  assert.equal(g.nodes.length, 1);
  assert.equal(g.nodes[0].outline.length, 6);
  assert.equal(area(g.nodes[0].outline), 16);
});

test("different numbers, ordinary A classrooms and disconnected bathrooms stay separate", () => {
  for (const nodes of [
    [room("209", "화장실", 0, 0, 4, 4), room("210", "화장실", 0, 4, 4, 4)],
    [room("106", "화장실", 0, 0, 4, 4), room("106A", "화장실", 10, 0, 4, 4)],
    [room("106", "화장실", 0, 0, 4, 4), room("106A", "106A호(강의실)", 0, 4, 4, 4)],
  ]) {
    const g = { nodes, edges: [] };
    assert.deepEqual(combineRestroomSections(g), g);
  }
});
