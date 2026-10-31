"use client";

import { useState } from "react";
import { C, DIRECTION } from "@/lib/gilgyeol/data";
import { useDemoTools } from "@/lib/gilgyeol/demo";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import type { DirectionState } from "@/lib/gilgyeol/types";
import { LiveMap } from "./LiveMap";
import { GhostButton, Notice, PrimaryButton, SegButton, DemoBox, StatusDot } from "./ui";

/** Pulse strength shown as bars — more bars means the target heading is closer. */
const STRENGTH: Record<DirectionState, number> = { far: 1, near: 3, aligned: 4, unstable: 0 };
const PULSE_TEXT: Record<DirectionState, string> = {
  far: "방향 벗어남 · 진동 느리게",
  near: "방향 가까움 · 진동 조금 빠르게",
  aligned: "방향 맞음 · 진동 빠르게",
  unstable: "방향 확인 불가 · 방향 진동 멈춤",
};

const DIR_BTNS: [DirectionState, string][] = [
  ["far", "벗어남"],
  ["near", "가까움"],
  ["aligned", "일치"],
  ["unstable", "불안정"],
];

export function GuidanceScreen() {
  const { state: s, actions, compass } = useGilgyeol();
  const d = useDestName();
  const demo = useDemoTools();
  const [calibOpen, setCalibOpen] = useState(false);
  const steps = s.steps;
  const st = steps[s.step];
  if (!st) return null;
  const unstable = s.dir === "unstable";
  const dv = s.dir === "unstable" ? DIRECTION.far : DIRECTION[s.dir];
  const dirColor = unstable ? C.warning : dv.color;
  // Live needle: the arrow is the phone, the top triangle the corridor. Turning right by `delta` means the
  // phone points `delta` left of the target, so the arrow sits at -delta. Simulated input keeps the old tilt.
  const live = !demo && s.simDir === null && compass.delta !== null && !unstable;
  const needle = live ? -compass.delta! : dv.rot;
  const turnBy = live ? Math.round(Math.abs(compass.delta!) / 5) * 5 : 0;
  const dirMsg = unstable
    ? `방향을 확인하기 어려워요. ${st.landmark || "표지판"}를 기준으로 이동해 주세요`
    : live && s.dir !== "aligned"
      ? `${compass.delta! > 0 ? "오른쪽" : "왼쪽"}으로 약 ${turnBy}° 돌리세요`
      : dv.msg;
  const canCalibrate = st.kind === "walk" && compass.heading !== null;
  const locColor = unstable ? C.warning : C.success;
  const locText = unstable ? "구간 추정 중" : s.step === 0 ? "출발 위치 확인됨" : `${st.floor} 진행 중`;

  const mini =
    s.step === 0
      ? { route: "75,84 75,45", x: 75, y: unstable ? 62 : 74, destOp: 0 }
      : { route: "112,45 75,45 15,45 15,12", x: unstable ? 100 : 108, y: 45, destOp: 1 };

  const prog = s.step;
  const routeLabels = steps.map((x) => `${x.floor} · ${x.title}`);
  const curFloor = parseInt(st.floor, 10) || 1;

  const next = steps[s.step + 1];
  const ctaLabel = !next ? `${d} 도착` : next.kind === "stairs" ? "계단에 왔어요" : next.kind === "elevator" ? "엘리베이터 홀에 왔어요" : "다음 안내";

  return (
    <div className="flex flex-col gap-3.5 px-5 pt-1.5 pb-6">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[15px] font-bold">우정정보관 · {st.floor}</div>
        <div className="flex flex-none items-center gap-2">
          <div role="status" className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: locColor }}>
            <StatusDot color={locColor} />
            {locText}
          </div>
          {/* Always-visible exit; the full "안내 종료" button also stays at the bottom. */}
          <button
            type="button"
            onClick={actions.endGuide}
            aria-label="안내 종료"
            className="h-11 rounded-xl border-[1.5px] border-edge bg-surface px-3 text-[13px] font-bold text-ink"
          >
            종료
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-[14px] bg-warm-panel py-1.5 pr-1.5 pl-3">
        <span className="text-[13px] font-semibold text-ink">
          {s.raised ? "폰 들음" : "폰 내림 · 카메라 꺼짐"}
          <span className="block text-[12px] font-medium text-muted">
            {s.postureSensor ? "경로를 벗어나면 폰을 들어 주변 표지를 비춰요" : "자세 감지가 꺼져 있어요"}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={s.postureSensor}
          onClick={actions.enablePosture}
          className={`h-11 flex-none rounded-[10px] border-[1.5px] px-3 text-[13px] font-bold ${s.postureSensor ? "border-ink bg-ink text-white" : "border-edge bg-surface text-ink"}`}
        >
          {s.postureSensor ? "자세 감지 켜짐" : "자세 감지 켜기"}
        </button>
      </div>
      {s.vibe && !actions.canVibe() && <Notice tone="warn">이 기기에서는 진동 안내를 사용할 수 없어 음성으로 안내합니다</Notice>}

      <div className="relative size-[240px] self-center" role="img" aria-label={`방향 표시: ${dirMsg}`}>
        {!unstable && (
          <div
            key={s.dir}
            aria-hidden="true"
            className="gg-pulse pointer-events-none absolute inset-0 rounded-full border-4 border-haptic"
            style={{ animationDuration: `${dv.period}s` }}
          />
        )}
        <svg width="240" height="240" viewBox="0 0 240 240" className="absolute inset-0" aria-hidden="true">
          <circle cx="120" cy="120" r="106" fill="none" stroke={unstable ? "#C9A66B" : C.line} strokeWidth="3" strokeDasharray={unstable ? "8 8" : undefined} />
          <circle cx="120" cy="120" r="80" fill="#FFFFFF" />
          <polygon points="120,6 111,22 129,22" fill={unstable ? "#CFCAC0" : C.haptic} />
        </svg>
        {unstable ? (
          <div className="absolute inset-0 flex items-center justify-center text-center text-[15px] leading-[1.35] font-bold text-warning">
            방향
            <br />
            확인 불가
          </div>
        ) : (
          <div className="absolute inset-0 transition-transform duration-[220ms] ease-out" style={{ transform: `rotate(${needle}deg)` }} aria-hidden="true">
            <svg width="240" height="240" viewBox="0 0 240 240">
              <polygon points="120,52 152,112 133,106 133,182 107,182 107,106 88,112" fill={dirColor} />
            </svg>
          </div>
        )}
      </div>
      <div className="-mt-1.5 flex justify-center gap-3.5 text-[12px] text-muted" aria-hidden="true">
        <span className="flex items-center gap-[5px]">
          <span className="h-0 w-0 border-r-[5px] border-b-8 border-l-[5px] border-r-transparent border-b-haptic border-l-transparent" />
          목표 방향
        </span>
        <span>화살표 · 내 기기 방향</span>
      </div>
      {canCalibrate && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            aria-expanded={calibOpen}
            onClick={() => setCalibOpen((o) => !o)}
            className="h-9 rounded-full border-[1.5px] border-edge bg-surface px-3.5 text-[13px] font-semibold text-ink"
          >
            {compass.calibrated ? "방향 보정됨 · 다시 맞추기" : "화살표가 엇나가나요? 방향 맞추기"}
          </button>
          {calibOpen && (
            <div className="flex w-full flex-col gap-2.5 rounded-2xl bg-haptic-tint p-3.5 text-[14px] leading-normal text-haptic-ink">
              {/* One tap fixes north for this building: the user knows which way the corridor runs. */}
              <p className="m-0">
                지금 걷는 복도(<b>{st.title}</b> 방향)를 정면으로 바라보고 버튼을 누르세요. 이 건물에서는 한 번만 하면 돼요.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (compass.calibrate()) {
                    setCalibOpen(false);
                    actions.toast("방향을 맞췄어요");
                  } else actions.toast("나침반 값을 아직 못 받았어요. 휴대전화를 잠시 들고 있어 주세요");
                }}
                className="h-11 rounded-xl border-none bg-haptic text-[15px] font-bold text-white"
              >
                지금 이 방향이 맞아요
              </button>
            </div>
          )}
        </div>
      )}
      <div role="status" aria-live="polite" className="text-center text-[17px] font-bold" style={{ color: dirColor }}>
        {dirMsg}
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px] leading-[1.25] font-extrabold tracking-[-0.02em] text-pretty">{st.title}</h1>
        <div className="text-[17px] leading-[1.45] font-medium" style={{ color: st.subWarn ? "#7A4800" : C.muted }}>
          {st.sub}
        </div>
        {st.turn && <div className="self-start rounded-lg bg-haptic-tint px-2.5 py-[5px] text-[13px] font-bold text-haptic-ink">{st.turn}</div>}
      </div>

      {/* Live map: you at the last confirmed point, a cone that turns with the phone, this step's path. */}
      {s.route && <LiveMap route={s.route} stepIndex={s.step} heading={compass.heading} delta={compass.delta} />}

      <div className="flex flex-col gap-3 rounded-2xl bg-surface px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-bold" style={{ color: unstable ? C.warning : C.haptic }}>
            {s.vibe && actions.canVibe() ? PULSE_TEXT[s.dir] : "진동 꺼짐 · 음성·화면으로 안내"}
          </span>
          <span className="flex items-end gap-1" aria-hidden="true">
            {[10, 16, 22, 28].map((h, i) => (
              <span key={h} className="w-1.5 rounded-sm" style={{ height: h, background: i < STRENGTH[s.dir] ? C.haptic : C.line }} />
            ))}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3.5">
        <div className="flex flex-col gap-[3px]">
          <div className="text-[12px] font-semibold text-muted">다음 지점</div>
          <div className="text-[16px] font-bold">{st.next}</div>
        </div>
        <div aria-hidden="true" className="size-3 rounded-full border-[3px] border-haptic" />
      </div>

      <DemoBox label="데모 입력 · 방향 센서 시뮬레이션">
        <div className="grid grid-cols-4 gap-1.5">
          {DIR_BTNS.map(([k, l]) => (
            <SegButton key={k} on={s.dir === k} onClick={() => actions.setDir(k)}>
              {l}
            </SegButton>
          ))}
        </div>
        {st.offDemo && (
          <button type="button" onClick={actions.toOffroute} className="h-11 rounded-xl border-[1.5px] border-[#E5B9B5] bg-err-tint text-[14px] font-bold text-error">
            반대 복도로 이동해 보기
          </button>
        )}
      </DemoBox>

      <PrimaryButton onClick={actions.advance}>{ctaLabel}</PrimaryButton>
      {/* Eyes-free first: details stay folded so the arrow, the instruction and the CTA fill the screen. */}
      <div className="overflow-hidden rounded-2xl bg-surface">
        <button
          type="button"
          aria-expanded={s.routeOpen}
          onClick={() => actions.update({ routeOpen: !s.routeOpen })}
          className="flex min-h-[50px] w-full items-center justify-between gap-3 border-none bg-surface px-4 text-left text-[15px] font-bold text-ink"
        >
          <span>
            자세히
            <span className="block text-[12px] font-medium text-muted">진동 패턴 · {st.floor} 지도 · 전체 경로</span>
          </span>
          <span className="flex-none text-[13px] font-semibold text-muted">{s.routeOpen ? "접기" : "펼치기"}</span>
        </button>
        {s.routeOpen && (
          <div className="flex flex-col gap-3.5 px-4 pb-4">
            <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px] text-muted">
              {[
                ["왼쪽", "짧게·짧게"],
                ["오른쪽", "길게·길게"],
                ["층 이동", "짧게 3번"],
                ["도착", "길게 1 + 짧게 2"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-1">
                  <dt className="font-semibold text-ink">{k}</dt>
                  <dd className="m-0">{v}</dd>
                </div>
              ))}
            </dl>
          {/* Hand-drawn sketch only when the live floor map isn't available (demo / mock). */}
          {!s.route && (
          <div className="flex flex-col gap-2.5 rounded-xl bg-app-bg px-3.5 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[14px] font-bold">{st.floor} 경로</div>
              <div role="tablist" aria-label="지도 보기" className="flex gap-0.5 rounded-[10px] bg-[#F0EEE8] p-[3px]">
                {(["2d", "3d"] as const).map((v) => (
                  <button
                    type="button"
                    role="tab"
                    key={v}
                    aria-selected={s.view === v}
                    onClick={() => actions.update({ view: v })}
                    className={`h-11 rounded-lg border-none text-[13px] font-bold text-ink ${v === "2d" ? "min-w-[52px]" : "min-w-16"} ${s.view === v ? "bg-surface" : "bg-transparent"}`}
                  >
                    {v === "2d" ? "2D" : "3D 보기"}
                  </button>
                ))}
              </div>
            </div>
            {s.view === "2d" ? (
              <>
                <svg viewBox="0 0 150 92" className="h-auto w-full" role="img" aria-label={`${st.floor} 경로 도식`}>
                  <g stroke="#EAE7DF" strokeWidth="10" strokeLinecap="round">
                    <line x1="15" y1="45" x2="135" y2="45" />
                    <line x1="75" y1="45" x2="75" y2="84" />
                    <line x1="15" y1="12" x2="15" y2="45" />
                    <line x1="135" y1="12" x2="135" y2="45" />
                  </g>
                  <polyline points={mini.route} fill="none" stroke={C.route} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="68" y="38" width="14" height="14" rx="3" fill={C.route} />
                  <circle cx="15" cy="12" r="6" fill={C.brand} opacity={mini.destOp} />
                  <circle
                    cx={mini.x}
                    cy={mini.y}
                    r="9"
                    fill={unstable ? "rgba(150,89,0,.12)" : "rgba(37,115,75,.15)"}
                    stroke={unstable ? C.warning : C.success}
                    strokeWidth="2"
                    strokeDasharray={unstable ? "3 2.5" : undefined}
                  />
                  <circle cx={mini.x} cy={mini.y} r="4" fill={unstable ? C.warning : C.success} />
                </svg>
                <div className="text-[12px] font-semibold" style={{ color: unstable ? C.warning : C.success }}>
                  {unstable ? "추정 위치 · 표지로 확인이 필요해요" : "마지막으로 확인한 위치 기준"}
                </div>
              </>
            ) : (
              <div className="relative h-40 overflow-hidden rounded-xl bg-[#FAF9F6] [perspective:600px]" role="img" aria-label={`층 도식, 현재 ${curFloor}층`}>
                {[5, 4, 3, 2, 1].map((f, i) => (
                  <div
                    key={f}
                    className="absolute left-1/2 -ml-[75px] flex h-14 w-[150px] items-center justify-center rounded-md border-[1.5px] text-[12px] font-extrabold"
                    style={{
                      top: 4 + i * 22,
                      transform: "rotateX(60deg) rotateZ(-28deg)",
                      background: f === curFloor ? "rgba(40,100,160,.9)" : f === 1 || f === 4 ? "rgba(40,100,160,.22)" : "rgba(32,36,33,.05)",
                      borderColor: f === curFloor ? C.route : C.border,
                      color: f === curFloor ? "#fff" : C.ink,
                    }}
                  >
                    {f}층
                  </div>
                ))}
                {demo && <div className="absolute right-2 bottom-2 left-2 font-mono text-[10px] font-semibold text-muted">그래프 기반 도식 3D 자리 · P1 · 실제 건물 스캔 아님</div>}
              </div>
            )}
          </div>
          )}
            <ol className="m-0 flex list-none flex-col p-0">
              {routeLabels.map((t, i) => (
                <li key={t} className="flex min-h-[34px] items-center gap-3" aria-current={i === prog ? "step" : undefined}>
                  <span
                    aria-hidden="true"
                    className="size-3 flex-none rounded-full border-2"
                    style={{ background: i < prog ? C.route : "#fff", borderColor: i <= prog ? C.route : "#CFCAC0" }}
                  />
                  <span className="text-[14px]" style={{ fontWeight: i === prog ? 800 : 500, color: i < prog ? C.muted : C.ink }}>
                    {t}
                    {i < prog && <span className="sr-only"> (완료)</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <GhostButton onClick={actions.replay}>안내 다시 듣기</GhostButton>
        <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
      </div>
    </div>
  );
}
