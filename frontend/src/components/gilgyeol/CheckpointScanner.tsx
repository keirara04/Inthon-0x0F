"use client";

import { useEffect, useRef, useState } from "react";
import { C, START_NODES, scanMeta } from "@/lib/gilgyeol/data";
import { useDemoTools } from "@/lib/gilgyeol/demo";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import type { ScanOutcome } from "@/lib/gilgyeol/types";
import { Mascot } from "./Mascot";
import { Check, PrimaryButton, SecondaryButton, SegButton, useAlbumPick } from "./ui";

const OUTCOMES: [ScanOutcome, string][] = [
  ["success", "성공"],
  ["mismatch", "불일치"],
  ["fail", "실패"],
];

/** Sample evacuation map drawn in the viewfinder while the real camera is off (map scan only). */
function SampleEvacMap() {
  return (
    <div aria-hidden="true" className="absolute top-1/2 left-1/2 -mt-[110px] -ml-[85px] flex h-[196px] w-[170px] -rotate-3 flex-col overflow-hidden rounded-md bg-[#F8F7F3] shadow-[0_12px_30px_rgba(0,0,0,.45)]">
      <div className="bg-[#1F7A45] px-2.5 py-1.5 text-[11px] font-bold text-white">피난안내도 · 우정정보관 1층</div>
      <div className="relative m-2 flex-1 border-2 border-[#3A3F3B] text-[9px] text-[#3A3F3B]">
        <div className="absolute inset-x-0 top-[46%] h-3.5 bg-[#D9D6CE]" />
        <div className="absolute inset-y-0 left-[46%] w-3.5 bg-[#D9D6CE]" />
        <div className="absolute top-1.5 left-1.5 h-16 w-14 border-[1.5px] border-[#5E625D] p-1">101</div>
        <div className="absolute top-1.5 right-1.5 h-16 w-14 border-[1.5px] border-[#5E625D] p-1">102</div>
        <div className="absolute bottom-1.5 left-1.5 h-16 w-14 border-[1.5px] border-[#5E625D] p-1">103</div>
        <div className="absolute right-1.5 bottom-1.5 h-16 w-14 border-[1.5px] border-[#5E625D] p-1">계단</div>
        <div className="absolute top-[44%] left-[43%] flex size-5 items-center justify-center border-[1.5px] border-[#3A3F3B] bg-white text-[7px]">EV</div>
        <div className="absolute -bottom-0.5 left-[40%] flex flex-col items-center gap-0.5">
          <span className="text-[8px] font-bold text-[#B3261E]">현위치</span>
          <span className="size-2.5 rounded-full bg-[#B3261E]" />
        </div>
      </div>
    </div>
  );
}

const READ_STEPS: [number, string][] = [
  [0, "안내도 테두리와 층 번호 찾기"],
  [4, "복도와 계단 따라가기"],
  [9, "호실 번호 읽기"],
  [14, "길 그래프로 정리하기"],
];

/** Corridor sketch that draws itself while the AI reads the map. Decorative only. */
const SKETCH_LINES = ["M20 50 H180", "M100 50 V82", "M44 50 V14", "M156 50 V14"];
const SKETCH_DOTS: [number, number, string][] = [
  [44, 14, C.route],
  [156, 14, C.route],
  [20, 50, C.success],
  [72, 50, C.ink],
  [128, 50, C.ink],
  [100, 50, "#B5B0A4"],
  [180, 50, C.success],
  [100, 82, C.ink],
];

/**
 * Map-parse wait screen. The AI takes ~15–20 s (ai/eval/results), so show real elapsed time,
 * steps that advance with it, and a bar that slows near the end instead of pretending to finish.
 */
function MapReading({ onCancel }: { onCancel: () => void }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setT((Date.now() - t0) / 1000), 250);
    return () => clearInterval(id);
  }, []);
  const pct = Math.round(92 * (1 - Math.exp(-t / 9))); // ~80% at 18 s, never reaches 100 on its own
  const step = READ_STEPS.filter(([at]) => t >= at).length - 1;
  return (
    <>
      <div className="relative h-[96px] overflow-hidden rounded-2xl bg-surface" aria-hidden="true">
        <svg viewBox="0 0 200 96" className="absolute inset-0 size-full">
          {SKETCH_LINES.map((d, i) => (
            <path key={d} d={d} pathLength={1} className="gg-draw" fill="none" stroke="#E3E0D7" strokeWidth="9" strokeLinecap="round" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
          {SKETCH_LINES.map((d, i) => (
            <path key={`r-${d}`} d={d} pathLength={1} className="gg-draw" fill="none" stroke={C.route} strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: `${0.5 + i * 0.18}s` }} />
          ))}
          {SKETCH_DOTS.map(([x, y, c], i) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill={c} className="gg-pop" style={{ animationDelay: `${0.6 + i * 0.12}s` }} />
          ))}
          <circle cx="72" cy="50" r="10" fill="none" stroke={C.warning} strokeWidth="2" strokeDasharray="3 2.5" className="gg-pop" style={{ animationDelay: "1.7s" }} />
        </svg>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[20px] leading-[1.3] font-extrabold">안내도를 읽고 있어요</div>
        <div className="flex-none font-mono text-[14px] font-semibold text-muted tabular-nums" aria-hidden="true">
          {Math.floor(t)}초
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-label="안내도 분석 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-[3px] bg-route transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {READ_STEPS.map(([, label], i) => (
          <li key={label} className="flex items-center gap-2.5 text-[15px]" aria-current={i === step ? "step" : undefined}>
            <span
              aria-hidden="true"
              className={`flex size-5 flex-none items-center justify-center rounded-full ${i < step ? "bg-route" : i === step ? "border-2 border-route" : "border-2 border-line"}`}
            >
              {i < step ? <Check size={11} /> : i === step ? <span className="size-2 animate-pulse rounded-full bg-route" /> : null}
            </span>
            <span className={i === step ? "font-bold text-ink" : i < step ? "text-muted" : "text-[#9A9D96]"}>{label}</span>
          </li>
        ))}
      </ol>
      <p className="m-0 text-[13px] leading-normal text-muted">{t < 25 ? "보통 15–20초 걸려요. 이 화면을 켜 둔 채로 기다려 주세요." : "평소보다 오래 걸리고 있어요. 조금만 더 기다리거나 취소 후 데모 안내도로 계속할 수 있어요."}</p>
      <button type="button" onClick={onCancel} className="h-[50px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink">
        취소
      </button>
    </>
  );
}

/** Live rear-camera preview. A grabbed frame is sent for one checkpoint check and never stored. */
function useCamera(onDenied: () => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("이 브라우저에서는 카메라를 쓸 수 없어요 (HTTPS 필요)");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // Ask for a high-res stream: browsers default to ~720p, too small to read room numbers on a map.
        video: { facingMode: "environment", width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setOn(true);
    } catch (e) {
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) onDenied();
      else setError("카메라를 켜지 못했어요");
    }
  };

  /** One JPEG frame from the preview, or null when the camera is not showing a picture yet. */
  const grab = async (max = 1280): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7));
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { videoRef, on, error, start, stop, grab };
}

export function CheckpointScanner() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  const demo = useDemoTools();
  const m = scanMeta(s.scanTarget, d);
  const destFloor = `${s.dest?.floor ?? 4}층`;
  const { videoRef, on: camOn, error: camError, start: startCam, stop: stopCam, grab } = useCamera(() => actions.update({ scanState: "denied", camDenied: true }));
  const [capturing, setCapturing] = useState(false);
  const album = useAlbumPick((file) => actions.readMapPhoto(file));
  // The photo being read: shown under the scan line now, and under the graph on the result screen.
  const readMap = actions.readMapPhoto;
  const shot = s.parsedPhoto?.url ?? null;
  const frameColor = { success: "#4CC38A", mismatch: "#F2C37A", fail: "#F2C37A" }[s.scanState as string] ?? "#FFFFFF";
  // Real recognition needs a frame. With the camera on, map photos always go to the AI;
  // ?demo keeps the simulated sign outcome so presenters can drive it by hand.
  const isMap = s.scanTarget === "map";
  const reading = isMap && s.scanState === "analyzing";
  const realScan = camOn && (isMap || !demo);

  /** Live: capture one frame and let the engine judge it. Otherwise: the existing simulated result. */
  const confirmScan = async () => {
    if (!realScan) {
      actions.runScan();
      return;
    }
    setCapturing(true);
    try {
      const frame = await grab(isMap ? 2048 : 1280);
      if (frame) (isMap ? readMap : actions.runScan)(frame);
      else actions.toast("카메라 화면이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setCapturing(false);
    }
  };

  const manualOpts: { label: string; pick: () => void }[] = (() => {
    switch (s.scanTarget) {
      case "map":
        return [{ label: "데모 안내도 불러오기", pick: () => actions.go("mapResult", { mapDemo: true }) }];
      case "sign":
        return ["엘리베이터 홀", "서측 복도", "동측 복도"].map((p) => `${destFloor} ${p}`).map((l) => ({
          label: l,
          pick: () => actions.go("offroute", { offState: "confirm", offFloor: destFloor, offSign: `${l} · 직접 선택` }),
        }));
    }
  })();
  // Map scans can also fall back to picking the start point directly.
  if (s.scanTarget === "map") START_NODES.forEach((n) => manualOpts.push({ label: `안내도 없이 1층 ${n.label}에서 시작`, pick: () => actions.go("start", { start: n.id }) }));

  const manualPair = (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => actions.update({ scanState: "aim", manual: false })} className="h-[52px] rounded-[14px] border-none bg-ink text-[15px] font-bold text-white">
        재촬영
      </button>
      <button type="button" onClick={() => actions.update({ manual: true })} className="h-[52px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink">
        {m.manualLabel}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col bg-camera">
      <div className="flex h-[52px] items-center justify-between pr-3 pl-2 text-white">
        <button type="button" onClick={actions.back} aria-label="닫기" className="h-11 min-w-11 border-none bg-transparent text-[15px] font-semibold text-white">
          닫기
        </button>
        <h1 className="m-0 text-[15px] font-bold">{m.title}</h1>
        {demo ? (
          <div className="rounded border border-[#6B5530] px-1.5 py-[3px] font-mono text-[10px] font-semibold text-[#F2C37A]">데모 모드</div>
        ) : (
          <div aria-hidden="true" className="min-w-11" />
        )}
      </div>
      <div className="gg-hatch-dark relative mx-3 h-[330px] overflow-hidden rounded-[20px]">
        <video ref={videoRef} autoPlay playsInline muted aria-hidden="true" className={`absolute inset-0 size-full object-cover ${camOn ? "" : "hidden"}`} />
        {!camOn && s.scanTarget === "map" && <SampleEvacMap />}
        {reading && shot && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={shot} alt="" className="absolute inset-0 size-full bg-camera object-contain" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(40,100,160,.10)_1px,transparent_1px),linear-gradient(90deg,rgba(40,100,160,.10)_1px,transparent_1px)] bg-[size:22px_22px]" aria-hidden="true" />
            <div aria-hidden="true" className="gg-scan pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent to-[rgba(120,180,255,.35)]">
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[#9CCBFF] shadow-[0_0_12px_2px_rgba(120,180,255,.8)]" />
            </div>
          </>
        )}
        {!camOn && (
          <div className="absolute top-3 left-3 font-mono text-[10px] font-semibold text-[#A8ABA5]">
            {s.scanTarget === "map" ? "샘플 안내도 · 실제 카메라 미연결" : "후면 카메라 미리보기 자리 · 카메라를 켜면 표지를 확인해요"}
          </div>
        )}
        {s.scanState === "success" && (
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-md bg-[#4CC38A] px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-ink">
            인식: {m.read}
          </span>
        )}
        {s.scanState !== "denied" && (
          <button
            type="button"
            onClick={camOn ? stopCam : startCam}
            className="absolute top-2 right-2 h-11 rounded-xl border border-white/30 bg-black/45 px-3 text-[12px] font-semibold text-white"
          >
            {camOn ? "카메라 끄기" : "실제 카메라 켜기"}
          </button>
        )}
        <div
          className={`absolute top-1/2 left-1/2 ${s.scanTarget === "map" ? "-mt-[115px] -ml-[96px] h-[210px] w-[192px]" : "-mt-[65px] -ml-[100px] h-[130px] w-[200px]"}`}
          aria-hidden="true"
        >
          {[
            "top-0 left-0 border-t-4 border-l-4 rounded-tl-lg",
            "top-0 right-0 border-t-4 border-r-4 rounded-tr-lg",
            "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg",
            "right-0 bottom-0 border-r-4 border-b-4 rounded-br-lg",
          ].map((c) => (
            <div key={c} className={`absolute size-7 ${c}`} style={{ borderColor: frameColor }} />
          ))}
          {!(s.scanTarget === "map" && !camOn) && (
            <div className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold text-[#C9CCC6] [text-shadow:0_1px_3px_rgba(0,0,0,.6)]">찾는 표지 · {m.expect}</div>
          )}
        </div>
        {s.scanState !== "success" && (
          <div className="absolute right-3 bottom-3 left-3 flex justify-center">
            <span className="rounded-2xl bg-[rgba(21,23,21,.82)] px-3.5 py-1.5 text-center text-[16px] leading-[1.4] font-bold text-white">{m.guide}</span>
          </div>
        )}
      </div>
      {camError && <div className="mx-3 mt-2 rounded-xl bg-warn-tint px-3 py-2 text-[13px] font-semibold text-warn-ink">{camError}</div>}

      <div role="status" aria-live="polite" className="mt-3.5 flex flex-1 flex-col gap-3.5 rounded-t-[26px] bg-app-bg px-5 pt-[22px] pb-6">
        {s.scanState === "aim" && (
          <>
            {demo && (
            <div className="flex flex-col gap-2">
              <div className="font-mono text-[11px] font-semibold text-muted">데모 결과 선택</div>
              <div className="grid grid-cols-3 gap-1.5">
                {OUTCOMES.map(([k, l]) => (
                  <SegButton key={k} on={s.outcome === k} onClick={() => actions.update({ outcome: k })} className="text-[14px]">
                    {l}
                  </SegButton>
                ))}
              </div>
            </div>
            )}
            <PrimaryButton onClick={confirmScan} disabled={capturing}>{m.runLabel}</PrimaryButton>
            {isMap && (
              <>
                {album.input}
                <SecondaryButton onClick={album.open}>앨범에서 안내도 사진 선택</SecondaryButton>
              </>
            )}
            <p className="m-0 text-[13px] leading-normal text-muted">
              {realScan
                ? isMap
                  ? "찍은 안내도를 AI가 읽어 층 지도 초안을 만들어요. 사진은 저장하지 않아요."
                  : "지금 찍은 프레임으로 표지 위치를 확인해요. 사진은 확인 요청에만 쓰고 저장하지 않아요."
                : "카메라를 켜지 않으면 실제 인식 없이 선택한 결과를 보여줘요. 현장에서는 ‘실제 카메라 켜기’를 눌러주세요."}
            </p>
            {s.scanTarget !== "map" && (
              <p className="m-0 text-center text-[13px] font-semibold text-muted">
                {s.postureSensor ? "폰을 내리면 카메라가 꺼지고 진동 안내로 돌아가요" : "‘닫기’를 누르면 진동 안내로 돌아가요"}
              </p>
            )}
          </>
        )}
        {reading && <MapReading onCancel={actions.cancelScan} />}
        {s.scanState === "analyzing" && !reading && (
          <>
            <Mascot pose="lying" height={72} motion="bob" className="self-center" />
            <div className="text-[20px] font-extrabold">{m.analyzing}</div>
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-label="분석 중">
              <div className="h-full w-[55%] animate-pulse rounded-[3px] bg-route" />
            </div>
            <button type="button" onClick={actions.cancelScan} className="h-[50px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink">
              취소
            </button>
          </>
        )}
        {s.scanState === "success" && (
          <>
            <div className="flex items-center gap-3">
              <div className="flex size-11 flex-none items-center justify-center rounded-full bg-success">
                <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
                  <polyline points="4,11 9,16 18,6" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="text-[22px] leading-[1.3] font-extrabold text-ok-ink">{m.ok}</div>
            </div>
            {s.scanTarget !== "map" && (
              <div className="flex flex-col gap-1 rounded-2xl border border-[#BFDCC9] bg-ok-tint px-4 py-3">
                <p className="m-0 text-[16px] leading-normal text-ink">{m.next}</p>
                <p className="m-0 text-[13px] font-semibold text-ok-ink">위치를 확정했어요 · 진동 짧게 1회</p>
              </div>
            )}
            <PrimaryButton onClick={() => actions.scanNext(false)}>{m.okCta}</PrimaryButton>
          </>
        )}
        {s.scanState === "mismatch" && (
          <>
            <div className="flex flex-col gap-1">
              <div className="text-[22px] font-extrabold text-warn-ink">예상한 표지와 달라요</div>
              <div className="text-[15px] text-muted">
                {m.mis} · 기대한 표지: {m.expect}
              </div>
            </div>
            {manualPair}
          </>
        )}
        {s.scanState === "fail" && (
          <>
            <div className="text-[21px] leading-[1.35] font-extrabold">
              {isMap ? "안내도를 읽지 못했어요. 안내도 전체가 보이게 다시 찍어주세요" : "표지를 읽지 못했어요. 더 가까이 비춰주세요"}
            </div>
            {manualPair}
          </>
        )}
        {s.scanState === "denied" && (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="text-[21px] font-extrabold">카메라 권한이 꺼져 있어요</div>
              <div className="text-[15px] leading-normal text-muted">브라우저 설정 › 사이트 권한 › 카메라에서 허용할 수 있어요. 지금은 체크포인트를 직접 골라 계속할 수 있어요.</div>
            </div>
            <PrimaryButton onClick={() => actions.update({ manual: true })} className="h-[54px] rounded-2xl text-[16px]">
              수동 체크포인트 선택
            </PrimaryButton>
          </>
        )}
        {s.manual && (
          <div className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {manualOpts.map((o) => (
              <button
                type="button"
                key={o.label}
                onClick={o.pick}
                className="min-h-[52px] border-0 border-b border-divider bg-surface px-4 text-left text-[16px] font-semibold text-ink"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
