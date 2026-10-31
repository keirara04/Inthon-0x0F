"use client";

// Dev page for the navigation engine. Desktop: add ?heading=120 to fake the compass.
import { useRef, useState } from "react";
import { API_MODE, fetchRoute } from "@/lib/gilgyeol/api";
import { useNavigation } from "@/lib/gilgyeol/useNavigation";

export default function NavTest() {
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30));
  const fileRef = useRef<HTMLInputElement>(null);

  const nav = useNavigation({
    onStep: (s, i) => add(`step ${i}: ${s.text}`),
    onOffRoute: () => add("⚠️ off route"),
    onArrive: (r) => add(`🎉 arrived ${r.arrived.label}`),
    onReroute: (r) => add(`↪︎ reroute from ${r.path[0]}`),
  });

  async function load() {
    try {
      nav.load(await fetchRoute("1F-entrance", "4F-405"));
      add(`route loaded (${API_MODE})`);
    } catch (err) {
      add(`route error: ${String(err)}`);
    }
  }

  async function scan(file: File | undefined) {
    if (!file) return;
    try {
      const res = await nav.confirmCheckpoint(file);
      add(`checkpoint ${res.status} [${res.texts.join(", ")}] ${res.node?.id ?? ""}`);
    } catch (err) {
      add(`checkpoint error: ${String(err)}`);
    }
  }

  const btn = "rounded-lg border px-3 py-2 disabled:opacity-40";
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-3 p-4 text-sm">
      <h1 className="text-xl font-bold">안내 엔진 테스트 · {API_MODE}</h1>

      <div className="grid grid-cols-2 gap-2">
        <button className={btn} onClick={load}>1. 경로 불러오기</button>
        <button className={btn} onClick={nav.start} disabled={!nav.route}>2. 시작 (탭)</button>
        <button className={btn} onClick={nav.next} disabled={nav.status !== "guiding"}>다음</button>
        <button className={btn} onClick={() => fileRef.current?.click()} disabled={!nav.step}>체크포인트 촬영</button>
        <button className={btn} onClick={nav.resume} disabled={nav.status !== "offroute"}>이탈 무시</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => scan(e.target.files?.[0])} />

      <section className="grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-xs">
        <span>status</span><b>{nav.status}</b>
        <span>step</span><b>{nav.route ? `${nav.stepIndex + 1}/${nav.route.steps.length} ${nav.step?.kind}` : "-"}</b>
        <span>heading</span><b>{nav.heading === null ? "-" : `${Math.round(nav.heading)}°`}</b>
        <span>target</span><b>{nav.target === null ? "-" : `${nav.target}°`}</b>
        <span>delta</span><b>{nav.delta === null ? "-" : `${Math.round(nav.delta)}°`}</b>
        <span>dir</span><b>{nav.dir}</b>
        <span>expect</span><b>{nav.step?.checkpoint ? `${nav.step.checkpoint.kind} ${nav.step.checkpoint.text}` : "-"}</b>
      </section>
      <p>{nav.step?.text}</p>

      <ul className="font-mono text-xs text-neutral-600">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
