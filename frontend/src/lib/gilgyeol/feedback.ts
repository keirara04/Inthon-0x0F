// Capability-aware wrappers for vibration and speech. Every call is safe to make on
// browsers without support (iOS Safari has no navigator.vibrate) — callers show a
// fallback banner instead of relying on these succeeding.

export function supportsVibration(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function vibrate(pattern: number | number[]): boolean {
  if (!supportsVibration()) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function stopVibration(): void {
  vibrate(0);
}

export function supportsSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type VoiceLike = { lang: string; name?: string; localService?: boolean; voiceURI?: string };

// Apple's Eloquence novelty voices (also listed for ko-KR) are deliberately robotic.
const NOVELTY = /\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley)\b|할머니|할아버지/i;
const QUALITY = /premium|enhanced|프리미엄|향상된|고품질/i;
const NATURAL = /yuna|sora|minsu|유나|소라|민수|google/i;
/** Voices that failed to speak on this device (listed but not downloaded): never picked again. */
const brokenVoices = new Set<string>();
const voiceKey = (v: VoiceLike) => v.voiceURI ?? v.name ?? v.lang;

/**
 * Best Korean voice: Premium/Enhanced first, then Apple's standard Yuna/Sora/Minsu and Google's, network voices
 * ahead of on-device ones; never a novelty voice or one that already failed. Samsung Internet / WebViews spell the
 * tag `ko_KR`, others `ko-KR`. null = let the browser pick from `lang`.
 */
export function pickKoreanVoice<V extends VoiceLike>(voices: V[], skip: Set<string> = brokenVoices): V | null {
  const score = (v: V) => (QUALITY.test(v.name ?? "") ? 100 : 0) + (NATURAL.test(v.name ?? "") ? 20 : 0) + (v.localService === false ? 5 : 0);
  const ko = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko") && !NOVELTY.test(v.name ?? "") && !skip.has(voiceKey(v)));
  return ko.reduce<V | null>((best, v) => (!best || score(v) > score(best) ? v : best), null);
}

/** Written guidance -> what a person would say: "12m" -> "12미터", "4F" -> "4층", no symbols read out. */
export function spokenText(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?)\s*m\b/g, "$1미터")
    .replace(/\bB(\d{1,2})층?(?![\d호])/g, "지하 $1층") // B1, B1층 -> 지하 1층; room B101호 untouched
    .replace(/\b(\d{1,2})F\b/g, "$1층")
    .replace(/(\d+)\s*°/g, "$1도")
    .replace(/\s*[·→]\s*/g, ", ");
}

/** One utterance per sentence or clause, so pauses fall where a person would pause. */
export function speechChunks(text: string): string[] {
  return text.split(/(?<=[.!?。,])\s+/).map((t) => t.trim()).filter(Boolean);
}

// true = Korean voice found, false = the browser lists voices but none is Korean, null = unknown (no list yet).
let koVoice: SpeechSynthesisVoice | null = null;
let koKnown: boolean | null = null;
let watchingVoices = false;

/**
 * Whether this device can speak Korean. The voice list loads late on Chrome (`voiceschanged`), so this waits
 * up to 2 s. A browser that never lists voices stays `null` and keeps speaking with `lang` only.
 */
export function koreanVoiceReady(): Promise<boolean | null> {
  if (!supportsSpeech()) return Promise.resolve(false);
  const synth = window.speechSynthesis;
  if (!watchingVoices) {
    // Chrome lists on-device voices first and Google's network voices a moment later: re-pick on every change.
    watchingVoices = true;
    synth.addEventListener("voiceschanged", () => {
      const voices = synth.getVoices();
      if (voices.length) koVoice = pickKoreanVoice(voices);
    });
  }
  const check = () => {
    const voices = synth.getVoices();
    if (!voices.length) return false;
    koVoice = pickKoreanVoice(voices);
    // Only novelty voices still speaks Korean (the browser picks from `lang`), so it isn't "no Korean voice".
    koKnown = voices.some((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko"));
    return true;
  };
  if (check()) return Promise.resolve(koKnown);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", onChange);
      resolve(koKnown);
    };
    const onChange = () => check() && done();
    synth.addEventListener("voiceschanged", onChange);
    setTimeout(done, 2000);
  });
}

// Kept referenced until spoken: Chrome drops an utterance that is garbage-collected mid-sentence.
let queued: SpeechSynthesisUtterance[] = [];
let speakTimer: ReturnType<typeof setTimeout> | undefined;
let lastSpeechError: string | null = null;

function utterance(text: string, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ko-KR";
  u.rate = 1.05;
  u.pitch = 1;
  if (voice) u.voice = voice;
  u.onerror = (e) => {
    if (e.error === "interrupted" || e.error === "canceled") return; // our own cancel()
    if (!queued.includes(u)) return; // a late error from an earlier line: don't replay it over the current one
    lastSpeechError = `${e.error}${voice ? ` (${voice.name})` : ""}`;
    // Android lists Korean voices whose data isn't downloaded: they fail silently. Drop it and say it again with `lang` only.
    if (!voice) return;
    brokenVoices.add(voiceKey(voice));
    koVoice = pickKoreanVoice(window.speechSynthesis.getVoices());
    const retry = utterance(text, null);
    queued.push(retry);
    window.speechSynthesis.speak(retry);
  };
  return u;
}

export function speak(text: string): void {
  // No early return when no Korean voice was found: Chrome's voice list is flaky, and a false "none" would
  // mute a phone that can speak. The screen shows a notice instead.
  if (!supportsSpeech()) return;
  try {
    const synth = window.speechSynthesis;
    const busy = synth.speaking || synth.pending;
    if (busy) synth.cancel();
    clearTimeout(speakTimer);
    const go = () => {
      synth.resume(); // Chrome can leave speech paused after the page was in the background
      queued = speechChunks(spokenText(text)).map((t) => utterance(t, koVoice));
      queued.forEach((u) => synth.speak(u));
    };
    // Android Chrome finishes cancel() after a same-tick speak() and swallows it. Idle = speak now, still inside
    // the tap (iOS needs the first utterance there).
    if (busy) speakTimer = setTimeout(go, 60);
    else go();
  } catch {
    // Speech is a progressive enhancement; the same text is always on screen.
  }
}

/** For /sensor-test: Korean voices this device lists, the one picked, and the last speech error. */
export function speechDebug(): { voices: string[]; picked: string | null; lastError: string | null } {
  const all = supportsSpeech() ? window.speechSynthesis.getVoices() : [];
  const ko = all.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko"));
  return {
    voices: ko.map((v) => `${v.name}${v.localService ? "" : " (network)"}${brokenVoices.has(voiceKey(v)) ? " ✕" : ""}`),
    picked: koVoice?.name ?? null,
    lastError: lastSpeechError,
  };
}

export function cancelSpeech(): void {
  if (!supportsSpeech()) return;
  clearTimeout(speakTimer);
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

// Direction beep: a short tone from the side to turn to. Fits iPhones (no navigator.vibrate) and tells left
// from right, which a vibration can't. iOS: created/resumed in a tap (unlockAudio), silenced by the mute switch.
let audio: AudioContext | null = null;

/** Call from a tap handler (iOS only starts audio inside a user gesture). */
export function unlockAudio(): void {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = null; // no Web Audio: beeps stay silent
  }
}

/** Stereo position for a turn: positive delta (turn right) = right ear, full at 90°. */
export const beepPan = (delta: number) => Math.max(-1, Math.min(1, delta / 90));

/** ~90 ms tone. `pan` -1 (left ear) .. 1 (right ear); higher pitch when on course. */
export function beep(pan: number, onCourse: boolean): void {
  if (!audio || audio.state !== "running") return;
  try {
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const panner = audio.createStereoPanner();
    osc.frequency.value = onCourse ? 1046 : 660;
    panner.pan.value = pan;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01); // no click on start/stop
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain).connect(panner).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  } catch {
    // ignore
  }
}

// iPhone haptic tick: Safari 17.4+ taps the Taptic Engine when a `<input switch>` toggles via its label.
// ponytail: undocumented hack, may need a recent user gesture or be patched in newer iOS; vibrate() is used
// wherever it exists, and this is only tried where it doesn't.
let iosSwitch: HTMLLabelElement | null = null;
export function iosHaptic(): void {
  if (typeof document === "undefined" || supportsVibration() || !/iP(hone|ad|od)/.test(navigator.userAgent)) return;
  try {
    if (!iosSwitch) {
      iosSwitch = document.createElement("label");
      iosSwitch.ariaHidden = "true";
      iosSwitch.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      iosSwitch.appendChild(input);
      document.body.appendChild(iosSwitch);
    }
    iosSwitch.click();
  } catch {
    // ignore
  }
}
