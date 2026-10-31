"use client";

import { DETECTION_RULE, FLOORS } from "@/lib/gilgyeol/data";
import { useDestName, useGilgyeol } from "@/lib/gilgyeol/store";
import { Badge, PrimaryButton, SecondaryButton, StatusDot } from "./ui";

export function OffRouteScreen() {
  const { state: s, actions } = useGilgyeol();
  const d = useDestName();
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1.5 pb-6">
      <div className="flex min-h-8 items-center justify-between">
        <div className="text-[15px] font-bold">우정정보관 · 4층</div>
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-warning">
          <StatusDot color="#965900" />
          구간 추정 중
        </div>
      </div>

      {s.offState === "alert" && (
        <>
          <div role="alert" className="flex flex-col gap-3.5 rounded-[22px] border-2 border-error bg-err-tint px-5 py-6">
            <svg width="44" height="40" viewBox="0 0 44 40" aria-hidden="true">
              <polygon points="22,3 42,37 2,37" fill="#B3261E" stroke="#B3261E" strokeWidth="3" strokeLinejoin="round" />
              <rect x="20" y="14" width="4" height="12" rx="2" fill="#fff" />
              <circle cx="22" cy="31" r="2.4" fill="#fff" />
            </svg>
            <h1 className="m-0 text-[28px] leading-[1.25] font-extrabold text-err-ink">경로와 다른 쪽인 것 같아요</h1>
            <div className="text-[17px] font-semibold text-ink">잠시 멈춰주세요.</div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="haptic">진동 · 아주 짧게 3회</Badge>
              <Badge tone="white">음성 · 멈춰서 주변 표지를 비춰주세요</Badge>
            </div>
          </div>
          <div className="flex flex-col gap-1.5 rounded-2xl bg-surface px-4 py-3.5">
            <div className="text-[13px] font-bold text-muted">이렇게 감지했어요</div>
            <p className="m-0 text-[15px] leading-normal text-ink">{DETECTION_RULE}</p>
            <p className="m-0 text-[12px] font-semibold text-warn-ink">시연에서는 ‘반대 복도로 이동해 보기’ 데모 입력으로 재현했어요</p>
          </div>
          <div className="flex-1" />
          <PrimaryButton onClick={() => actions.openScan("sign")}>주변 표지 확인</PrimaryButton>
          <SecondaryButton onClick={() => actions.update({ offState: "floor" })}>현재 층·랜드마크 직접 선택</SecondaryButton>
        </>
      )}

      {s.offState === "floor" && (
        <>
          <h1 className="m-0 text-[24px] font-extrabold">지금 몇 층에 있나요?</h1>
          <div className="grid grid-cols-5 gap-2">
            {FLOORS.map((f) => (
              <button
                type="button"
                key={f}
                onClick={() => actions.update({ offState: "confirm", offFloor: `${f}층`, offSign: "직접 선택" })}
                className="h-14 rounded-[14px] border-[1.5px] border-edge bg-surface text-[17px] font-extrabold text-ink"
              >
                {f}층
              </button>
            ))}
          </div>
          <div className="pt-1.5 text-[13px] font-bold text-muted">가까운 랜드마크</div>
          <div className="flex flex-col overflow-hidden rounded-2xl bg-surface">
            {["4층 엘리베이터 홀", "계단 A", "401–404호 방향 표지"].map((l) => (
              <button
                type="button"
                key={l}
                onClick={() => actions.update({ offState: "confirm", offFloor: "4층", offSign: `${l} · 직접 선택` })}
                className="min-h-[52px] border-0 border-b border-divider bg-surface px-4 text-left text-[16px] font-semibold text-ink"
              >
                {l}
              </button>
            ))}
          </div>
          <SecondaryButton onClick={() => actions.update({ offState: "alert" })}>돌아가기</SecondaryButton>
        </>
      )}

      {s.offState === "confirm" && (
        <>
          <h1 role="status" className="m-0 text-[26px] leading-[1.3] font-extrabold">
            현재 위치를 다시 확인했어요
          </h1>
          <dl className="m-0 flex flex-col rounded-[18px] bg-surface px-[18px] py-1">
            {[
              ["목적지", `${d} · 4층`],
              ["현재 층", s.offFloor],
              ["확인한 표지", s.offSign],
            ].map(([k, v], i) => (
              <div key={k} className={`flex justify-between gap-3 py-3.5 text-[16px] ${i < 2 ? "border-b border-divider" : ""}`}>
                <dt className="flex-none text-muted">{k}</dt>
                <dd className="m-0 text-right font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="m-0 text-[15px] leading-normal text-muted">
            {s.offFloor === "4층" ? `4층 서측 복도에서 ${d}까지 경로를 다시 계산했어요.` : `목적지는 4층이에요. ${s.offFloor}에서 엘리베이터로 4층에 가는 경로로 안내할게요.`}
          </p>
          <div className="flex-1" />
          <PrimaryButton onClick={() => (s.offFloor === "4층" ? actions.startGuide(s.step) : actions.toElevator())}>새 경로로 안내 시작</PrimaryButton>
        </>
      )}
    </div>
  );
}
