"use client";

import { C } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import { BackHeader, Badge, Placeholder, PrimaryButton, SecondaryButton, StatusDot, Title } from "./ui";

export function MapResultScreen() {
  const { state, actions } = useGilgyeol();
  const rows: { k: string; v: string; ok: boolean }[] = [
    { k: "건물", v: "우정정보관", ok: true },
    { k: "층", v: "1층", ok: true },
    { k: "현재 위치 후보", v: "로비 · 안내도 현위치 표시", ok: false },
  ];
  return (
    <div className="flex min-h-full flex-col gap-4 px-5 pt-1 pb-6">
      <BackHeader label="안내도 인식 결과" onBack={actions.back} />
      <Title>안내도를 읽었어요</Title>
      <Badge tone="warn">{state.mapDemo ? "데모 안내도 · 샘플 자료" : "데모 인식 결과 · 실제 OCR 미연결"}</Badge>
      <div className="gg-hatch relative h-[150px] overflow-hidden rounded-[18px] border border-line">
        <svg viewBox="0 0 330 150" className="absolute inset-0 size-full" role="img" aria-label="추출한 1층 복도 도식. 현위치 후보와 엘리베이터 표시">
          <g stroke="#fff" strokeWidth="12" strokeLinecap="round">
            <line x1="40" y1="70" x2="290" y2="70" />
            <line x1="165" y1="70" x2="165" y2="130" />
            <line x1="40" y1="30" x2="40" y2="110" />
          </g>
          <circle cx="40" cy="110" r="11" fill="none" stroke={C.warning} strokeWidth="2.5" strokeDasharray="4 3" />
          <circle cx="40" cy="110" r="5" fill={C.warning} />
          <rect x="157" y="62" width="16" height="16" rx="3" fill={C.route} />
        </svg>
        <Placeholder label="촬영 이미지 자리 · 추출 도식" />
      </div>
      <div className="flex flex-col rounded-[18px] bg-surface px-[18px] py-1">
        {rows.map((r, i) => (
          <div key={r.k} className={`flex items-center justify-between gap-2.5 py-3.5 ${i < rows.length - 1 ? "border-b border-divider" : ""}`}>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-muted">{r.k}</span>
              <span className="text-[16px] font-bold">{r.v}</span>
            </div>
            <span className={`flex flex-none items-center gap-[5px] text-[13px] font-bold ${r.ok ? "text-success" : "text-warning"}`}>
              <StatusDot color={r.ok ? C.success : C.warning} dashed={!r.ok} />
              {r.ok ? "확인됨" : "추정 · 확인 필요"}
            </span>
          </div>
        ))}
      </div>
      <p className="m-0 text-[14px] leading-normal text-muted">현재 위치는 다음 화면에서 직접 확인해 주세요.</p>
      <div className="flex-1" />
      <PrimaryButton onClick={() => actions.go("start", { start: "here", locEdit: false, landmarks: false })}>이 안내도가 맞아요</PrimaryButton>
      <SecondaryButton onClick={() => actions.openScan("map")}>다시 촬영</SecondaryButton>
    </div>
  );
}
