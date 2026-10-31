// Run: node --test src/lib/gilgyeol/feedback.test.mjs   (Node 24 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { beepPan, pickKoreanVoice, speechChunks, spokenText } from "./feedback.ts";

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

test("pickKoreanVoice prefers Premium/Enhanced, skips novelty and failed voices", () => {
  const v = (name, extra = {}) => ({ lang: "ko-KR", name, voiceURI: name, ...extra });
  const voices = [v("Eddy (한국어(대한민국))"), v("Grandma (한국어(대한민국))"), v("Yuna"), v("Yuna (향상된 품질)"), { lang: "en-US", name: "Samantha (Premium)" }];
  assert.equal(pickKoreanVoice(voices, new Set()).name, "Yuna (향상된 품질)");
  assert.equal(pickKoreanVoice(voices, new Set(["Yuna (향상된 품질)"])).name, "Yuna"); // failed voice skipped
  assert.equal(pickKoreanVoice([v("Eddy"), v("Rocko")], new Set()), null); // only novelty: let the browser pick
  // Android: Google's network voice over the on-device one
  assert.equal(pickKoreanVoice([v("ko-kr-x-ism-local", { localService: true }), v("ko-kr-x-ism-network", { localService: false })], new Set()).name, "ko-kr-x-ism-network");
});

test("spokenText reads units and floors like a person", () => {
  assert.equal(spokenText("왼쪽으로 돌아 복도를 따라 약 12m 가세요"), "왼쪽으로 돌아 복도를 따라 약 12미터 가세요");
  assert.equal(spokenText("4F 엘리베이터 → B1 주차장"), "4층 엘리베이터, 지하 1층 주차장");
  assert.equal(spokenText("1층 · 약 35° 돌리세요"), "1층, 약 35도 돌리세요");
  assert.equal(spokenText("405호까지 가세요"), "405호까지 가세요"); // room numbers untouched
  assert.equal(spokenText("B1층 주차장, B101호"), "지하 1층 주차장, B101호"); // basement rooms untouched, no 층층
});

test("speechChunks splits at sentence ends and commas", () => {
  assert.deepEqual(speechChunks("엘리베이터에 타서 4층에서 내리세요. 4층 표지가 보이면, 카메라로 확인하세요"), ["엘리베이터에 타서 4층에서 내리세요.", "4층 표지가 보이면,", "카메라로 확인하세요"]);
  assert.deepEqual(speechChunks("계속 안내할게요"), ["계속 안내할게요"]);
});

test("speak: idle speaks at once without cancel; busy cancels, then speaks after a pause (Android)", async () => {
  const log = [];
  const synth = { speaking: false, pending: false, cancel: () => log.push("cancel"), resume: () => {}, speak: (u) => log.push(`speak:${u.text}`), getVoices: () => [] };
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const { speak } = await import("./feedback.ts");

  speak("약 12m 가세요");
  assert.deepEqual(log, ["speak:약 12미터 가세요"]); // same tick, no cancel: stays inside the tap

  log.length = 0;
  synth.speaking = true;
  speak("다음 안내");
  assert.deepEqual(log, ["cancel"]); // never speak in the same tick as cancel
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(log, ["cancel", "speak:다음 안내"]);
  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});

test("speak: a failed voice retries once with lang only; a late error from an older line is ignored", async () => {
  const spoken = [];
  const synth = { speaking: false, pending: false, cancel() {}, resume() {}, speak: (u) => spoken.push(u), getVoices: () => [], addEventListener() {} };
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  const { speak, koreanVoiceReady } = await import("./feedback.ts");
  synth.getVoices = () => [{ lang: "ko-KR", name: "Google 한국의", voiceURI: "g", localService: false }];
  await koreanVoiceReady();

  speak("첫 줄");
  const old = spoken[0];
  assert.equal(old.voice.name, "Google 한국의");
  speak("둘째 줄");
  old.onerror({ error: "synthesis-failed" }); // late error from the replaced line
  assert.deepEqual(spoken.map((u) => u.text), ["첫 줄", "둘째 줄"]);

  spoken[1].onerror({ error: "voice-unavailable" }); // current line's voice isn't installed
  assert.deepEqual(spoken.map((u) => u.text), ["첫 줄", "둘째 줄", "둘째 줄"]);
  assert.equal(spoken[2].voice, undefined); // retried with lang only
  delete globalThis.window;
  delete globalThis.SpeechSynthesisUtterance;
});
