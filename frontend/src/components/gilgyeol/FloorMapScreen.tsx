"use client";

import { floorName } from "@/lib/gilgyeol/floorTransition";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { SavedMapSelect } from "./SavedMapSelect";
import { ExampleShot } from "./CaptureIntroScreen";
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
  const availableFloors = ride ? savedFloors : savedFloors.filter((f) => f === target);
  const album = useAlbumPick((file) => {
    actions.openScan("map");
    actions.update({ pendingPhoto: file });
  });

  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      {ride && <BackHeader label="안내도 촬영" onBack={actions.back} />}
      <Badge tone="haptic">{ride ? "엘리베이터 홀 도착" : "층 이동 완료 · 안내 일시 정지"}</Badge>
      {ride ? (
        <>
          <Title className="text-[22px] leading-[1.32] tracking-[-0.035em]">가려는 층에서 내린 뒤<br />안내도를 찍어주세요</Title>
          <p className="m-0 text-[16px] leading-[1.55] text-muted">엘리베이터를 타고 가려는 층에서 내리세요. 그 층의 비상시 대피 안내도를 찍으면 층을 확인하고 목적지 목록을 보여드려요.</p>
        </>
      ) : (
        <>
          <Title className="text-[22px] leading-[1.32] tracking-[-0.035em]">{floor} 안내도를<br />다시 찍어주세요</Title>
          <p className="m-0 text-[16px] leading-[1.55] text-muted">새로운 층에 도착했어요. 엘리베이터 홀이나 복도 벽의 층별 안내도를 촬영해 이 층의 지도를 확인해 주세요.</p>
          <div className="rounded-[22px] bg-surface p-5">
            <p className="m-0 text-[15px] leading-[1.6]">{floor} 표시와 안내도 전체가 선명하게 보이도록 찍어주세요. 사진을 확인하면 {state.route?.arrived.label ?? state.dest?.name ?? "목적지"}까지 이어서 안내해요.</p>
          </div>
        </>
      )}
      {album.input}
      <PrimaryButton onClick={album.open}>앨범에서 선택</PrimaryButton>
      <SecondaryButton onClick={() => actions.openScan("map")}>카메라로 찍기</SecondaryButton>
      <SavedMapSelect floors={availableFloors} loading={rows === null} onSelect={async (f) => {
        if (building) await actions.loadSavedMap(f, building.id);
      }} />
      <section aria-label="현재 건물" className="flex flex-col gap-1 rounded-[18px] bg-surface p-4">
        <span className="text-[13px] font-semibold text-muted">지금 있는 건물</span>
        <span className="text-[16px] font-bold">{state.place.name}</span>
      </section>
      <ExampleShot />
      <p className="m-0 text-[14px] leading-normal text-muted">안내도 전체가 보이게 정면에서 찍어주세요. 주변 사람이 찍히지 않게 안내도만 가까이 비춰주세요.</p>
      <GhostButton onClick={actions.endGuide}>안내 종료</GhostButton>
    </div>
  );
}
