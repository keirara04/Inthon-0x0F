import { test } from "node:test";
import assert from "node:assert/strict";
import { stepCompletion, canUseFloorMap, floorName } from "./floorTransition.ts";

test("elevator and stair arrivals require a map, including a final vertical step", () => {
  for (const kind of ["elevator", "stairs"]) {
    assert.equal(stepCompletion(kind, false), "floorMap");
    assert.equal(stepCompletion(kind, true), "floorMap");
    assert.equal(stepCompletion(kind, false, true), "next");
    assert.equal(stepCompletion(kind, true, true), "arrive");
  }
  assert.equal(stepCompletion("walk", false), "next");
  assert.equal(stepCompletion("walk", true), "arrive");
});

test("a map without a readable floor can continue, but an explicitly different floor cannot", () => {
  assert.equal(canUseFloorMap("4F", { floor: "4F", floorSource: "map" }), true);
  assert.equal(canUseFloorMap("4F", { floor: "2F", floorSource: "map" }), false);
  assert.equal(canUseFloorMap("4F", { floor: "4F", floorSource: "hint" }), true);
  assert.equal(canUseFloorMap("4F", { floor: "4F" }), true);
  assert.equal(canUseFloorMap("4F", { floor: "2F", floorSource: "hint" }), true);
  assert.equal(canUseFloorMap("4F", null), false);
  assert.equal(canUseFloorMap("B1", { floor: "B1", floorSource: "map" }), true);
});

test("each subsequent floor change requires its own map", () => {
  assert.equal(stepCompletion("elevator", false, true), "next");
  assert.equal(stepCompletion("walk", false), "next");
  assert.equal(stepCompletion("stairs", false), "floorMap");
});

test("floor prompts support basement labels", () => {
  assert.equal(floorName("4F"), "4층");
  assert.equal(floorName("B1"), "지하 1층");
});
