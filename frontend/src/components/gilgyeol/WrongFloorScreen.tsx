"use client";

import { floorName } from "@/lib/gilgyeol/floorTransition";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, GhostButton, PrimaryButton, SecondaryButton, Title, useAlbumPick } from "./ui";

export function WrongFloorScreen() {
  const { state, actions } = useGilgyeol();
  const expected = floorName(state.floorMapTarget ?? "");
  const detected = !state.mapDemo && state.parsed?.floorSource === "map" ? floorName(state.parsed.floor) : null;
  const album = useAlbumPick((file) => {
    actions.openScan("map");
    actions.update({ pendingPhoto: file });
  });

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      <BackHeader label="층별 안내도 확인" onBack={actions.back} />
      <div role="alert" className="flex flex-col gap-3">
        <div aria-hidden="true" className="flex size-12 items-center justify-center rounded-2xl bg-err-tint text-err-ink">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m14 3 12 21H2L14 3Z" />
            <path d="M14 10v6m0 4h.01" />
          </svg>
        </div>
        <Title>{detected ? "올바른 층의 안내도가 아니에요" : "안내도 사진이 필요해요"}</Title>
        <p className="m-0 text-[16px] leading-[1.55] text-muted">
          {detected
            ? `${detected} 안내도가 인식됐어요. 지금은 ${expected} 안내도가 필요해요.`
            : `지금 계신 ${expected}의 안내도 사진을 촬영하거나 선택해 주세요.`}
          {detected && ` ${expected} 표시와 안내도 전체가 선명하게 보이도록 다시 찍어주세요.`}
        </p>
        <dl className="m-0 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-surface p-4">
            <dt className="text-[13px] text-muted">필요한 층</dt>
            <dd className="m-0 mt-1 text-[22px] font-extrabold">{expected}</dd>
          </div>
          <div className="rounded-2xl bg-err-tint p-4">
            <dt className="text-[13px] text-err-ink">사진에서 읽은 층</dt>
            <dd className="m-0 mt-1 text-[22px] font-extrabold text-err-ink">{detected ?? "사진 없음"}</dd>
          </div>
        </dl>
      </div>
      {state.parsedPhoto && (
        <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- local upload object URL */}
          <img src={state.parsedPhoto.url} alt="방금 업로드한 안내도" className="h-[110px] w-full object-contain" />
        </div>
      )}
      <p className="m-0 text-[13px] leading-normal text-muted">목적지는 유지돼요. 올바른 층의 안내도를 확인하면 이어서 안내할게요.</p>
      <div className="flex-1" />
      {album.input}
      <PrimaryButton onClick={() => actions.openScan("map")}>다시 촬영</PrimaryButton>
      <SecondaryButton onClick={album.open}>다른 사진 선택</SecondaryButton>
      <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
    </div>
  );
}
