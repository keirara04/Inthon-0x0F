import { test } from "node:test";
import assert from "node:assert/strict";
import { alignExitConnections, corridorSegments, facilityGraph, facilityThreshold, insideFootprint, portalSegment, stairTreads, visibleSegment } from "./facilityGeometry.ts";
import { shortestPath } from "./geometry.ts";
const room = { id: "stairs", type: "stairs", label: "계단", x: 5, y: 3, outline: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }] };

test("stair treads run along the long axis even when extraction reports the short axis", () => {
  const stair = { ...room, stairFlight: [{ x: 5, y: 0.5 }, { x: 5, y: 5.5 }] };
  const marks = stairTreads(stair, room.outline);
  assert.equal(marks.length, 8);
  for (const [a, b] of marks) {
    assert.equal(a.x, b.x, "a wide stairwell has an east-west flight and north-south tread marks");
    assert.ok(a.y !== b.y);
    assert.ok(insideFootprint(a, room.outline) && insideFootprint(b, room.outline));
  }
  assert.equal(stairTreads(room, room.outline).length, 8);
  const tall = room.outline.map(({ x, y }) => ({ x: y, y: x }));
  assert.ok(stairTreads(room, tall).every(([a, b]) => a.y === b.y), "tall stairwells run north-south");
});

test("the exit threshold and door landing stay clear of tread marks", () => {
  const door = [{ x: 0, y: 2 }, { x: 0, y: 4 }];
  const stair = { ...room, door, stairFlight: [{ x: 0, y: 3 }, { x: 9, y: 3 }] };
  const marks = stairTreads(stair, room.outline);
  assert.ok(marks.length > 0 && marks.length < 8);
  for (const [a, b] of marks) {
    assert.ok(a.x >= 1.2 && b.x >= 1.2, "treads stay behind the doorway landing");
    assert.equal(a.x, b.x);
  }
  assert.deepEqual(portalSegment({ id: "exit", x: 5, y: 3, door }, [room], { x: -3, y: 3 }, 2), door);
});

test("a legacy exit inside a stairwell moves to the corridor-facing threshold", () => {
  const [a, b] = portalSegment({ id: "exit", x: 5, y: 3 }, [room], { x: -3, y: 3 }, 2);
  assert.equal(a.x, 0);
  assert.equal(b.x, 0);
  assert.equal(Math.abs(b.y - a.y), 2);
  assert.equal((a.y + b.y) / 2, 3);
});

test("exit orientation follows its door segment or the connected corridor", () => {
  const n = { id: "exit", x: 15, y: 3 };
  const [a, b] = portalSegment(n, [], { x: 20, y: 3 }, 2);
  assert.equal(a.x, b.x, "an east-west approach needs a north-south door frame");
  const actual = [{ x: 14, y: 3 }, { x: 16, y: 4 }];
  assert.deepEqual(portalSegment({ ...n, door: actual }, [], undefined, 2), actual);
  assert.equal(visibleSegment([{ x: 0, y: 0 }, { x: 0, y: 0 }]), null);
  assert.equal(visibleSegment([{ x: NaN, y: 0 }, { x: 0, y: 2 }]), null);
});

const node = (id, type, x, y, extra = {}) => ({ id, type, x, y, label: id, ocr: "", servedFloors: "", src: "ai", ...extra });
const exitGraph = () => ({
  current_node_id: "current",
  nodes: [node("current", "junction", 3, 0), node("north", "junction", 12, 0), node("south", "junction", 12, 10),
    node("exit", "exit", 0, 3, { door: [{ x: -1, y: 3 }, { x: 1, y: 3 }] })],
  edges: [{ a: "current", b: "north", src: "ai" }, { a: "north", b: "south", src: "ai", lengthM: 20 }, { a: "current", b: "exit", src: "ai" }],
});

test("a western exit faces across the corridor approach, without using current position as its branch", () => {
  const input = exitGraph(), before = structuredClone(input);
  const g = alignExitConnections(input);
  const exit = g.nodes.find((n) => n.id === "exit");
  const junction = g.nodes.find((n) => n.id === "exit-approach");
  assert.deepEqual(exit.door, [{ x: 0, y: 2 }, { x: 0, y: 4 }]);
  assert.equal(junction.x, 12);
  assert.equal(junction.y, 3);
  assert.ok(!g.edges.some((e) => [e.a, e.b].includes("exit") && [e.a, e.b].includes("current")));
  assert.deepEqual(shortestPath(g.nodes, g.edges, "current", "exit"), ["current", "north", "exit-approach", "exit"]);
  assert.deepEqual(shortestPath(g.nodes, g.edges, "north", "south"), ["north", "exit-approach", "south"]);
  assert.equal(g.edges.filter((e) => e.lengthM !== undefined).reduce((sum, e) => sum + e.lengthM, 0), 20);
  assert.deepEqual(input, before, "rendering must not mutate the uploaded graph");
  assert.deepEqual(alignExitConnections(g), g, "repeated rendering must not add junctions");
});

test("exit corrections preserve entrance thresholds and never create paths through a room", () => {
  const input = exitGraph();
  const door = [{ x: 0, y: 9 }, { x: 4, y: 9 }];
  input.nodes.push(node("entrance", "entrance", 2, 9, { door }), node("room", "room", 5, 3, {
    outline: [{ x: 4, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 4 }, { x: 4, y: 4 }],
  }));
  const g = alignExitConnections(input);
  assert.ok(!g.nodes.some((n) => n.id === "exit-approach"));
  assert.deepEqual(g.edges, input.edges);
  assert.deepEqual(g.nodes.find((n) => n.id === "entrance").door, door);
  const sparse = { ...input, nodes: input.nodes.filter((n) => n.type !== "junction" || n.id === "current"), edges: [{ a: "current", b: "exit", src: "ai" }] };
  assert.deepEqual(alignExitConnections(sparse), sparse, "missing corridor evidence stays available for review");
});

test("stair entrances use the recorded opening and approach lines stop at that wall", () => {
  const stairs = { ...room, door: [{ x: 9.8, y: 2 }, { x: 9.8, y: 4 }] };
  const graph = facilityGraph({ current_node_id: null, nodes: [stairs, node("hall", "junction", 14, 3)], edges: [{ a: "hall", b: stairs.id, src: "ai" }] });
  assert.deepEqual(graph.nodes[0].door, [{ x: 10, y: 2 }, { x: 10, y: 4 }], "the entrance stays on the photographed right-hand wall");
  assert.deepEqual(corridorSegments(graph), [[{ x: 14, y: 3 }, { x: 10, y: 3 }]], "the corridor ends at the threshold, not inside the treads");
  const fallback = facilityThreshold(room, { x: 13, y: 8 });
  assert.ok(fallback.every((p) => p.x === 10), "without a readable door, use the corridor-facing end of the long stairwell");
});

test("a lift keeps its bold door edge; only an unreadable opening falls back toward nearby current position", () => {
  const lift = node("lift", "elevator_hall", 5, 3, { outline: room.outline });
  const current = node("here", "junction", -2, 3), otherHall = node("hall", "junction", 14, 3);
  const graph = { current_node_id: "here", nodes: [lift, current, otherHall], edges: [{ a: "hall", b: "lift", src: "ai" }] };
  assert.ok(facilityGraph(graph).nodes[0].door.every((p) => p.x === 0), "the local map marker is west of this shaft");
  const boldEdge = { ...lift, door: [{ x: 10, y: 2 }, { x: 10, y: 4 }] };
  assert.deepEqual(facilityGraph({ ...graph, nodes: [boldEdge, current, otherHall] }).nodes[0].door, boldEdge.door, "the visible bold edge outranks the position marker");
  const distant = { ...current, x: -100 };
  assert.ok(facilityGraph({ ...graph, nodes: [lift, distant, otherHall] }).nodes[0].door.every((p) => p.x === 10), "a distant marker must not rotate this lift");
});

test("shared, reversed and partially overlapping corridor spans are rendered once", () => {
  const nodes = [node("a", "junction", 0, 0), node("b", "junction", 10, 0), node("c", "junction", 4, 0), node("d", "junction", 4, 5)];
  const edges = [{ a: "a", b: "b" }, { a: "b", b: "a" }, { a: "c", b: "b" }, { a: "c", b: "d" }];
  const segments = corridorSegments({ nodes, edges });
  assert.equal(segments.length, 3);
  assert.equal(segments.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0), 15);
  assert.ok(segments.every(([a, b]) => !(a.x < 4 && b.x > 4)), "a shared branch splits the main corridor at its junction");
  assert.deepEqual(corridorSegments({ nodes, edges: [{ a: "a", b: "a" }, { a: "missing", b: "b" }] }), []);
});

test("paths are never forced between entrances and each branches off existing paths", () => {
  const stair = { ...room, id: "stair-1", outline: [{ x: 10, y: 25 }, { x: 25, y: 25 }, { x: 25, y: 35 }, { x: 10, y: 35 }] };
  const exit = node("exit-1", "exit", 25, 45, { door: [{ x: 25, y: 44 }, { x: 25, y: 46 }] });
  const north = node("j-north", "junction", 30, 20);
  const south = node("j-south", "junction", 30, 50);
  const graph = {
    current_node_id: null,
    nodes: [stair, exit, north, south],
    edges: [
      { a: "j-north", b: "j-south" },
      { a: "stair-1", b: "exit-1" }, // forced path between entrances
    ],
  };
  const g = facilityGraph(graph);
  // No forced edge between stair-1 and exit-1
  assert.ok(!g.edges.some((e) => (e.a === "stair-1" && e.b === "exit-1") || (e.a === "exit-1" && e.b === "stair-1")));
  // Stair entrance must follow direction of red arrow (corridor approach is east, entrance is on east wall at x=25)
  const stairDoor = g.nodes.find((n) => n.id === "stair-1").door;
  assert.ok(stairDoor, "stair has a computed entrance threshold");
  assert.ok(stairDoor.every((p) => Math.abs(p.x - 25) < 1e-6), "stair entrance follows approach on corridor-facing east wall");
  // Corridor segments must not connect between stair and exit directly
  const segments = corridorSegments(g);
  assert.ok(!segments.some(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y) > 0 && ((a.x < 26 && a.y < 36 && b.y > 40) || (b.x < 26 && b.y < 36 && a.y > 40))));
});

test("stair entrances are not placed too close to the corner edge", () => {
  const stair = { ...room, id: "stair-corner", outline: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 10, y: 20 }] };
  const cornerApproach = { x: 5, y: 25 };
  const door = facilityThreshold(stair, cornerApproach);
  assert.ok(door, "computed door threshold");
  const [p1, p2] = door;
  for (const p of [p1, p2]) {
    assert.ok(Math.hypot(p.x - 10, p.y - 20) > 1.5, "entrance maintains safe margin from left corner");
    assert.ok(Math.hypot(p.x - 30, p.y - 20) > 1.5, "entrance maintains safe margin from right corner");
    assert.ok(Math.hypot(p.x - 10, p.y - 10) > 1.5, "entrance maintains safe margin from top corners");
    assert.ok(Math.hypot(p.x - 30, p.y - 10) > 1.5, "entrance maintains safe margin from top corners");
  }
});

test("wide stairwell approached from a corridor below uses its south wall, not an imaginary side door", () => {
  const eastStair = node("stairs-2", "stairs", 82, 37, {
    outline: [{ x: 74, y: 33 }, { x: 91, y: 33 }, { x: 91, y: 41 }, { x: 74, y: 41 }],
  });
  const eastExit = node("exit-2", "exit", 91, 37, { door: [{ x: 91, y: 35 }, { x: 91, y: 39 }] });
  const h4 = node("h4", "junction", 40, 44.5);
  const h5 = node("h5", "junction", 75.5, 44.5);
  const g = facilityGraph({
    current_node_id: null,
    nodes: [eastStair, eastExit, h4, h5],
    edges: [{ a: "h4", b: "h5" }, { a: "h5", b: "stairs-2" }, { a: "h5", b: "exit-2" }],
  });
  const door = g.nodes.find((n) => n.id === "stairs-2").door;
  assert.ok(door.every((p) => Math.abs(p.y - 41) < 1e-6), "door sits on the south wall facing the corridor, not the left side wall");
  assert.ok(door.every((p) => p.x >= 77 && p.x <= 88), "door stays well inset from the stairwell corners");
  const segs = corridorSegments(g);
  assert.ok(!segs.some(([a, b]) => a.x === 91 || b.x === 91), "corridor does not cut across the stairwell to the exterior exit door");
});

test("exit below a stairwell never faces the stairs and the stairwell entrance stays on its east corridor wall", () => {
  const westStair = node("stairs-1", "stairs", 13.5, 22, {
    outline: [{ x: 6, y: 16 }, { x: 21, y: 16 }, { x: 21, y: 28 }, { x: 6, y: 28 }],
  });
  const westExit = node("exit-1", "exit", 18, 28.5, {
    door: [{ x: 16.5, y: 28.5 }, { x: 19.5, y: 28.5 }],
  });
  const jTop = node("j-top", "junction", 25, 22);
  const jCross = node("j-cross", "junction", 25, 36);
  const jStub = node("j-stub", "junction", 18, 36);
  const g = facilityGraph({
    current_node_id: null,
    nodes: [westStair, westExit, jTop, jCross, jStub],
    edges: [
      { a: "j-top", b: "j-cross" },
      { a: "j-cross", b: "j-stub" },
      { a: "j-stub", b: "exit-1" },
      { a: "j-stub", b: "stairs-1" },
    ],
  });
  const stairDoor = g.nodes.find((n) => n.id === "stairs-1").door;
  assert.ok(stairDoor.every((p) => Math.abs(p.x - 21) < 1e-6), "stairwell entrance sits on the east wall facing the vertical corridor");
  const exitDoor = g.nodes.find((n) => n.id === "exit-1").door;
  assert.equal(exitDoor[0].x, exitDoor[1].x, "exit door is vertical facing the corridor, never horizontal facing the stairs");
  assert.ok(Math.min(exitDoor[0].y, exitDoor[1].y) > 28, "exit door stays clear below the stairwell south wall");
});

test("paths join in right angles rather than diagonal spokes converging into one joint", () => {
  const elev = node("elev", "elevator_hall", 116, 86, {
    outline: [{ x: 112, y: 80 }, { x: 126, y: 80 }, { x: 126, y: 94 }, { x: 112, y: 94 }],
    door: [{ x: 112, y: 84 }, { x: 112, y: 90 }],
  });
  const here = node("here", "junction", 106, 87);
  const jHall = node("J_hall", "junction", 100, 87);
  const j6 = node("J6", "junction", 100, 96);
  const j1 = node("J1", "junction", 100, 108);
  const stW = node("stW", "stairs", 68, 96, {
    outline: [{ x: 60, y: 92 }, { x: 92, y: 92 }, { x: 92, y: 100 }, { x: 60, y: 100 }],
    door: [{ x: 92, y: 93 }, { x: 92, y: 99 }],
  });
  const g = facilityGraph({
    current_node_id: "here",
    nodes: [elev, here, jHall, j6, j1, stW],
    edges: [
      { a: "here", b: "elev" },
      { a: "here", b: "J_hall" },
      { a: "J_hall", b: "J6" },
      { a: "stW", b: "J6" },
      { a: "J6", b: "J1" },
    ],
  });
  const segs = corridorSegments(g);
  for (const [a, b] of segs) {
    const isRightAngle = Math.abs(a.x - b.x) < 1e-4 || Math.abs(a.y - b.y) < 1e-4;
    assert.ok(isRightAngle, `segment from (${a.x},${a.y}) to (${b.x},${b.y}) should be orthogonal (right angle)`);
  }
});

