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

/** First Korean voice. Samsung Internet / WebViews spell the tag `ko_KR`, others `ko-KR`. */
export function pickKoreanVoice<V extends { lang: string }>(voices: V[]): V | null {
  return voices.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ko")) ?? null;
}

// true = Korean voice found, false = the browser lists voices but none is Korean, null = unknown (no list yet).
let koVoice: SpeechSynthesisVoice | null = null;
let koKnown: boolean | null = null;

/**
 * Whether this device can speak Korean. The voice list loads late on Chrome (`voiceschanged`), so this waits
 * up to 2 s. A browser that never lists voices stays `null` and keeps speaking with `lang` only.
 */
export function koreanVoiceReady(): Promise<boolean | null> {
  if (!supportsSpeech()) return Promise.resolve(false);
  const synth = window.speechSynthesis;
  const check = () => {
    const voices = synth.getVoices();
    if (!voices.length) return false;
    koVoice = pickKoreanVoice(voices);
    koKnown = koVoice !== null;
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

export function speak(text: string): void {
  // No early return when no Korean voice was found: Chrome's voice list is flaky, and a false "none" would
  // mute a phone that can speak. The screen shows a notice instead.
  if (!supportsSpeech()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    if (koVoice) u.voice = koVoice;
    synth.speak(u);
  } catch {
    // Speech is a progressive enhancement; the same text is always on screen.
  }
}

export function cancelSpeech(): void {
  if (!supportsSpeech()) return;
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
