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

export function speak(text: string): void {
  if (!supportsSpeech()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
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
