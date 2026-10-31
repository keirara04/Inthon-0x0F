"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Placeholder, PrimaryButton, SecondaryButton, Title } from "./ui";

const ROWS = [
  ["무엇을 찍나요", "엘리베이터 홀이나 복도 벽의 층별 안내도"],
  ["카메라 권한이 필요한 이유", "안내도와 층·호실 표지를 읽을 때만 사용해요"],
  ["개인정보", "주변 사람이 찍히지 않게 안내도만 가까이 비춰주세요"],
];

export function CaptureIntroScreen() {
  const { actions } = useGilgyeol();
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      <BackHeader label="시작 준비 · 2 / 3" onBack={actions.back} />
      <Title>
        층별 안내도를
        <br />
        비춰주세요
      </Title>
      <p className="m-0 text-[16px] leading-[1.55] text-muted">층별 안내도에서 현재 위치를 확인해 길을 안내해요.</p>
      <div className="gg-hatch relative h-[150px] rounded-[18px] border border-line">
        <Placeholder label="복도 벽면 층별 안내도 예시 사진 자리" />
      </div>
      <div className="flex flex-col rounded-[18px] bg-surface px-[18px] py-1">
        {ROWS.map(([t, d], i) => (
          <div key={t} className={`flex flex-col gap-[3px] py-3.5 ${i < ROWS.length - 1 ? "border-b border-divider" : ""}`}>
            <div className="text-[15px] font-bold">{t}</div>
            <div className="text-[14px] leading-normal text-muted">{d}</div>
          </div>
        ))}
      </div>
      <PrimaryButton onClick={() => actions.openScan("map")}>카메라 켜기</PrimaryButton>
      <SecondaryButton dashed onClick={() => actions.go("mapResult", { mapDemo: true })}>
        데모 안내도 불러오기
      </SecondaryButton>
    </div>
  );
}
