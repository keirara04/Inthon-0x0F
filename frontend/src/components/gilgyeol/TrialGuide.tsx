"use client";

import { useEffect, useRef, useState } from "react";
import { API_MODE } from "@/lib/gilgyeol/api";
import { useGilgyeol, type AppState } from "@/lib/gilgyeol/store";

/**
 * Guided 3-minute trial overlay.
 *
 * It never replaces the app screens: it dims the real screen, cuts a hole over the real
 * control (`data-trial="…"`) and explains what to press. Advancing happens by pressing that
 * control, so the trial walks the actual flow instead of a look-alike demo.
 */

interface Step {
  key: string;
  no: number;
  title: string;
  text: string;
  final?: boolean;
  /** Only shown while the API adapter is in mock mode, so nobody mistakes sample data for AI output. */
  note?: string;
}

const TOTAL = 8;

function stepFor(s: AppState): Step | null {
  if (!s.trialOn || s.sheet) return null;
  switch (s.screen) {
    case "captureIntro":
      return {
        key: "capture-album",
        no: 1,
        title: "저장된 안내도 사진",
        text: "하은이 휴대폰에 저장해 둔 우정정보관 안내도 사진을 골라 주세요. 카메라로 새로 찍지 않아도 돼요.",
      };
    case "mapResult":
      return {
        key: "map-confirm",
        no: 2,
        title: s.mapDemo ? "데모 안내도" : "AI가 읽은 안내도",
        text: s.mapDemo
          ? "AI가 사진을 읽지 못해 준비된 데모 안내도로 이어가요. 실제 앱에서는 사진을 읽어 같은 화면을 만들어요."
          : "사진 속 복도와 호실을 지도로 읽었어요. 맞으면 ‘이 안내도가 맞아요’를 눌러주세요.",
        note: !s.mapDemo && API_MODE === "mock" ? "지금은 서버 대신 체험용 샘플 데이터로 읽어요." : undefined,
      };
    case "start":
      if (!s.start) {
        if (s.landmarks) {
          return {
            key: "start-main",
            no: 3,
            title: "출발 위치 지정",
            text: "하은은 1층 정문으로 들어와 로비에 있어요. ‘1층 정문 출입구’를 선택해 주세요.",
          };
        }
        return {
          key: "start-landmarks",
          no: 3,
          title: "출발 위치 지정",
          text: "안내도에서 하은의 위치를 확정하지 못했어요. ‘층·랜드마크 직접 선택’으로 지금 있는 곳을 골라 주세요.",
        };
      }
      return {
        key: "start-confirm",
        no: 3,
        title: "출발 위치 확인",
        text: "출발 위치가 정해졌어요. ‘맞아요, 계속하기’를 눌러 목적지를 찾아요.",
      };
    case "search":
      if (!/405/.test(s.query)) {
        return {
          key: "search-input",
          no: 4,
          title: "목적지 검색",
          text: "하은이 갈 곳은 우정정보관 4층 405호예요. 검색창에 ‘405호’를 입력해 주세요.",
        };
      }
      return {
        key: "dest-405",
        no: 4,
        title: "405호 선택",
        text: "검색 결과에서 ‘405호’를 눌러 경로를 확인하세요.",
      };
    case "preview":
      return {
        key: "preview-next",
        no: 5,
        title: "경로 확인",
        text: "1층에서 엘리베이터로 올라가 4층 왼쪽 복도까지 가는 경로예요. ‘안내 방식 선택’을 눌러 이동을 준비해요.",
      };
    case "mode":
      return {
        key: "mode-start",
        no: 6,
        title: "안내 방식",
        text: "하은은 화면을 계속 보지 않아도 되도록 진동과 음성을 함께 골라요. 기본값 그대로 ‘진동·음성 안내 시작’을 눌러주세요.",
      };
    case "guide": {
      const next = s.steps[s.step + 1];
      if (!next) {
        return {
          key: "guide-next",
          no: 7,
          title: "이동 안내",
          text: "왼쪽 복도로 이동해요. ‘405호 도착’을 누르면 도착 화면으로 넘어가요.",
        };
      }
      if (next.kind === "elevator" || next.kind === "stairs") {
        return {
          key: "guide-next",
          no: 7,
          title: "이동 안내",
          text: `화면의 방향과 다음 지점을 보며 이동해요. ${next.kind === "stairs" ? "계단에" : "엘리베이터 홀에"} 오면 강조된 버튼을 눌러주세요.`,
        };
      }
      return {
        key: "guide-next",
        no: 7,
        title: "이동 안내",
        text: "화면의 방향과 다음 지점을 보며 이동해요. 강조된 버튼을 누르면 다음 안내로 넘어가요.",
      };
    }
    case "elevator":
      return {
        key: "elev-leave",
        no: 7,
        title: "층 이동",
        text: "엘리베이터로 4층에 올라가요. 4층에서 내린 뒤 ‘4층에서 내렸어요’를 눌러주세요.",
      };
    case "arrive":
      return {
        key: "arrive-title",
        no: 8,
        title: "405호 도착",
        text: "우정정보관 4층 405호에 도착했어요. 3분 체험은 여기까지예요. 실제 앱에서는 이 화면에서 이동 통계와 비상구 정보를 확인할 수 있어요.",
        final: true,
      };
    default:
      return null;
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  dw: number;
  dh: number;
}

export function TrialGuide() {
  const { state: s, actions, scrollRef } = useGilgyeol();
  const step = stepFor(s);
  const key = step?.key;
  const [box, setBox] = useState<Box | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  /** Throttle auto-follow so a layout change (e.g. a list opening) cannot trap the target off-screen. */
  const lastFollow = useRef(0);

  useEffect(() => {
    if (!key) return;
    const device = rootRef.current?.parentElement;
    if (!device) return;
    let alive = true;
    let last = "";
    lastFollow.current = 0;

    const measure = () => {
      if (!alive) return;
      const el = device.querySelector<HTMLElement>(`[data-trial="${key}"]`);
      if (!el) {
        setBox(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const d = device.getBoundingClientRect();
      // Target moved out of view (new content pushed it down): bring it back, at most once a second.
      if (r.bottom < d.top || r.top > d.bottom) {
        const now = Date.now();
        if (now - lastFollow.current > 900) {
          lastFollow.current = now;
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        }
        setBox(null);
        return;
      }
      const next = { x: r.left - d.left, y: r.top - d.top, w: r.width, h: r.height, dw: d.width, dh: d.height };
      const sig = [next.x, next.y, next.w, next.h, next.dw].map((v) => Math.round(v)).join(",");
      if (sig !== last) {
        last = sig;
        setBox(next);
      }
    };

    const focus = setTimeout(() => {
      device.querySelector<HTMLElement>(`[data-trial="${key}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      measure();
    }, 120);

    const id = setInterval(measure, 120);
    const scroller = scrollRef.current ?? device;
    scroller.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      clearTimeout(focus);
      clearInterval(id);
      scroller.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [key, scrollRef]);

  // Live parsing can fail (server error, timeout). The app shows its own recovery choices; the trial
  // must not quietly drop its overlay there, and must not claim the photo was read.
  const scanFailed = s.trialOn && s.screen === "scan" && s.scanTarget === "map" && s.scanState === "fail";
  if (scanFailed) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[4]">
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(20,19,16,0.58)]" />
        <section
          aria-label="3분 체험 안내"
          className="pointer-events-auto absolute inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] flex flex-col gap-2 rounded-[18px] bg-surface p-4 shadow-[0_18px_40px_rgba(20,19,16,.35)]"
        >
          <span className="text-[12px] font-extrabold tracking-[0.02em] text-brand">3분 체험 · 1 / 5</span>
          <div className="text-[18px] leading-[1.3] font-extrabold text-ink">안내도를 읽지 못했어요</div>
          <p className="m-0 text-[14px] leading-[1.5] text-[#3F433F]">
            사진을 다시 고르거나, 준비된 데모 안내도로 이어서 체험할 수 있어요. 실제 앱에서도 같은 선택지가 있어요.
          </p>
          <button
            type="button"
            onClick={() => actions.go("captureIntro")}
            className="h-11 rounded-[14px] border-none bg-brand text-[15px] font-bold text-white"
          >
            사진 다시 고르기
          </button>
          <button
            type="button"
            onClick={() => actions.go("mapResult", { mapDemo: true })}
            className="h-10 rounded-[14px] border-[1.5px] border-edge bg-surface text-[14px] font-semibold text-ink"
          >
            데모 안내도로 계속
          </button>
          <button
            type="button"
            onClick={() => actions.endTrial(true)}
            className="h-8 rounded-lg border-none bg-transparent text-[12px] font-semibold text-muted underline underline-offset-2"
          >
            체험 종료
          </button>
        </section>
      </div>
    );
  }

  if (!step) return null;
  if (!box) return <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[4]" />;

  const final = !!step.final;
  const tipW = Math.min(300, box.dw - 32);
  // Slight over-estimate: the card is placed above the target when it does not fit below, and an
  // under-estimate would let the card grow down over the highlighted control.
  const tipH = step.note ? 320 : 280;
  const centerX = box.x + box.w / 2;
  const left = Math.max(16, Math.min(centerX - tipW / 2, box.dw - tipW - 16));
  const below = box.y + box.h + 14;
  const above = box.y - tipH - 14;
  const top = below + tipH <= box.dh - 12 ? below : Math.max(12, Math.min(above, box.dh - tipH - 12));
  // The completion card sits at the bottom so the highlighted arrival heading stays visible above it.
  const cardStyle = final ? undefined : { left, top, width: tipW };

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[4]">
      {/* Spotlight: the huge shadow dims everything except the hole; the layer never takes taps. */}
      <div
        aria-hidden="true"
        className="absolute rounded-[14px] border-2 border-white/95 transition-[left,top,width,height] duration-150 ease-out"
        style={{
          left: box.x - 4,
          top: box.y - 4,
          width: box.w + 8,
          height: box.h + 8,
          boxShadow: "0 0 0 9999px rgba(20, 19, 16, 0.58), 0 0 0 4px rgba(255, 255, 255, 0.18), 0 8px 24px rgba(0, 0, 0, 0.28)",
        }}
      />
      <section
        aria-label="3분 체험 안내"
        className={`pointer-events-auto absolute flex flex-col gap-2 rounded-[18px] bg-surface p-4 shadow-[0_18px_40px_rgba(20,19,16,.35)] ${
          final ? "inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))]" : ""
        }`}
        style={cardStyle}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-extrabold tracking-[0.02em] text-brand">3분 체험 · {step.no} / {TOTAL}</span>
          <div className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={`size-1.5 rounded-full ${i < step.no ? "bg-brand" : "bg-edge"}`} />
            ))}
          </div>
        </div>
        <div className="text-[18px] leading-[1.3] font-extrabold text-ink">{step.title}</div>
        <p className="m-0 text-[14px] leading-[1.5] text-[#3F433F]">{step.text}</p>
        {step.note && (
          <p className="m-0 rounded-lg bg-warn-tint px-2.5 py-2 text-[12px] leading-[1.45] font-semibold text-warn-ink">{step.note}</p>
        )}
        {step.final ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => actions.endTrial(false)}
              className="h-11 rounded-[14px] border-none bg-brand text-[15px] font-bold text-white"
            >
              체험 마치고 계속하기
            </button>
            <button
              type="button"
              onClick={() => actions.endTrial(true)}
              className="h-10 rounded-[14px] border-[1.5px] border-edge bg-surface text-[14px] font-semibold text-ink"
            >
              처음 화면으로
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[12px] font-semibold text-muted">강조된 버튼을 눌러 계속하세요</span>
            <button
              type="button"
              onClick={() => actions.endTrial(true)}
              className="h-8 flex-none rounded-lg border-none bg-transparent px-1 text-[12px] font-semibold text-muted underline underline-offset-2"
            >
              체험 종료
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
