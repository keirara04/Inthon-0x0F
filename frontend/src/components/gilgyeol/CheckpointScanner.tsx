"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { floorName } from "@/lib/gilgyeol/floorTransition";
import { MAP_JPEG_QUALITY, canvasToJpeg } from "@/lib/gilgyeol/api";
import { C, START_NODES, scanMeta } from "@/lib/gilgyeol/data";
import { useDemoTools } from "@/lib/gilgyeol/demo";
import { boxDrift, detectSign, detectSignIn, smoothBox, withMargin, type Box } from "@/lib/gilgyeol/signDetect";
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
  // Collapsible so the camera view behind stays visible during the 15–20 s read; the timer keeps running either way.
  const [open, setOpen] = useState(true);
  const bar = (
    <div className="h-1.5 overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-label="안내도 분석 중" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="h-full rounded-[3px] bg-route transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
    </div>
  );
  const chevron = (up: boolean) => (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className={up ? "rotate-180" : ""}>
      <polyline points="4,7 9,12 14,7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-label={`안내도를 읽고 있어요, ${Math.floor(t)}초. 펼치기`}
          className="-my-1 flex min-h-11 w-full items-center gap-3 border-none bg-transparent p-0 text-left text-ink"
        >
          <span className="flex-1 text-[16px] font-extrabold">안내도를 읽고 있어요</span>
          <span className="font-mono text-[14px] font-semibold text-muted tabular-nums">{Math.floor(t)}초</span>
          {chevron(true)}
        </button>
        {bar}
      </>
    );
  }
  return (
    <>
      {/* grab handle: tap to collapse */}
      <button type="button" onClick={() => setOpen(false)} aria-expanded aria-label="안내도 읽기 화면 접기" className="-mt-3 -mb-1.5 flex h-6 w-full items-center justify-center border-none bg-transparent p-0">
        <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-edge" />
      </button>
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
        <div className="flex flex-none items-center gap-1">
          <span className="font-mono text-[14px] font-semibold text-muted tabular-nums" aria-hidden="true">
            {Math.floor(t)}초
          </span>
          <button type="button" onClick={() => setOpen(false)} aria-label="접기" className="-mr-2 flex size-11 items-center justify-center rounded-xl border-none bg-transparent text-muted">
            {chevron(false)}
          </button>
        </div>
      </div>
      {bar}
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
      <p className="m-0 text-[13px] leading-normal text-muted">{t < 25 ? "보통 15–20초 걸려요. 이 화면을 켜 둔 채로 기다려 주세요." : "평소보다 오래 걸리고 있어요. 조금만 더 기다리거나 취소 후 다른 사진을 선택해 주세요."}</p>
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
  // Torch: only some browsers (Android Chrome) expose it; iPhone browsers can't control it.
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
    setTorch({ supported: false, on: false });
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorch({ supported: true, on: next });
    } catch {
      setTorch({ supported: false, on: false });
    }
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
      const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorch({ supported: !!caps?.torch, on: false });
    } catch (e) {
      if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) onDenied();
      else setError("카메라를 켜지 못했어요");
    }
  };

  /**
   * One JPEG frame from the preview, or null when the camera is not showing a picture yet.
   * `crop` (frame fractions) keeps only the detected sign plus a margin, so the map fills the photo.
   */
  const grab = async (max = 1280, crop?: Box, quality = 0.7): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const [vw, vh] = [video.videoWidth, video.videoHeight];
    const c = crop ? withMargin(crop) : { x: 0, y: 0, w: 1, h: 1 };
    const [sx, sy, sw, sh] = [c.x * vw, c.y * vh, c.w * vw, c.h * vh];
    const scale = Math.min(1, max / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d")?.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvasToJpeg(canvas, quality).catch(() => null);
  };

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  return { videoRef, on, error, start, stop, grab, torch, toggleTorch };
}

const HOLD_MS = 1200; // how long the sign must stay put before the photo is taken

type Tracked = { box: Box; rect: { left: number; top: number; width: number; height: number }; progress: number };

/**
 * Watches the live preview ~7 times a second for an evacuation-map sign. Reports where it is (in the
 * viewfinder's pixels, for the on-screen frame) and how long it has held still; calls `onHold` once
 * when it has stayed put for HOLD_MS.
 */
function useSignTracker(videoRef: RefObject<HTMLVideoElement | null>, boxRef: RefObject<HTMLDivElement | null>, enabled: boolean, onHold: (box: Box) => void) {
  const [tracked, setTracked] = useState<Tracked | null>(null);
  const holdRef = useRef(onHold);
  useEffect(() => {
    holdRef.current = onHold;
  }, [onHold]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let smooth: Box | null = null;
    let since = 0;
    let misses = 0;
    let fired = false;
    let timer = 0;
    const tick = () => {
      const video = videoRef.current;
      const el = boxRef.current;
      if (ctx && video?.videoWidth && el && !fired) {
        const W = 160;
        const H = Math.round((W * video.videoHeight) / video.videoWidth);
        canvas.width = W;
        canvas.height = H;
        ctx.drawImage(video, 0, 0, W, H);
        const found = detectSign(ctx.getImageData(0, 0, W, H).data, W, H);
        if (found) {
          misses = 0;
          const now = performance.now();
          if (!smooth || boxDrift(smooth, found) > 0.035) since = now; // moved: restart the hold
          smooth = smoothBox(smooth, found);
          const progress = Math.min(1, (now - since) / HOLD_MS);
          // The video is drawn with object-cover, so map frame fractions through the same scale and crop.
          const r = el.getBoundingClientRect();
          const scale = Math.max(r.width / video.videoWidth, r.height / video.videoHeight);
          const [dw, dh] = [video.videoWidth * scale, video.videoHeight * scale];
          const [ox, oy] = [(r.width - dw) / 2, (r.height - dh) / 2];
          setTracked({ box: smooth, rect: { left: ox + smooth.x * dw, top: oy + smooth.y * dh, width: smooth.w * dw, height: smooth.h * dh }, progress });
          if (progress >= 1) {
            fired = true;
            holdRef.current(smooth);
          }
        } else if (++misses > 3) {
          smooth = null;
          setTracked(null);
        }
      }
      timer = window.setTimeout(tick, 140);
    };
    timer = window.setTimeout(tick, 0);
    return () => {
      clearTimeout(timer);
      setTracked(null);
    };
  }, [enabled, videoRef, boxRef]);

  return tracked;
}

export function CheckpointScanner() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  const demo = useDemoTools();
  const baseMeta = scanMeta(s.scanTarget, d);
  const floorCapture = s.scanTarget === "map" && !!s.floorMapTarget;
  const m = floorCapture ? { ...baseMeta, title: `${floorName(s.floorMapTarget!)} 안내도 촬영`, guide: `${floorName(s.floorMapTarget!)} 표시와 안내도 전체가 보이게 비춰주세요` } : baseMeta;
  const destFloor = `${s.dest?.floor ?? 4}층`;
  const { videoRef, on: camOn, error: camError, start: startCam, stop: stopCam, grab, torch, toggleTorch } = useCamera(() =>
    actions.update({ scanState: "denied", camDenied: true }),
  );
  // Like a camera app: the preview starts by itself (the user already chose 카메라 켜기). ?demo keeps the
  // sample picture so presenters can drive results by hand; they can still turn the camera on.
  // Arriving with an album photo (앨범에서 선택) means the user chose a photo, not the camera.
  useEffect(() => {
    if (demo || s.camDenied || s.pendingPhoto) return;
    void (async () => {
      await Promise.resolve();
      await startCam();
    })();
    // start once per visit to this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [capturing, setCapturing] = useState(false);
  // Uploaded photos get the same treatment as the live camera: find the sign, frame it, then read only that part.
  const [upload, setUpload] = useState<{ file: Blob; url: string; w: number; h: number; box: Box; progress: number } | null>(null);
  const pickPhoto = async (file: Blob) => {
    stopCam(); // the photo replaces the live preview, so the sign tracker can't shoot a camera frame instead
    try {
      const bmp = await createImageBitmap(file);
      const box = detectSignIn(bmp, bmp.width, bmp.height);
      const [w, h] = [bmp.width, bmp.height];
      bmp.close();
      if (box) {
        setUpload({ file, url: URL.createObjectURL(file), w, h, box, progress: 0 });
        return;
      }
    } catch {} // undecodable here (e.g. HEIC): let the server-side read report it
    actions.readMapPhoto(file); // no sign found: read the whole photo, as before
  };
  const readUpload = async (crop: boolean) => {
    if (!upload) return;
    const { file, url, box } = upload;
    setUpload(null);
    URL.revokeObjectURL(url);
    if (!crop) return actions.readMapPhoto(file);
    const bmp = await createImageBitmap(file);
    const c = withMargin(box);
    // Crop and shrink to the upload size in one draw, then encode once (no second lossy pass later).
    const [sw, sh] = [c.w * bmp.width, c.h * bmp.height];
    const scale = Math.min(1, 2048 / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext("2d")?.drawImage(bmp, c.x * bmp.width, c.y * bmp.height, sw, sh, 0, 0, canvas.width, canvas.height);
    bmp.close();
    actions.readMapPhoto(await canvasToJpeg(canvas, MAP_JPEG_QUALITY).catch(() => file));
  };
  const album = useAlbumPick((file) => void pickPhoto(file));
  // A photo picked on the capture-intro screen arrives here.
  useEffect(() => {
    const photo = s.pendingPhoto;
    if (!photo) return;
    void (async () => {
      await Promise.resolve();
      actions.update({ pendingPhoto: null });
      await pickPhoto(photo);
    })();
    // pickPhoto is recreated each render; the photo is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.pendingPhoto]);
  // Hold bar on the uploaded photo: fills over HOLD_MS, then reads the framed part (tap reads it at once).
  useEffect(() => {
    if (!upload) return;
    const id = window.setTimeout(() => {
      const next = Math.min(1, upload.progress + 50 / HOLD_MS);
      if (next >= 1) void readUpload(true);
      else setUpload({ ...upload, progress: next });
    }, 50);
    return () => clearTimeout(id);
    // readUpload reads the same `upload` this effect closed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upload]);
  // The photo being read: shown under the scan line now, and under the graph on the result screen.
  const readMap = actions.readMapPhoto;
  const shot = s.parsedPhoto?.url ?? null;
  const frameColor = { success: "#4CC38A", mismatch: "#F2C37A", fail: "#F2C37A" }[s.scanState as string] ?? "#FFFFFF";
  // Real recognition needs a frame. With the camera on, map photos always go to the AI;
  // ?demo keeps the simulated sign outcome so presenters can drive it by hand.
  const isMap = s.scanTarget === "map";
  const reading = isMap && s.scanState === "analyzing";
  const realScan = camOn && (isMap || !demo);
  const finderRef = useRef<HTMLDivElement>(null);

  /** Live: capture one frame (cropped to the detected sign when there is one). Otherwise: the simulated result. */
  const confirmScan = async (crop?: Box) => {
    if (!realScan) {
      if (floorCapture) {
        album.open();
        return;
      }
      actions.runScan();
      return;
    }
    setCapturing(true);
    try {
      // Maps: 2048px at higher JPEG quality, already final size so the upload isn't re-encoded.
      const frame = await grab(isMap ? 2048 : 1280, isMap ? crop : undefined, isMap ? MAP_JPEG_QUALITY : 0.7);
      if (frame) (isMap ? readMap : actions.runScan)(frame);
      else actions.toast("카메라 화면이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setCapturing(false);
    }
  };

  // Map scans with the camera on: follow the sign, and take the photo once it has been held still.
  const tracked = useSignTracker(videoRef, finderRef, camOn && isMap && s.scanState === "aim" && !capturing && !upload, (box) => void confirmScan(box));

  const manualOpts: { label: string; pick: () => void }[] = (() => {
    switch (s.scanTarget) {
      case "map":
        return floorCapture ? [{ label: "앨범에서 안내도 사진 선택", pick: album.open }] : [{ label: "데모 안내도 불러오기", pick: () => actions.go("mapResult", { mapDemo: true }) }];
      case "sign":
        return ["엘리베이터 홀", "서측 복도", "동측 복도"].map((p) => `${destFloor} ${p}`).map((l) => ({
          label: l,
          pick: () => actions.go("offroute", { offState: "confirm", offFloor: destFloor, offSign: `${l} · 직접 선택` }),
        }));
    }
  })();
  // Map scans can also fall back to picking the start point directly.
  if (s.scanTarget === "map" && !floorCapture) START_NODES.forEach((n) => manualOpts.push({ label: `안내도 없이 1층 ${n.label}에서 시작`, pick: () => actions.go("start", { start: n.id }) }));

  const manualPair = (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => actions.update({ scanState: "aim", manual: false })} className="h-[52px] rounded-[14px] border-none bg-ink text-[15px] font-bold text-white">
        재촬영
      </button>
      <button type="button" onClick={() => floorCapture ? album.open() : actions.update({ manual: true })} className="h-[52px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink">
        {floorCapture ? "앨범에서 선택" : m.manualLabel}
      </button>
    </div>
  );

  const aim = s.scanState === "aim";
  const showSheet = !aim || s.manual;
  const guide = camError
    ? camError
    : upload
      ? "사진에서 안내도를 찾았어요 · 곧 이 부분만 읽어요"
      : tracked
        ? tracked.progress >= 1
          ? "촬영 중…"
          : "가만히 들고 계세요"
        : s.scanState === "success"
          ? `인식: ${m.read}`
          : aim
            ? m.guide
            : null;
  const progress = tracked?.progress ?? 0;
  const iconBtn = "flex size-[52px] items-center justify-center rounded-2xl border-[1.5px] border-white/60 bg-white/10 text-white";

  return (
    <div className="relative flex h-full min-h-[560px] flex-col overflow-hidden bg-black">
      {/* Viewfinder: the whole screen, like a camera app. */}
      <div ref={finderRef} className="absolute inset-0">
        <video ref={videoRef} autoPlay playsInline muted aria-hidden="true" className={`absolute inset-0 size-full object-cover ${camOn ? "" : "hidden"}`} />
        {!camOn && isMap && !upload && <SampleEvacMap />}
        {upload && (
          // The picked photo with the sign framed, drawn in the photo's own pixels so the frame lands exactly.
          <svg viewBox={`0 0 ${upload.w} ${upload.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full bg-black">
            <image href={upload.url} width={upload.w} height={upload.h} />
            <path
              fillRule="evenodd"
              fill="rgba(0,0,0,.32)"
              d={`M0 0H${upload.w}V${upload.h}H0Z M${upload.box.x * upload.w} ${upload.box.y * upload.h}h${upload.box.w * upload.w}v${upload.box.h * upload.h}h${-upload.box.w * upload.w}Z`}
            />
            <rect
              role="button"
              aria-label="이 안내도 읽기"
              tabIndex={0}
              onClick={() => void readUpload(true)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && void readUpload(true)}
              x={upload.box.x * upload.w}
              y={upload.box.y * upload.h}
              width={upload.box.w * upload.w}
              height={upload.box.h * upload.h}
              rx={upload.box.w * upload.w * 0.02}
              fill="transparent"
              stroke="#fff"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
            />
            <rect
              x={upload.box.x * upload.w}
              y={(upload.box.y + upload.box.h * 0.95) * upload.h}
              width={upload.box.w * upload.w * upload.progress}
              height={upload.box.h * upload.h * 0.03}
              fill="#4CC38A"
              pointerEvents="none"
            />
          </svg>
        )}
        {reading && shot && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={shot} alt="" className="absolute inset-0 size-full bg-black object-contain" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(40,100,160,.10)_1px,transparent_1px),linear-gradient(90deg,rgba(40,100,160,.10)_1px,transparent_1px)] bg-[size:22px_22px]" aria-hidden="true" />
            <div aria-hidden="true" className="gg-scan pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent to-[rgba(120,180,255,.35)]">
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[#9CCBFF] shadow-[0_0_12px_2px_rgba(120,180,255,.8)]" />
            </div>
          </>
        )}
        {/* Camera-app guides while searching: thirds grid, frame brackets, centre crosshair. */}
        {aim && !tracked && !upload && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            {["left-1/3", "left-2/3"].map((c) => (
              <div key={c} className={`absolute inset-y-0 w-px bg-white/20 ${c}`} />
            ))}
            {["top-1/3", "top-2/3"].map((c) => (
              <div key={c} className={`absolute inset-x-0 h-px bg-white/20 ${c}`} />
            ))}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isMap ? "aspect-[3/2] w-[84%]" : "aspect-[2/1] w-[70%]"}`}>
              {[
                "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl",
                "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl",
                "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl",
                "right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-xl",
              ].map((c) => (
                <div key={c} className={`absolute size-9 ${c}`} style={{ borderColor: frameColor }} />
              ))}
              <div className="absolute top-1/2 left-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-white/85" />
              <div className="absolute top-1/2 left-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 bg-white/85" />
            </div>
          </div>
        )}
        {tracked && (
          // The frame follows the sign. Tap it to take the photo now instead of waiting.
          <button
            type="button"
            aria-label="이 안내도 촬영"
            onClick={() => void confirmScan(tracked.box)}
            className="absolute rounded-lg border-[3px] bg-transparent p-0 transition-[left,top,width,height,border-color] duration-150 ease-out"
            style={{ ...tracked.rect, borderColor: tracked.progress >= 1 ? "#4CC38A" : "rgba(255,255,255,.95)", boxShadow: "0 0 0 9999px rgba(0,0,0,.28)" }}
          />
        )}
      </div>

      {/* Top bar over the picture. */}
      <div className="relative z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-2 pt-1 pb-5 text-white">
        <button type="button" onClick={actions.back} aria-label="닫기" className="flex size-11 items-center justify-center border-none bg-transparent text-white">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <h1 className="m-0 text-[15px] font-bold [text-shadow:0_1px_3px_rgba(0,0,0,.5)]">{m.title}</h1>
        <div className="flex min-w-11 justify-end gap-1.5">
          {demo && <div className="self-center rounded border border-[#6B5530] px-1.5 py-[3px] font-mono text-[10px] font-semibold text-[#F2C37A]">데모</div>}
          {torch.supported ? (
            <button
              type="button"
              onClick={() => void toggleTorch()}
              aria-pressed={torch.on}
              aria-label={torch.on ? "손전등 끄기" : "손전등 켜기"}
              className={`flex size-11 items-center justify-center rounded-full border-none ${torch.on ? "bg-[#F2C37A] text-ink" : "bg-black/35 text-white"}`}
            >
              <svg width="18" height="20" viewBox="0 0 18 20" fill="currentColor" aria-hidden="true">
                <path d="M10.5 0 2 11h6l-1.5 9L16 8h-6z" />
              </svg>
            </button>
          ) : (
            !camOn &&
            s.scanState !== "denied" && (
              <button type="button" onClick={() => void startCam()} className="h-9 self-center rounded-full border border-white/40 bg-black/35 px-3 text-[13px] font-semibold text-white">
                카메라 켜기
              </button>
            )
          )}
        </div>
      </div>

      {guide && (
        <div className="relative z-10 mx-auto max-w-[88%] rounded-full bg-[rgba(21,23,21,.72)] px-4 py-1.5 text-center text-[14px] leading-[1.4] font-bold text-white" role="status" aria-live="polite">
          {guide}
        </div>
      )}
      <div className="flex-1" />

      {album.input}

      {/* ?demo: pick the simulated result above the shutter. */}
      {demo && !floorCapture && aim && !upload && !s.manual && (
        <div className="relative z-10 mx-4 mb-2 grid grid-cols-3 gap-1.5">
          {OUTCOMES.map(([k, l]) => (
            <SegButton key={k} on={s.outcome === k} onClick={() => actions.update({ outcome: k })} className="h-9 text-[13px]">
              {l}
            </SegButton>
          ))}
        </div>
      )}

      {/* Bottom bar: gallery | shutter | demo or manual pick. */}
      {aim && !s.manual && (
        <div className="relative z-10 bg-black/80 px-6 pt-4 pb-[calc(18px+env(safe-area-inset-bottom))]">
          {upload ? (
            <div className="grid grid-cols-2 gap-2">
              <PrimaryButton onClick={() => void readUpload(true)}>이 부분 읽기</PrimaryButton>
              <SecondaryButton className="h-[58px]" onClick={() => void readUpload(false)}>
                사진 전체로
              </SecondaryButton>
            </div>
          ) : (
            <div className="grid grid-cols-3 items-center">
              <div className="flex flex-col items-center gap-1 justify-self-start">
                {isMap && (
                  <>
                    <button type="button" onClick={album.open} aria-label="앨범에서 안내도 사진 선택" className={iconBtn}>
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        <rect x="2" y="3" width="18" height="16" rx="3" />
                        <circle cx="8" cy="9" r="1.8" />
                        <path d="M3 17l5-5 4 4 3-3 4 4" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <span className="text-[11px] font-semibold text-white/80">앨범</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => void confirmScan(tracked?.box)}
                disabled={capturing}
                aria-label={m.runLabel}
                className="relative size-[76px] justify-self-center rounded-full border-none bg-transparent p-0 disabled:opacity-60"
              >
                {/* Ring fills green while the sign is held still; the photo is taken when it closes. */}
                <svg viewBox="0 0 76 76" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
                  <circle cx="38" cy="38" r="35" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="4" />
                  {progress > 0 && (
                    <circle cx="38" cy="38" r="35" fill="none" stroke="#4CC38A" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={`${progress} 1`} />
                  )}
                </svg>
                <span className="absolute inset-[9px] rounded-full bg-white transition-transform duration-100 active:scale-90" />
              </button>
              <div className={`flex flex-col items-center gap-1 justify-self-end ${floorCapture ? "invisible" : ""}`}>
                <button
                  type="button"
                  disabled={floorCapture}
                  onClick={() => (isMap ? actions.go("mapResult", { mapDemo: true }) : actions.update({ manual: true }))}
                  aria-label={isMap ? "데모 안내도 불러오기" : "직접 선택"}
                  className={iconBtn}
                >
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    {isMap ? <path d="M3 5l5-2 6 2 5-2v14l-5 2-6-2-5 2zM8 3v14M14 5v14" strokeLinejoin="round" /> : <path d="M4 6h14M4 11h14M4 16h9" />}
                  </svg>
                </button>
                <span className="text-[11px] font-semibold text-white/80">{isMap ? "데모" : "직접 선택"}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results, loading and errors slide up over the camera. */}
      {showSheet && (
      <div role="status" aria-live="polite" className="relative z-10 flex max-h-[72%] flex-col gap-3.5 overflow-y-auto rounded-t-[26px] bg-app-bg px-5 pt-[22px] pb-[calc(24px+env(safe-area-inset-bottom))]">
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
              <div className="text-[15px] leading-normal text-muted">{floorCapture ? "브라우저에서 카메라를 허용하거나 앨범에서 이 층의 안내도 사진을 선택해 주세요." : "브라우저 설정 › 사이트 권한 › 카메라에서 허용할 수 있어요. 지금은 체크포인트를 직접 골라 계속할 수 있어요."}</div>
            </div>
            <PrimaryButton onClick={() => floorCapture ? album.open() : actions.update({ manual: true })} className="h-[54px] rounded-2xl text-[16px]">
              {floorCapture ? "앨범에서 안내도 선택" : "수동 체크포인트 선택"}
            </PrimaryButton>
          </>
        )}
        {s.manual && (
          <>
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
            <button type="button" onClick={() => actions.update({ manual: false })} className="h-11 border-none bg-transparent text-[15px] font-semibold text-muted">
              카메라로 돌아가기
            </button>
          </>
        )}
      </div>
      )}
    </div>
  );
}
