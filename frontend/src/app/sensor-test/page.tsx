"use client";

import { useRef, useState } from "react";
import { headingFromEvent } from "@/lib/gilgyeol/navMath";

// iOS adds a permission method and a compass field that aren't in the TS DOM types.
type IOSOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};
type CompassEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };

// Patterns from PRD FR-6 (ms on/off).
const PATTERNS: Record<string, number[]> = {
  "왼쪽 회전": [80, 80, 80],
  "오른쪽 회전": [300, 100, 300],
  "층 이동": [80, 80, 80, 80, 80],
  도착: [600, 150, 80, 80, 80],
  "이탈 경고": [40, 40, 40, 40, 40],
};

export default function SensorTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [line, ...l].slice(0, 20));

  async function start() {
    add(`secure context: ${window.isSecureContext}`);
    add(`vibrate supported: ${"vibrate" in navigator} (iPhone: false 정상)`);

    // Compass. iOS needs requestPermission() inside this tap handler.
    try {
      const IOS = DeviceOrientationEvent as IOSOrientationEvent;
      if (IOS.requestPermission) {
        add(`compass permission: ${await IOS.requestPermission()}`);
      }
      const onIOS = (e: Event) => {
        const h = (e as CompassEvent).webkitCompassHeading;
        if (h != null) setHeading(h);
      };
      const onAndroid = (e: Event) => {
        const h = headingFromEvent(e as DeviceOrientationEvent); // same tilt-compensated math as guidance
        if (h != null) setHeading(h);
      };
      window.addEventListener("deviceorientation", onIOS);
      window.addEventListener("deviceorientationabsolute", onAndroid);
      add("compass listeners on");
    } catch (err) {
      add(`compass error: ${String(err)}`);
    }

    // Rear camera.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
      add("camera on");
    } catch (err) {
      add(`camera error: ${String(err)}`);
    }
  }

  function vibrate(name: string) {
    const ok = "vibrate" in navigator && navigator.vibrate(PATTERNS[name]);
    add(`vibrate ${name}: ${ok ? "ok" : "not supported"}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4 text-sm">
      <h1 className="text-xl font-bold">센서 테스트</h1>

      <button onClick={start} className="rounded-lg bg-black px-4 py-3 font-semibold text-white">
        권한 요청 + 시작
      </button>

      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="aspect-[3/4] w-full rounded-lg bg-neutral-200 object-cover"
      />

      <section className="flex items-center gap-4 rounded-lg border p-4">
        <div
          className="text-4xl transition-transform"
          style={{ transform: `rotate(${-(heading ?? 0)}deg)` }}
          aria-hidden
        >
          ⬆️
        </div>
        <div>
          <div className="text-2xl font-mono">{heading == null ? "--" : `${Math.round(heading)}°`}</div>
          <div className="text-neutral-500">화살표는 북쪽을 가리킴</div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="text-neutral-500">진동 패턴 (Android만)</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.keys(PATTERNS).map((name) => (
            <button key={name} onClick={() => vibrate(name)} className="rounded-lg border px-3 py-2">
              {name}
            </button>
          ))}
        </div>
      </section>

      <ul className="font-mono text-xs text-neutral-600">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
