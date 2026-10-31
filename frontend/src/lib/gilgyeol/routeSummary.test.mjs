import { test } from "node:test";
import assert from "node:assert/strict";
import { routeSummary } from "./routeSummary.ts";

test("lobby to itself stays on 1F and is already at the destination", () => {
  assert.deepEqual(routeSummary({
    total_m: 0, path: ["1F-lobby"], steps: [],
    arrived: { node: "1F-lobby", label: "1층 로비", floor: "1F" },
  }), { departureFloor: "1F", arrivalFloor: "1F", alreadyThere: true });
});

test("same-floor walks do not count as already arrived", () => {
  assert.deepEqual(routeSummary({
    path: ["1F-elev-A", "1F-lobby"], steps: [{ kind: "walk", floor: "1F" }],
    arrived: { node: "1F-lobby", floor: "1F" },
  }), { departureFloor: "1F", arrivalFloor: "1F", alreadyThere: false });
});

test("a vertical first step does not overwrite the actual departure floor", () => {
  assert.deepEqual(routeSummary({
    path: ["1F-elev-A", "4F-elev-A", "4F-405"], steps: [{ kind: "elevator", floor: "4F" }],
    arrived: { node: "4F-405", floor: "4F" },
  }), { departureFloor: "1F", arrivalFloor: "4F", alreadyThere: false });
});

test("basement destinations and malformed empty paths do not fall back to 4F", () => {
  assert.deepEqual(routeSummary({
    path: ["B1-lobby"], steps: [], arrived: { node: "B1-lobby", floor: "B1" },
  }), { departureFloor: "B1", arrivalFloor: "B1", alreadyThere: true });
  assert.equal(routeSummary({ path: [], steps: [], arrived: { node: "1F-lobby", floor: "1F" } }).alreadyThere, false);
});
