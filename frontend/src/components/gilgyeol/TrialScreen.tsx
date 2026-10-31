"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";
import { PrimaryButton, SecondaryButton } from "./ui";

/**
 * Entry page for the guided 3-minute trial. `길찾기 시작` lands on the real capture screen; from
 * there the trial simply follows 하은's journey through the real app screens.
 */

const STEPS = [
  { title: "체험 시작", sub: "하은의 405호 여정을 실제 앱 화면으로 따라가요." },
  { title: "현재 층 안내도 선택", sub: "하은이 앨범에 저장해 둔 안내도 사진을 골라요." },
  { title: "안내도 확인", sub: "AI가 사진 속 복도와 호실을 읽은 지도를 확인해요." },
  { title: "출발 위치 확인", sub: "지금 서 있는 곳이 맞는지 확인해요." },
  { title: "층 이동 여부 선택", sub: "405호가 있는 층으로 가야 하는지 골라요." },
  { title: "엘리베이터까지 경로", sub: "현재 층에서 엘리베이터까지의 경로를 확인해요." },
  { title: "안내 방식 선택", sub: "진동·음성 안내를 골라 이동을 준비해요." },
  { title: "엘리베이터 이동", sub: "안내를 따라 엘리베이터로 층을 이동해요." },
  { title: "새 층 안내도 선택", sub: "도착한 층의 안내도를 앨범에서 골라요." },
  { title: "목적지 선택", sub: "새 안내도에서 405호를 골라요." },
  { title: "405호까지 안내", sub: "남은 경로를 따라 이동해요." },
  { title: "405호 도착", sub: "도착 화면에서 3분 체험이 끝나요." },
];

export function TrialScreen() {
  const { actions } = useGilgyeol();

  return (
    <div className="flex min-h-full flex-col gap-[18px] px-5 pt-2 pb-7">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg bg-haptic-tint px-2.5 py-1.5 text-[13px] font-bold whitespace-nowrap text-haptic-ink">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-haptic" />
          3분 체험 · 샘플 경로
        </div>
        <button
          type="button"
          onClick={() => actions.endTrial(true)}
          className="h-11 flex-none rounded-[14px] border-[1.5px] border-edge bg-surface px-3.5 text-[14px] font-bold text-ink"
        >
          나가기
        </button>
      </div>

      <div className="flex flex-col gap-[18px]">
        <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5">
          <div className="flex size-11 flex-none items-center justify-center rounded-full bg-warm-panel text-[17px] font-extrabold text-ink">하은</div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="text-[15px] font-bold">김하은 · 21세 대학생</div>
            <div className="text-[13px] leading-[1.4] text-muted">우정정보관 첫 방문 · 4층 405호 외부 특강 · 체험용 가상 인물</div>
          </div>
        </div>

        <h1 className="m-0 text-[30px] leading-[1.28] font-extrabold tracking-[-0.03em] text-pretty">
          하은이 405호를
          <br />
          찾도록 도와주세요
        </h1>
        <p className="m-0 text-[16px] leading-[1.6] text-pretty text-muted">
          처음 온 우정정보관에서 저장해 둔 안내도 사진부터 405호 도착까지, 실제 안내 화면을 그대로 따라가요. 체험 순서에 따라 화면에서 직접 버튼을 눌러 주세요.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {["약 3분", "12단계", "로그인 없음"].map((t) => (
            <span key={t} className="rounded-lg bg-surface px-2.5 py-[5px] text-[13px] font-bold text-ink">
              {t}
            </span>
          ))}
        </div>
        <PrimaryButton onClick={actions.startTrial}>길찾기 시작</PrimaryButton>
        <SecondaryButton onClick={() => actions.go("welcome")}>체험 없이 사용하기</SecondaryButton>
      </div>

      <section aria-labelledby="gg-trial-steps" className="flex flex-col gap-2">
        <h2 id="gg-trial-steps" className="m-0 pt-1 text-[13px] font-bold text-muted">
          체험 순서
        </h2>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {STEPS.map((st, i) => (
            <li key={st.title} className="flex items-start gap-3 rounded-2xl bg-surface px-4 py-3.5">
              <div className="flex size-[26px] flex-none items-center justify-center rounded-full bg-ink text-[12px] font-extrabold text-white">{i + 1}</div>
              <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                <div className="text-[15px] leading-[1.35] font-bold">{st.title}</div>
                <div className="text-[13px] leading-[1.45] text-muted">{st.sub}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="m-0 text-[13px] leading-[1.5] text-muted">
        휴대폰의 사진 선택 창에서 안내도 사진을 골라요. 고른 사진은 저장하지 않아요.
      </p>
    </div>
  );
}
