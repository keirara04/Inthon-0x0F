"use client";

import { floorName } from "@/lib/gilgyeol/floorTransition";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { Badge, GhostButton, PrimaryButton, SecondaryButton, Title, useAlbumPick } from "./ui";

export function FloorMapScreen() {
  const { state, actions } = useGilgyeol();
  const floor = floorName(state.floorMapTarget ?? "");
  const album = useAlbumPick((file) => {
    actions.openScan("map");
    actions.update({ pendingPhoto: file });
  });

  return (
    <div className="flex min-h-full flex-col gap-5 px-5 pt-4 pb-6">
      <Badge tone="haptic">층 이동 완료 · 안내 일시 정지</Badge>
      <Title>{floor} 안내도를<br />다시 찍어주세요</Title>
      <p className="m-0 text-[17px] leading-[1.6] text-muted">새로운 층에 도착했어요. 엘리베이터 홀이나 복도 벽의 층별 안내도를 촬영해 이 층의 지도를 확인해 주세요.</p>
      <div className="rounded-[22px] bg-surface p-5">
        <p className="m-0 text-[15px] leading-[1.6]">{floor} 표시와 안내도 전체가 선명하게 보이도록 찍어주세요. 사진을 확인하면 {state.route?.arrived.label ?? state.dest?.name ?? "목적지"}까지 이어서 안내해요.</p>
      </div>
      <div className="flex-1" />
      {album.input}
      <PrimaryButton onClick={() => actions.openScan("map")}>새 층 안내도 촬영</PrimaryButton>
      <SecondaryButton onClick={album.open}>앨범에서 선택</SecondaryButton>
      <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
    </div>
  );
}
