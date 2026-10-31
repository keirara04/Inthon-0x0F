"use client";

import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, PrimaryButton, SecondaryButton, Title, useAlbumPick } from "./ui";

export function InvalidMapScreen() {
  const { state, actions } = useGilgyeol();
  const album = useAlbumPick((file) => {
    actions.openScan("map");
    actions.update({ pendingPhoto: file });
  });

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-7">
      <BackHeader label="안내도 확인" onBack={actions.back} />
      <div role="alert" className="flex flex-col gap-3">
        <div aria-hidden="true" className="flex size-12 items-center justify-center rounded-2xl bg-err-tint text-err-ink">
          <svg width="30" height="30" viewBox="0 0 30 30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="3" width="22" height="24" rx="3" />
            <path d="m10 10 10 10m0-10L10 20" />
          </svg>
        </div>
        <Title>평면도가 아닌 사진이에요</Title>
        <p className="m-0 text-[16px] leading-[1.55] text-muted">방과 복도 배치가 그려진 층별 안내도나 피난안내도를 올려주세요. 안내도 전체가 선명하게 보이도록 찍어주세요.</p>
      </div>
      {state.parsedPhoto && (
        <div className="overflow-hidden rounded-[18px] border border-line bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- local upload object URL */}
          <img src={state.parsedPhoto.url} alt="방금 업로드한 사진" className="h-[128px] w-full object-contain" />
          <div className="border-t border-divider px-3 py-2 text-[13px] text-muted">업로드한 사진</div>
        </div>
      )}
      <div className="flex-1" />
      {album.input}
      <div className="flex flex-col gap-2.5">
        <PrimaryButton onClick={album.open}>다른 사진 선택</PrimaryButton>
        <SecondaryButton onClick={() => actions.openScan("map")}>다시 촬영</SecondaryButton>
      </div>
    </div>
  );
}
