import { test } from "node:test";
import assert from "node:assert/strict";
import { mapKey, rememberMap, mapForRoute } from "./confirmedMaps.ts";

const place = { id: 1, name: "Building", coords: null };
const graph = (floor, label) => ({ floor, building: "Building", current_node_id: "hall", nodes: [{ id: "hall", label, x: 10, y: 10, type: "elevator_hall" }], edges: [{ a: "hall", b: "room" }], elevators: [] });

test("confirming an uploaded floor then a saved floor preserves both original layouts and photos", () => {
  const first = graph("1F", "Uploaded lobby");
  const photo = { url: "blob:original", w: 100, h: 80 };
  const maps = rememberMap({}, place, first, photo);
  const next = rememberMap(maps, place, graph("4F", "Saved fourth floor"), null);
  assert.deepEqual(next[mapKey(place, "1F")], { graph: first, photo });
  assert.equal(next[mapKey(place, "4F")].graph.nodes[0].label, "Saved fourth floor");
  assert.equal(Object.keys(maps).length, 1);
  assert.equal(next[mapKey({ ...place, id: 2 }, "1F")], undefined);
});

test("reconfirming one floor only replaces that floor and unreadable floor uses the confirmed target", () => {
  let maps = rememberMap({}, place, graph("1F", "Lobby"), null);
  maps = rememberMap(maps, place, graph("1F", "Unread floor hint"), null, "4F");
  assert.equal(maps[mapKey(place, "1F")].graph.nodes[0].label, "Lobby");
  assert.equal(maps[mapKey(place, "4F")].graph.floor, "4F");
});

test("route display matches prefixed ids without altering the confirmed graph or guessing other nodes", () => {
  const original = graph("2F", "Actual floor");
  const displayed = mapForRoute(original, ["2F-hall", "2F-room"]);
  assert.equal(displayed.nodes[0].id, "2F-hall");
  assert.equal(displayed.current_node_id, "2F-hall");
  assert.deepEqual(displayed.edges[0], { a: "2F-hall", b: "2F-room" });
  assert.equal(original.nodes[0].id, "hall");
  assert.equal(mapForRoute(original, ["2F-unrelated"]).nodes[0].id, "hall");
});

test("departure choices resolve against the uploaded floor instead of demo node IDs", async () => {
  const { mapDeparture } = await import("./confirmedMaps.ts");
  const uploaded = {
    ...graph("1F", "Uploaded lift"), current_node_id: "photo-position",
    nodes: [
      { id: "photo-position", type: "junction", label: "현위치" },
      { id: "uploaded-lift", type: "elevator_hall", label: "엘리베이터" },
      { id: "uploaded-stairs", type: "stairs", label: "계단" },
    ],
  };
  assert.equal(mapDeparture(uploaded, null, "here").id, "photo-position");
  assert.equal(mapDeparture(uploaded, null, "hall").id, "uploaded-lift");
  assert.equal(mapDeparture(uploaded, null, "stair").id, "uploaded-stairs");
  assert.equal(mapDeparture(uploaded, "1F-uploaded-lift", null).id, "uploaded-lift");
  assert.equal(mapDeparture(uploaded, "1F-demo-elevator", "hall"), undefined);
  assert.equal(mapDeparture(uploaded, null, "main"), undefined);
});

test("a 1F demo selection cannot inherit the previously uploaded 4F floor", async () => {
  const { currentMapFloor } = await import("./confirmedMaps.ts");
  const staleUpload = { floor: "4F" };
  assert.equal(currentMapFloor({ mapDemo: true, startAt: null, parsed: staleUpload }), "1F");
  assert.equal(currentMapFloor({ mapDemo: false, startAt: null, parsed: staleUpload }), "4F");
  assert.equal(currentMapFloor({ mapDemo: false, startAt: { floor: "2F" }, parsed: staleUpload }), "2F");
  assert.equal(currentMapFloor({ mapDemo: false, startAt: null, parsed: { floor: "B1" } }), "B1");
});

test("back from a second-floor photo restores the first uploaded layout, photo and chosen start", async () => {
  const { mapSelection, currentMapFloor } = await import("./confirmedMaps.ts");
  const first = graph("1F", "User's first-floor elevator");
  const photo = { url: "blob:first-upload", w: 1280, h: 960 };
  const departure = {
    place, mapDemo: false, parsed: first, parsedPhoto: photo,
    start: "here", startAt: null, photoMap: null,
  };
  const origin = mapSelection(departure);
  // The scanner clears the displayed map, then the second-floor response populates it.
  let state = { ...departure, parsed: null, parsedPhoto: null, rideMode: true };
  const beforeScan = mapSelection(departure);
  state = { ...state, parsed: graph("2F", "Second-floor elevator"), parsedPhoto: { ...photo, url: "blob:second-upload" } };
  // Back from the result/scanner restores the old selection; undoing the floor change retains it.
  state = { ...state, ...beforeScan };
  state = { ...state, ...origin, rideMode: false };
  assert.equal(state.parsed, first);
  assert.equal(state.parsedPhoto, photo);
  assert.equal(state.mapDemo, false);
  assert.equal(state.start, "here");
  assert.equal(currentMapFloor(state), "1F");
  assert.equal(state.parsed.nodes[0].label, "User's first-floor elevator");
});

test("back restores the departure selection after a new floor was confirmed, including building and explicit start", async () => {
  const { mapSelection } = await import("./confirmedMaps.ts");
  const first = { place, mapDemo: false, parsed: graph("1F", "Original"), parsedPhoto: null, start: null,
    startAt: { id: "1F-door", label: "Original entrance", floor: "1F", via: "pin" }, photoMap: null };
  const origin = mapSelection(first);
  const second = { ...first, place: { ...place, id: 2 }, parsed: graph("2F", "Second"), startAt: { ...first.startAt, id: "2F-hall", floor: "2F" } };
  const restored = { ...second, ...origin };
  assert.deepEqual(restored, first);
});
