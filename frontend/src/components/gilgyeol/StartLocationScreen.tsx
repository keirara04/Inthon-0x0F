"use client";

import { C, START_NODES } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Placeholder, PrimaryButton, SecondaryButton, Title } from "./ui";

export function StartLocationScreen() {
  const { state: s, actions } = useGilgyeol();
  const startNode = START_NODES.find((n) => n.id === s.start);

  const summary = startNode ? `1층 ${startNode.label}${s.locEdit ? " · 선택 중" : " · 추정 위치"}` : "아직 위치를 고르지 않았어요";

  return (
    <div className="flex flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="시작 준비 · 3 / 3" onBack={actions.back} />
      <div className="flex flex-col gap-1.5">
        <Title className="leading-[1.25]">여기 계신가요?</Title>
        <p className="m-0 text-[15px] leading-normal text-muted">
          {s.locEdit ? "안내도에서 지금 있는 지점을 눌러주세요." : "안내도의 ‘현재 위치’ 표시를 기준으로 추정했어요. 다르면 위치를 수정해 주세요."}
        </p>
      </div>
      <div className="gg-hatch relative mx-auto h-[260px] w-[330px] max-w-full overflow-hidden rounded-[18px] border border-line">
        <svg width="330" height="260" viewBox="0 0 330 260" className="absolute inset-0" aria-hidden="true">
          <g stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round">
            <line x1="44" y1="112" x2="292" y2="112" />
            <line x1="167" y1="112" x2="167" y2="216" />
            <line x1="44" y1="62" x2="44" y2="194" />
          </g>
        </svg>
        <Placeholder label="1층 피난안내도 이미지 자리 · 데모 도식" />
        {START_NODES.map((n) => {
          const on = s.start === n.id;
          const tag = on ? (s.locEdit ? "현재 위치" : "현재 위치 · 추정") : n.label;
          return (
            <div key={n.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${n.label}${on ? " (선택됨)" : ""}`}
                onClick={() => (s.locEdit ? actions.update({ start: n.id, locEdit: false }) : actions.toast("‘위치 수정’을 누르면 다른 지점을 고를 수 있어요"))}
                className="absolute -mt-[22px] -ml-[22px] flex size-11 items-center justify-center rounded-full border-[3px] p-0 shadow-[0_2px_6px_rgba(0,0,0,.12)]"
                style={{ left: n.x, top: n.y, borderColor: on ? C.brand : C.ink, background: on ? C.brand : "#fff" }}
              >
                <span className="size-2.5 rounded-full" style={{ background: on ? "#fff" : C.ink }} />
              </button>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -translate-x-1/2 rounded-md px-[7px] py-[3px] text-[12px] font-bold whitespace-nowrap"
                style={{ left: n.x, top: n.y + (n.y > 200 ? -50 : 26), color: on ? "#fff" : C.ink, background: on ? C.brand : "rgba(255,255,255,.92)" }}
              >
                {tag}
              </div>
            </div>
          );
        })}
      </div>
      <div role="status" className={`text-[15px] font-semibold ${startNode ? (s.locEdit ? "text-brand" : "text-warning") : "text-muted"}`}>
        {summary}
      </div>
      <div className="flex flex-col gap-2">
        <SecondaryButton aria-pressed={s.locEdit} onClick={() => actions.update({ locEdit: !s.locEdit })}>
          {s.locEdit ? "수정 취소" : "위치 수정"}
        </SecondaryButton>
        <SecondaryButton aria-expanded={s.landmarks} onClick={() => actions.update({ landmarks: !s.landmarks })}>
          층·랜드마크 직접 선택
        </SecondaryButton>
        {s.landmarks && (
          <div className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {START_NODES.map((n) => (
              <button
                type="button"
                key={n.id}
                aria-pressed={s.start === n.id}
                onClick={() => actions.update({ start: n.id, locEdit: false, landmarks: false })}
                className="flex min-h-[52px] items-center justify-between border-0 border-b border-divider bg-surface px-4 text-left text-[16px] text-ink"
              >
                1층 {n.label}
                <span className="text-[13px] font-bold text-brand">{s.start === n.id ? "선택됨" : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <PrimaryButton disabled={!s.start} onClick={() => s.start && actions.go("search", { query: "", cat: null, floorPick: null })}>
        맞아요, 계속하기
      </PrimaryButton>
    </div>
  );
}
