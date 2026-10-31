// Run: node --test src/lib/gilgyeol/geometry.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { roomPolygon, shortestPath, snapAxis, snapOutlines, straighten } from "./geometry.ts";

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


test("room footprints retain different widths and depths at a shared 3D scale", () => {
  const room = (outline) => ({ id: "room", type: "room", label: "room", x: 5, y: 5, ocr: "", servedFloors: "", src: "ai", outline });
  const large = room([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }]);
  const small = room([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }]);
  assert.deepEqual(roomPolygon(large, 0.1), [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 1 }, { x: 0, z: 1 }]);
  assert.deepEqual(roomPolygon(small, 0.1), [{ x: 0, z: 0 }, { x: 0.5, z: 0 }, { x: 0.5, z: 0.4 }, { x: 0, z: 0.4 }]);
  assert.equal(roomPolygon(room(undefined), 0.1), null, "a missing boundary must not become a generic room");
  assert.equal(roomPolygon(room([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), 0.1), null, "a collapsed outline has no room area");
  assert.equal(roomPolygon(room([{ x: NaN, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }]), 0.1), null);
});
