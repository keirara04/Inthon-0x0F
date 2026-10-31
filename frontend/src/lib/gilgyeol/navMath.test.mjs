// Run: node --test src/lib/gilgyeol/navMath.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { circularMean, delta, dirState, headingFromEvent, OFF_ROUTE_RESET, trackOffRoute } from "./navMath.ts";

test("delta wraps around north", () => {
  assert.equal(delta(350, 10), 20);
  assert.equal(delta(10, 350), -20);
  assert.equal(delta(180, 270), 90); // facing south, west is to the right
  assert.equal(delta(0, 180), 180);
});

test("circularMean averages across 0°", () => {
  assert.ok(Math.abs(circularMean([359, 1])) < 1e-6 || Math.abs(circularMean([359, 1]) - 360) < 1e-6);
  assert.ok(Math.abs(circularMean([80, 100]) - 90) < 1e-6);
  assert.equal(circularMean([]), null);
});

test("dirState thresholds", () => {
  assert.equal(dirState(null), "unstable");
  assert.equal(dirState(-15), "aligned");
  assert.equal(dirState(45), "near");
  assert.equal(dirState(120), "far");
});

test("off route only after facing the target once, and only after 5 s", () => {
  let s = OFF_ROUTE_RESET;
  s = trackOffRoute(s, 120, 0);
  s = trackOffRoute(s, 120, 9000);
  assert.equal(s.off, false, "turning around before ever facing the target is not off route");

  s = trackOffRoute(s, 5, 10000); // faced the target: armed
  s = trackOffRoute(s, 90, 11000);
  s = trackOffRoute(s, 90, 15000);
  assert.equal(s.off, false, "4 s is not enough");
  s = trackOffRoute(s, 90, 16000);
  assert.equal(s.off, true);

  s = trackOffRoute({ ...s, off: false }, 30, 17000); // back on course resets the timer
  assert.equal(s.since, null);
});

test("headingFromEvent", () => {
  assert.equal(headingFromEvent({ alpha: 10, webkitCompassHeading: 42 }), 42);
  assert.equal(headingFromEvent({ alpha: 90, absolute: true }), 270);
  assert.equal(headingFromEvent({ alpha: 90, absolute: false }), null);
});
