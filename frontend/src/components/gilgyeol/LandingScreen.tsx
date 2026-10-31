"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { SeekingCompass, useReveal } from "./landing-motion";
import { Mascot } from "./Mascot";
import { PrimaryButton, SecondaryButton } from "./ui";

/** Animation delay for gl-* motion classes (see the Landing motion block in globals.css). */
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const STEP_MS = 450; // route card: one stop every 450 ms

/**
 * Mobile landing from the Claude Design handoff ("Gilgyeol Landing Trial").
 * The handoff bundled a separate simulated trial; here the CTA enters the real app flow
 * (welcome → building → …) so nothing on this page pretends to be a feature we do not have.
 */

type Sec = "trial" | "faq";

const ROUTE_STOPS = [
  { label: "1층 로비", kind: "출발 · 샘플 시작 지점", glyph: "1F", radius: "50%", bg: "#fff", bd: "#202421", fg: "#202421", chip: "" },
  { label: "중앙 엘리베이터 홀", kind: "엘리베이터 · 층 이동", glyph: "EV", radius: "7px", bg: "#2864A0", bd: "#2864A0", fg: "#fff", chip: "4층 정차" },
  { label: "4층", kind: "층 표지 체크포인트", glyph: "4F", radius: "50%", bg: "#fff", bd: "#2864A0", fg: "#1F4F80", chip: "" },
  { label: "405호", kind: "목적지 · 호실", glyph: "405", radius: "50%", bg: "#7A1832", bd: "#7A1832", fg: "#fff", chip: "" },
];

const TRIAL_STEPS = [
  "현재 층 안내도 선택",
  "AI 안내도 확인",
  "출발 위치 확인",
  "층 이동 여부 선택",
  "엘리베이터까지 안내",
  "안내 방식 선택",
  "층 이동",
  "새 층 안내도 선택",
  "405호 선택",
  "405호 도착",
];

const FAQS = [
  {
    q: "안내도 사진과 카메라를 사용하나요?",
    a: "안내도 사진은 AI가 복도와 호실을 읽어 지도로 만드는 데 쓰고, 저장하지 않아요. 방향 안내는 나침반 센서를, 표지 확인은 카메라를 사용해요. 위치·마이크 권한은 요청하지 않아요.",
  },
  {
    q: "어느 건물에서 사용할 수 있나요?",
    a: "피난안내도가 있는 건물이면 사용할 수 있어요.",
  },
];

export function LandingScreen() {
  const { state: s, actions, scrollRef } = useGilgyeol();
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState(-1);
  const secRefs = useRef<Record<Sec, HTMLElement | null>>({ trial: null, faq: null });
  const revealRoute = useReveal<HTMLDivElement>();
  const revealTrial = useReveal<HTMLOListElement>();

  const startTrial = () => actions.enterTrial();
  const [heroCtaVisible, setHeroCtaVisible] = useState(true);
  const heroCta = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = heroCta.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroCtaVisible(e.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const jump = (id: Sec) => {
    setMenu(false);
    requestAnimationFrame(() => secRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="relative">
      <header className="sticky top-0 z-[5] flex items-center justify-between gap-2 border-b border-line bg-app-bg py-2.5 pr-3.5 pl-5">
        {/* Logo = home: back to the top of the landing. */}
        <button
          type="button"
          onClick={() => {
            setMenu(false);
            scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="어디路 홈"
          className="flex min-h-11 min-w-0 items-baseline gap-1 border-none bg-transparent p-0 whitespace-nowrap"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 96px mascot head mark */}
          <img src="/mascot/head.png" alt="" aria-hidden="true" width={30} height={30} className="flex-none self-center" />
          <span className="text-[24px] font-extrabold tracking-[-0.04em] text-brand">어디路</span>
          {/* hidden on very narrow phones (320px) so the header CTA still fits on one line */}
          <span className="text-[13px] font-semibold text-muted max-[359px]:hidden">(어디로)</span>
        </button>
        <div className="flex items-center gap-1.5">
          {/* Shown only once the hero CTA has scrolled away, so the first screen never has two of it. */}
          <button
            type="button"
            onClick={startTrial}
            tabIndex={heroCtaVisible ? -1 : 0}
            aria-hidden={heroCtaVisible}
            className={`h-11 rounded-[14px] border-none bg-brand px-3.5 text-[14px] font-bold whitespace-nowrap text-white transition-[opacity,transform] duration-200 ${
              heroCtaVisible ? "pointer-events-none translate-y-1 opacity-0" : "opacity-100"
            }`}
          >
            3분 체험해보기 →
          </button>
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            aria-label="메뉴"
            aria-expanded={menu}
            className="flex size-11 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-edge bg-surface p-0"
          >
            {/* ☰ morphs into ✕ while the menu is open */}
            <span aria-hidden="true" className={`gl-burger h-0.5 w-4 rounded-[1px] bg-ink ${menu ? "translate-y-[3px] rotate-45" : ""}`} />
            <span aria-hidden="true" className={`gl-burger h-0.5 w-4 rounded-[1px] bg-ink ${menu ? "-translate-y-[3px] -rotate-45" : ""}`} />
          </button>
        </div>
      </header>
      {menu && (
        <nav
          aria-label="랜딩 메뉴"
          className="gl-drop sticky top-[65px] z-[5] mx-3 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_10px_24px_rgba(30,28,20,.12)]"
        >
          {(
            [
              ["길찾기 체험", "trial"],
              ["자주 묻는 질문", "faq"],
            ] as [string, Sec][]
          ).map(([label, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => jump(id)}
              className="min-h-[52px] border-none border-b border-divider bg-surface px-[18px] text-left text-[16px] font-semibold text-ink last:border-b-0"
            >
              {label}
            </button>
          ))}
        </nav>
      )}

      <section className="flex flex-col gap-[18px] px-5 pt-5 pb-2">
        {/* One scene: Alienie (right) looks through the telescope at the compass (left) finding the way. */}
        <div aria-hidden="true" className="relative h-[196px] overflow-hidden rounded-[26px] bg-haptic-tint">
          <svg viewBox="0 0 340 196" preserveAspectRatio="none" className="absolute inset-0 size-full">
            <path d="M118 150 C 170 172, 214 172, 252 150" fill="none" stroke="#A9C3DE" strokeWidth="2.5" strokeDasharray="2 9" strokeLinecap="round" />
          </svg>
          <div className="absolute top-1/2 left-[6%] -translate-y-1/2 scale-[0.92]">
            <SeekingCompass />
          </div>
          <Mascot pose="main" height={128} motion="bob" className="absolute right-[7%] bottom-2" />
        </div>
        <div style={d(0)} className="gl-rise inline-flex items-center gap-1.5 self-start rounded-lg bg-haptic-tint px-2.5 py-1.5 text-[13px] font-bold text-haptic-ink">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-haptic" />
          로그인 없이 · 샘플 경로 체험
        </div>
        <h1 className="m-0 text-[33px] leading-[1.24] font-extrabold tracking-[-0.035em] text-pretty">
          <span style={d(80)} className="gl-rise inline-block">처음 온 건물에서도,</span>
          <br />
          <span style={d(160)} className="gl-rise inline-block">다음 방향이 분명하도록.</span>
        </h1>
        <p style={d(260)} className="gl-rise m-0 text-[16px] leading-[1.6] text-pretty text-muted">
          어디路는 주변 표지와 층 정보를 바탕으로 목적지까지 길을 안내해요. 화면을 계속 보지 않아도 되도록 음성·진동으로도 안내해요.
        </p>
        <div ref={heroCta} style={d(340)} className="gl-rise flex flex-col gap-2">
          <PrimaryButton onClick={startTrial} className="gl-cta">3분 체험해보기 →</PrimaryButton>
          {/* Same 58px spec as the primary CTA, outlined so the trial stays the lead action. */}
          <SecondaryButton tall brand onClick={() => actions.go("auth")}>
            {s.user ? `${s.user.nickname}님 · 내 계정` : "로그인 / 회원가입"}
          </SecondaryButton>
        </div>
        <div ref={revealRoute} data-reveal className="flex flex-col rounded-[22px] bg-surface px-[18px] pt-[18px] pb-1.5">
          <div className="flex items-center justify-between pb-3.5">
            <span className="text-[13px] font-bold text-muted">우정정보관 · 405호 경로</span>
            <span className="rounded-md bg-warn-tint px-2 py-[3px] text-[13px] font-bold text-warn-ink">샘플</span>
          </div>
          {ROUTE_STOPS.map((st, i) => (
            <div key={st.label} className="flex items-stretch gap-3">
              <div className="flex w-[30px] flex-none flex-col items-center">
                <div
                  className={`gl-node flex size-[30px] flex-none items-center justify-center text-[13px] font-extrabold ${i === ROUTE_STOPS.length - 1 ? "gl-arrive" : ""}`}
                  style={{ borderRadius: st.radius, background: st.bg, border: `2px solid ${st.bd}`, color: st.fg, ...d(i * STEP_MS) }}
                >
                  {st.glyph}
                </div>
                <div
                  aria-hidden="true"
                  className="gl-seg min-h-3.5 w-[3px] flex-1"
                  style={{ background: i === ROUTE_STOPS.length - 1 ? "transparent" : "#2864A0", ...d(i * STEP_MS + 180) }}
                />
              </div>
              <div style={d(i * STEP_MS + 80)} className="gl-item flex min-w-0 flex-1 flex-col gap-0.5 pt-1 pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[17px] font-bold">{st.label}</span>
                  {st.chip && <span style={d(i * STEP_MS + 300)} className="gl-chip rounded-md bg-ok-tint px-1.5 py-0.5 text-[13px] font-bold text-ok-ink">{st.chip}</span>}
                </div>
                <span className="text-[13px] text-muted">{st.kind}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section ref={(el) => { secRefs.current.trial = el; }} data-sec="trial" className="scroll-mt-[76px] px-5 pt-11 pb-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">하은의 3분</h2>
          <p className="m-0 text-[15px] leading-normal text-muted">처음 온 하은이 우정정보관 405호를 찾아가요.</p>
        </div>
        {/* One numbered list: an odd step count left a lone card and a stretched last one in the old 2-column grid. */}
        <ol ref={revealTrial} data-reveal className="m-0 mt-3.5 flex list-none flex-col rounded-2xl bg-surface px-4 py-1.5">
          {TRIAL_STEPS.map((t, i) => (
            <li key={t} style={d(i * 60)} className="gl-item flex min-h-[52px] items-center gap-3 border-b border-divider py-2 last:border-b-0">
              <span className="flex size-[26px] flex-none items-center justify-center rounded-full bg-ink text-[13px] font-extrabold text-white">{i + 1}</span>
              <span className="text-[15px] leading-[1.35] font-bold">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      <section ref={(el) => { secRefs.current.faq = el; }} data-sec="faq" className="scroll-mt-[76px] px-5 pt-11 pb-2">
        <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">자주 묻는 질문</h2>
        <div className="mt-3.5 flex flex-col gap-2">
          {FAQS.map((f, i) => {
            const open = faq === i;
            return (
              <div key={f.q} className="overflow-hidden rounded-[14px] bg-surface">
                <button
                  type="button"
                  onClick={() => setFaq(open ? -1 : i)}
                  aria-expanded={open}
                  aria-controls={`gg-faq-${i}`}
                  className="flex min-h-[54px] w-full items-center justify-between gap-3 border-none bg-surface px-4 py-3 text-left text-[15px] font-bold text-ink"
                >
                  {f.q}
                  <span aria-hidden="true" className={`gl-burger flex-none text-[20px] font-medium text-muted ${open ? "rotate-45" : ""}`}>+</span>
                </button>
                {open && (
                  <div id={`gg-faq-${i}`} className="gl-drop px-4 pb-4 text-[14px] leading-[1.55] text-muted">
                    {f.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-5 pt-11 pb-6">
        <div className="flex flex-col gap-3.5 rounded-[24px] bg-ink px-[22px] py-[26px]">
          <div className="text-[24px] leading-[1.3] font-extrabold tracking-[-0.02em] text-white">
            하은과 함께
            <br />
            405호까지 가볼까요?
          </div>
          <button
            type="button"
            onClick={startTrial}
            className="h-[58px] rounded-[18px] border-none bg-white text-[17px] font-extrabold text-brand"
          >
            3분 체험해보기 →
          </button>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-line px-5 pt-6 pb-8">
        <div className="flex items-center gap-1.5 text-[20px] font-extrabold tracking-[-0.04em] text-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- 96px mascot head mark */}
          <img src="/mascot/head.png" alt="" aria-hidden="true" width={26} height={26} className="flex-none self-center" />
          어디路
        </div>
        <div className="text-[13px] leading-[1.55] text-muted">
          어디路는 일상 길찾기 도구예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.
        </div>
      </footer>
    </div>
  );
}
