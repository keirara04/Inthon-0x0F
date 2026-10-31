"use client";

import { floorName } from "@/lib/gilgyeol/floorTransition";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { useBuildings } from "./BuildingPicker";
import { BackHeader, Badge, GhostButton, PrimaryButton, SecondaryButton, Title, useAlbumPick } from "./ui";

export function FloorMapScreen() {
  const { state, actions } = useGilgyeol();
  const target = state.floorMapTarget ?? "";
  // No target: the user rode to a floor of their choice ("다른 층으로 이동"); the photo tells us which.
  const ride = !target;
  const floor = floorName(target);
  const rows = useBuildings(state.place.name, null);
  // Same match as BuildingPicker: by id once known, else by name (the demo start never sets the id).
  const key = (n: string) => n.replace(/\s+/g, "").toLowerCase();
  const building = rows?.find((b) => (state.place.id !== null ? b.id === state.place.id : key(b.name) === key(state.place.name)));
  const savedFloors = building?.saved_floors ?? [];
  const saved = !!target && savedFloors.includes(target);
  const album = useAlbumPick((file) => {
    actions.openScan("map");
    actions.update({ pendingPhoto: file });
  });

  return (
    <div className="flex min-h-full flex-col gap-5 px-5 pt-4 pb-6">
      {ride && <BackHeader label="층 이동 여부" onBack={actions.back} />}
      <Badge tone="haptic">{ride ? "엘리베이터 홀 도착" : "층 이동 완료 · 안내 일시 정지"}</Badge>
      {ride ? (
        <>
          <Title>가려는 층에서 내린 뒤<br />안내도를 찍어주세요</Title>
          <p className="m-0 text-[17px] leading-[1.6] text-muted">엘리베이터를 타고 가려는 층에서 내리세요. 그 층의 비상시 대피 안내도를 찍으면 층을 확인하고 목적지 목록을 보여드려요.</p>
        </>
      ) : (
        <>
          <Title>{floor} 안내도를<br />다시 찍어주세요</Title>
          <p className="m-0 text-[17px] leading-[1.6] text-muted">새로운 층에 도착했어요. 엘리베이터 홀이나 복도 벽의 층별 안내도를 촬영해 이 층의 지도를 확인해 주세요.</p>
          <div className="rounded-[22px] bg-surface p-5">
            <p className="m-0 text-[15px] leading-[1.6]">{floor} 표시와 안내도 전체가 선명하게 보이도록 찍어주세요. 사진을 확인하면 {state.route?.arrived.label ?? state.dest?.name ?? "목적지"}까지 이어서 안내해요.</p>
          </div>
        </>
      )}
      <div className="flex-1" />
      {album.input}
      <PrimaryButton onClick={() => actions.openScan("map")}>{ride ? "내린 층 안내도 촬영" : "새 층 안내도 촬영"}</PrimaryButton>
      {saved && <SecondaryButton onClick={() => actions.loadSavedMap(target)}>저장된 {floor} 안내도 사용</SecondaryButton>}
      {ride &&
        savedFloors.map((f) => (
          <SecondaryButton key={f} onClick={() => building && actions.loadSavedMap(f, building.id)}>
            저장된 {floorName(f)} 안내도 사용
          </SecondaryButton>
        ))}
      <SecondaryButton onClick={album.open}>앨범에서 선택</SecondaryButton>
      <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
    </div>
  );
}
