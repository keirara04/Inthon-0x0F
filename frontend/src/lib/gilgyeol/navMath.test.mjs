// Run: node --test src/lib/gilgyeol/navMath.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { axesFromEuler, axesFromQuaternion, circularMean, countStep, delta, dirState, fieldDisturbed, STEP_RESET, headingFromAxes, headingFromEvent, OFF_ROUTE_RESET, trackOffRoute } from "./navMath.ts";

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

const near = (a, b) => assert.ok(Math.abs(delta(a, b)) < 1e-6, `${a} vs ${b}`);

test("tilt-compensated heading agrees flat and upright", () => {
  near(headingFromAxes(axesFromEuler(90, 0, 0)), 270); // flat, top edge west
  near(headingFromAxes(axesFromEuler(90, 90, 0)), 270); // upright, camera west (90 here = sign flipped)
  near(headingFromAxes(axesFromEuler(90, 60, 0)), 270); // held up past 45°: camera axis takes over, same answer
  near(headingFromAxes(axesFromEuler(30, 30, 0)), 330);
  near(headingFromEvent({ alpha: 90, beta: 80, gamma: 0, absolute: true }), 270);
  near(headingFromAxes(axesFromEuler(0, 90, 90)), 270); // upright, turned 90° about its long axis: camera west (spec Vx = -1)
});

test("quaternion heading", () => {
  near(headingFromAxes(axesFromQuaternion([0, 0, 0, 1])), 0); // identity: flat, top north
  near(headingFromAxes(axesFromQuaternion([0, 0, Math.SQRT1_2, Math.SQRT1_2])), 270); // 90° about up = alpha 90
  // Quaternion of alpha 90 then beta 90 (upright facing west) matches the Euler path.
  const h = Math.SQRT1_2;
  const q = [h * h, h * h, h * h, h * h]; // qz(90°)·qx(90°)
  near(headingFromAxes(axesFromQuaternion(q)), headingFromAxes(axesFromEuler(90, 90, 0)));
});

test("north offset turns raw readings into map headings and back", async () => {
  const { corrected, offsetFor } = await import("./navMath.ts");
  assert.equal(corrected(30, 20), 10);
  assert.equal(corrected(10, 20), 350); // wraps below north
  assert.equal(corrected(350, 340), 10);
  const off = offsetFor(95, 90); // facing a corridor drawn at 90° while the compass says 95°
  assert.equal(off, 5);
  assert.equal(corrected(95, off), 90);
  assert.equal(corrected(5, offsetFor(5, 270)), 270); // across north
});

test("fieldDisturbed: compass turning without the gyro is the field, turning together is the user", () => {
  const run = (absStep, relStep) => Array.from({ length: 16 }, (_, i) => ({ t: i * 100, abs: (350 + i * absStep) % 360, rel: 100 + i * relStep }));
  assert.equal(fieldDisturbed(run(4, 4)), false); // user turns 60° in 1.5 s, both agree (across north, too)
  assert.equal(fieldDisturbed(run(2, 0)), true); // compass swings 30°, phone held still
  assert.equal(fieldDisturbed(run(0.5, 0)), false); // 7.5° of noise stays under the knob
  assert.equal(fieldDisturbed(run(2, 0).slice(0, 5)), false); // too little history to judge
  assert.equal(fieldDisturbed([]), false);
});

test("countStep: 2 steps/s for 10 s counts ~20, a phone held still counts none", () => {
  const walk = (f) => Array.from({ length: 500 }, (_, i) => i * 20).reduce((st, t) => countStep(st, t, f(t / 1000)), STEP_RESET).steps;
  const steps = walk((s) => 9.81 + 2.5 * Math.sin(2 * Math.PI * 2 * s));
  assert.ok(steps >= 18 && steps <= 21, `walking: ${steps}`);
  assert.equal(walk((s) => 9.81 + 0.2 * Math.sin(2 * Math.PI * 7 * s)), 0); // hand tremor
});
