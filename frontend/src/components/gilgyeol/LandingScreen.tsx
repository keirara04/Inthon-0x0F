"use client";

import { useRef, useState } from "react";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { PrimaryButton, SecondaryButton } from "./ui";

/**
 * Mobile landing from the Claude Design handoff ("Gilgyeol Landing Trial").
 * The handoff bundled a separate simulated trial; here the CTA enters the real app flow
 * (welcome → building → …) so nothing on this page pretends to be a feature we do not have.
 */

type Sec = "how" | "trial" | "faq";

const ROUTE_STOPS = [
  { label: "1층 로비", kind: "출발 · 샘플 시작 지점", glyph: "1F", radius: "50%", bg: "#fff", bd: "#202421", fg: "#202421", chip: "" },
  { label: "중앙 엘리베이터 홀", kind: "엘리베이터 · 층 이동", glyph: "EV", radius: "7px", bg: "#2864A0", bd: "#2864A0", fg: "#fff", chip: "4층 정차" },
  { label: "4층", kind: "층 표지 체크포인트", glyph: "4F", radius: "50%", bg: "#fff", bd: "#5B4AB8", fg: "#4A3BA0", chip: "" },
  { label: "405호", kind: "목적지 · 호실", glyph: "405", radius: "50%", bg: "#7A1832", bd: "#7A1832", fg: "#fff", chip: "" },
];

const TRIAL_STEPS = [
  "안내도 사진 선택",
  "AI 안내도 확인",
  "출발 위치 지정",
  "405호 검색",
  "경로 확인",
  "안내 방식 선택",
  "이동 안내",
  "405호 도착",
];

const FAQS = [
  {
    q: "체험에 로그인이 필요한가요?",
    a: "아니요. 로그인 없이 우정정보관 데모 경로를 바로 체험할 수 있어요.",
  },
  {
    q: "안내도 사진과 카메라를 사용하나요?",
    a: "안내도 사진은 AI가 복도와 호실을 읽어 지도로 만드는 데 쓰고, 저장하지 않아요. 방향 안내는 나침반 센서를, 표지 확인은 카메라를 사용해요. 위치·마이크 권한은 요청하지 않아요.",
  },
  {
    q: "어느 건물을 체험할 수 있나요?",
    a: "지금은 우정정보관 1층부터 4층까지 샘플 데이터로 1층 로비에서 405호까지 가는 경로를 보여줘요.",
  },
  {
    q: "비상 대피 안내에 쓸 수 있나요?",
    a: "아니요. 어디路는 일상 길찾기 도구예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.",
  },
];

export function LandingScreen() {
  const { actions } = useGilgyeol();
  const [menu, setMenu] = useState(false);
  const [faq, setFaq] = useState(-1);
  const secRefs = useRef<Record<Sec, HTMLElement | null>>({ how: null, trial: null, faq: null });

  const startTrial = () => actions.go("trial");

  const jump = (id: Sec) => {
    setMenu(false);
    requestAnimationFrame(() => secRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return (
    <div className="relative">
      <header className="sticky top-0 z-[5] flex items-center justify-between gap-2 border-b border-line bg-app-bg/95 py-2.5 pr-3.5 pl-5">
        <div className="flex items-baseline gap-1">
          <span className="text-[24px] font-extrabold tracking-[-0.04em] text-brand">어디路</span>
          <span className="text-[12px] font-semibold text-muted">(어디로)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={startTrial}
            className="h-11 rounded-[14px] border-none bg-brand px-3.5 text-[14px] font-bold whitespace-nowrap text-white"
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
            <span aria-hidden="true" className="h-0.5 w-4 rounded-[1px] bg-ink" />
            <span aria-hidden="true" className="h-0.5 w-4 rounded-[1px] bg-ink" />
          </button>
        </div>
      </header>
      {menu && (
        <nav
          aria-label="랜딩 메뉴"
          className="sticky top-[65px] z-[5] mx-3 flex flex-col overflow-hidden rounded-2xl bg-surface shadow-[0_10px_24px_rgba(30,28,20,.12)]"
        >
          {(
            [
              ["어떻게 안내하나요?", "how"],
              ["하은의 3분", "trial"],
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

      <section className="flex flex-col gap-[18px] px-5 pt-7 pb-2">
        <div className="inline-flex items-center gap-1.5 self-start rounded-lg bg-haptic-tint px-2.5 py-1.5 text-[13px] font-bold text-haptic-ink">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-haptic" />
          로그인 없이 · 샘플 경로 체험
        </div>
        <h1 className="m-0 text-[33px] leading-[1.24] font-extrabold tracking-[-0.035em] text-pretty">
          처음 온 건물에서도,
          <br />
          다음 방향이 분명하도록.
        </h1>
        <p className="m-0 text-[16px] leading-[1.6] text-pretty text-muted">
          어디路는 안내도 사진을 AI로 읽어 만든 지도와 주변 표지로 목적지까지 안내해요. 화면을 계속 보지 않아도 되도록 음성·진동으로도 안내해요.
        </p>
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={startTrial}>3분 체험해보기 →</PrimaryButton>
          <SecondaryButton onClick={() => jump("how")}>어떻게 안내하나요?</SecondaryButton>
        </div>
        <div className="flex flex-col rounded-[22px] bg-surface px-[18px] pt-[18px] pb-1.5">
          <div className="flex items-center justify-between pb-3.5">
            <span className="text-[13px] font-bold text-muted">우정정보관 · 405호 경로</span>
            <span className="rounded-md bg-warn-tint px-2 py-[3px] text-[12px] font-bold text-warn-ink">샘플</span>
          </div>
          {ROUTE_STOPS.map((st, i) => (
            <div key={st.label} className="flex items-stretch gap-3">
              <div className="flex w-[30px] flex-none flex-col items-center">
                <div
                  className="flex size-[30px] flex-none items-center justify-center text-[12px] font-extrabold"
                  style={{ borderRadius: st.radius, background: st.bg, border: `2px solid ${st.bd}`, color: st.fg }}
                >
                  {st.glyph}
                </div>
                <div
                  aria-hidden="true"
                  className="min-h-3.5 w-[3px] flex-1"
                  style={{ background: i === ROUTE_STOPS.length - 1 ? "transparent" : "#2864A0" }}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1 pb-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[17px] font-bold">{st.label}</span>
                  {st.chip && <span className="rounded-md bg-ok-tint px-1.5 py-0.5 text-[12px] font-bold text-ok-ink">{st.chip}</span>}
                </div>
                <span className="text-[13px] text-muted">{st.kind}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section ref={(el) => { secRefs.current.how = el; }} data-sec="how" className="scroll-mt-[76px] px-5 pt-11 pb-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">어떻게 안내하나요?</h2>
          <p className="m-0 text-[15px] leading-normal text-muted">읽고, 고르고, 따라가는 세 순간이에요.</p>
        </div>
        <div className="mt-3.5 flex flex-col gap-2.5">
          <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-5">
            <span className="text-[12px] font-extrabold text-muted">01</span>
            <div className="text-[19px] font-extrabold">안내도를 찍으면</div>
            <div className="text-[15px] leading-normal text-[#3F433F]">AI가 복도와 호실을 읽어 지도로 만들어요.</div>
            <div aria-hidden="true" className="relative h-14 overflow-hidden rounded-[14px] border border-edge bg-app-bg">
              <svg viewBox="0 0 300 56" className="size-full">
                <g stroke="#EAE7DF" strokeWidth="10" strokeLinecap="round">
                  <line x1="18" y1="30" x2="282" y2="30" />
                  <line x1="96" y1="30" x2="96" y2="54" />
                  <line x1="212" y1="30" x2="212" y2="6" />
                </g>
                <rect x="60" y="19" width="22" height="22" rx="4" fill="#2864A0" />
                <text x="71" y="34" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">401</text>
                <rect x="124" y="19" width="22" height="22" rx="4" fill="#BDB8AC" />
                <text x="135" y="34" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">403</text>
                <rect x="226" y="19" width="26" height="22" rx="4" fill="#5B4AB8" />
                <text x="239" y="34" textAnchor="middle" fontSize="9" fontWeight="800" fill="#fff">EV</text>
                <circle cx="18" cy="30" r="5" fill="#7A1832" />
              </svg>
              <span className="absolute top-1.5 left-2 rounded bg-white/85 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted">AI가 읽은 4층</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-[18px]">
              <span className="text-[12px] font-extrabold text-muted">02</span>
              <div className="flex size-[34px] items-center justify-center rounded-lg bg-route">
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" fill="none" stroke="#fff" strokeWidth="2" />
                  <line x1="11" y1="11" x2="15" y2="15" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-[17px] leading-[1.3] font-extrabold">목적지를 고르고</div>
              <div className="text-[14px] leading-normal text-[#3F433F]">‘405호’처럼 검색하면 경로와 엘리베이터를 확인해요.</div>
            </div>
            <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface p-[18px]">
              <span className="text-[12px] font-extrabold text-muted">03</span>
              <div aria-hidden="true" className="size-[34px] rounded-full border-[3px] border-haptic" />
              <div className="text-[17px] leading-[1.3] font-extrabold">진동·음성으로 따라가고</div>
              <div className="text-[14px] leading-normal text-[#3F433F]">표지 체크포인트로 위치를 다시 확인해요.</div>
            </div>
          </div>
        </div>
      </section>

      <section ref={(el) => { secRefs.current.trial = el; }} data-sec="trial" className="scroll-mt-[76px] px-5 pt-11 pb-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="m-0 text-[24px] font-extrabold tracking-[-0.02em]">하은의 3분</h2>
          <p className="m-0 text-[15px] leading-normal text-muted">처음 온 하은이 우정정보관 405호를 찾아가요.</p>
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {TRIAL_STEPS.map((t, i) => (
            <div
              key={t}
              className={`flex flex-col gap-2 rounded-2xl bg-surface p-3.5 ${i === TRIAL_STEPS.length - 1 && TRIAL_STEPS.length % 2 === 1 ? "col-span-2" : ""}`}
            >
              <div className="flex size-[26px] items-center justify-center rounded-full bg-ink text-[12px] font-extrabold text-white">{i + 1}</div>
              <div className="text-[15px] leading-[1.35] font-bold">{t}</div>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex items-center justify-center gap-3.5 text-[13px] font-semibold text-muted">
          <span>약 3분</span>
          <span aria-hidden="true">·</span>
          <span>로그인 없음</span>
          <span aria-hidden="true">·</span>
          <span>우정정보관 데모</span>
        </div>
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
                  <span aria-hidden="true" className="flex-none text-[20px] font-medium text-muted">{open ? "−" : "+"}</span>
                </button>
                {open && (
                  <div id={`gg-faq-${i}`} className="px-4 pb-4 text-[14px] leading-[1.55] text-muted">
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
          <div className="text-[14px] leading-[1.55] text-[#C9CCC6]">
            로그인 없이 시작해요. 우정정보관 안내도를 찍어 지도로 만들고, 405호까지 실제 안내 화면으로 이동해요.
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
        <div className="text-[20px] font-extrabold tracking-[-0.04em] text-brand">어디路</div>
        <div className="text-[12px] leading-[1.55] text-muted">
          어디路는 일상 길찾기 도구예요. 비상 시에는 공식 경보와 현장 안내를 따르세요.
        </div>
      </footer>
    </div>
  );
}
