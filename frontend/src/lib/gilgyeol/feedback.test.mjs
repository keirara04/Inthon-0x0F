// Run: node --test src/lib/gilgyeol/feedback.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { beepPan, pickKoreanVoice } from "./feedback.ts";

test("pickKoreanVoice accepts ko-KR and ko_KR, ignores others", () => {
  assert.equal(pickKoreanVoice([{ lang: "en-US" }, { lang: "ko_KR", name: "s" }])?.name, "s");
  assert.equal(pickKoreanVoice([{ lang: "ko-KR", name: "c" }])?.name, "c");
  assert.equal(pickKoreanVoice([{ lang: "en-US" }, { lang: "ja-JP" }]), null);
});

test("beepPan: turn right = right ear, clamped at 90°", () => {
  assert.equal(beepPan(45), 0.5);
  assert.equal(beepPan(-180), -1);
  assert.equal(beepPan(0), 0);
});
