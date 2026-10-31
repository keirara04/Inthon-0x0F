"use client";

import { useEffect, useState } from "react";
import { C, EXAMPLE_4F_GRAPH, EXAMPLE_PHOTO } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { MapSketch, graphFrame } from "./MapSketch";
import { BackHeader, PrimaryButton, SecondaryButton, Title, useAlbumPick } from "./ui";

const EXAMPLE_FRAME = graphFrame(EXAMPLE_4F_GRAPH, EXAMPLE_PHOTO);

const CORNERS = [
  "top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-lg",
  "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-lg",
  "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-lg",
  "right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-lg",
];

/**
 * The real 4F sign from 우정정보관 as the "what to photograph" example, on a loop:
 * camera corners close in, one scan sweep, then the map the AI reads from it fades in.
 */
function ExampleShot() {
  const [phase, setPhase] = useState<"frame" | "scan" | "map">("frame");
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const ts = [
      setTimeout(() => setPhase("scan"), 1300),
      setTimeout(() => setPhase("map"), 2700),
      setTimeout(() => {
        setPhase("frame");
        setCycle((c) => c + 1);
      }, 7500),
    ];
    return () => ts.forEach(clearTimeout);
  }, [cycle]);

  const locked = phase !== "frame";
  return (
    <div
      role="img"
      aria-label="예시: 우정정보관 4층 비상시 대피 안내도. 이런 안내도 전체가 화면에 들어오게 찍으면 AI가 복도와 호실을 지도로 읽어요"
      className="overflow-hidden rounded-[18px] border border-line bg-surface"
    >
      <div className="relative bg-[#FAF9F6]" style={{ aspectRatio: `${EXAMPLE_PHOTO.w} / ${EXAMPLE_PHOTO.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- small static example, no optimizer needed */}
      <img src={EXAMPLE_PHOTO.url} alt="" className="absolute inset-0 size-full object-cover transition-opacity duration-500" style={{ opacity: phase === "map" ? 0 : 1 }} />
      {phase === "map" && (
        <div className="gg-fade-in absolute inset-0">
          <MapSketch key={cycle} g={EXAMPLE_4F_GRAPH} frame={EXAMPLE_FRAME} photo={EXAMPLE_PHOTO} />
        </div>
      )}
      {phase !== "map" && (
        <div key={cycle} aria-hidden="true" className="gg-frame-in absolute inset-[7%]">
          {CORNERS.map((c) => (
            <div key={c} className={`absolute size-6 transition-colors duration-300 ${c}`} style={{ borderColor: locked ? "#4CC38A" : "#fff" }} />
          ))}
        </div>
      )}
      {phase === "scan" && (
        <div aria-hidden="true" className="gg-sweep pointer-events-none absolute inset-x-0 h-1/4 bg-gradient-to-b from-transparent to-[rgba(120,180,255,.35)]">
          <div className="absolute inset-x-0 bottom-0 h-[2px] bg-[#9CCBFF] shadow-[0_0_12px_2px_rgba(120,180,255,.8)]" />
        </div>
      )}
      </div>
      {/* Caption below the picture, so it never covers the map's chips. */}
      <div className="flex items-center gap-2 border-t border-divider px-3 py-2 text-[12px] font-semibold text-muted">
        <span aria-hidden="true" className={`size-2 flex-none rounded-full transition-colors duration-300 ${phase === "map" ? "bg-route" : locked ? "bg-success" : "bg-edge"}`} />
        {phase === "map" ? "AI가 이렇게 읽어요" : phase === "scan" ? "안내도를 읽는 중" : "예시 · 우정정보관 4층 안내도"}
      </div>
    </div>
  );
}

/** Tiny line icons for the shooting tips. */
const TIP_ICONS = {
  frame: <path d="M3 7V4h3M15 4h3v3M18 14v3h-3M6 17H3v-3" />,
  front: <path d="M10.5 3v14M6 13l4.5 4 4.5-4" />,
  glare: <path d="M10.5 3v2M10.5 15v2M3.5 10h2M15.5 10h2M5.5 5l1.4 1.4M14.1 13.6l1.4 1.4M15.5 5l-1.4 1.4M6.9 13.6 5.5 15M10.5 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" />,
};
const TIPS: [keyof typeof TIP_ICONS, string][] = [
  ["frame", "전체가 보이게"],
  ["front", "정면에서"],
  ["glare", "빛 반사 피하기"],
];

export function CaptureIntroScreen() {
  const { actions } = useGilgyeol();
  const album = useAlbumPick((file) => actions.readMapPhoto(file));
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      <BackHeader label="시작 준비 · 2 / 3" onBack={actions.back} />
      <Title>
        층별 안내도를
        <br />
        비춰주세요
      </Title>
      <p className="m-0 text-[16px] leading-[1.55] text-muted">엘리베이터 홀이나 복도 벽의 층별 안내도를 찍으면, AI가 복도와 호실을 읽어 지도로 만들어요.</p>
      <ExampleShot />
      <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0" aria-label="촬영 팁">
        {TIPS.map(([icon, label]) => (
          <li key={icon} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface px-1 py-3 text-center text-[13px] font-semibold text-ink">
            <svg width="21" height="20" viewBox="0 0 21 20" fill="none" stroke={C.route} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {TIP_ICONS[icon]}
            </svg>
            {label}
          </li>
        ))}
      </ul>
      <p className="m-0 text-[13px] leading-normal text-muted">카메라는 안내도와 표지를 읽을 때만 쓰고, 사진은 저장하지 않아요. 주변 사람이 찍히지 않게 안내도만 가까이 비춰주세요.</p>
      <div className="flex-1" />
      {album.input}
      <PrimaryButton onClick={() => actions.openScan("map")}>카메라 켜기</PrimaryButton>
      <SecondaryButton data-trial="capture-album" onClick={album.open}>앨범에서 선택</SecondaryButton>
      <SecondaryButton dashed onClick={() => actions.go("mapResult", { mapDemo: true })}>
        데모 안내도 불러오기
      </SecondaryButton>
    </div>
  );
}
