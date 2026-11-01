"use client";

import { useState } from "react";
import { floorName } from "@/lib/gilgyeol/floorTransition";

export function SavedMapSelect({ floors, loading, onSelect }: { floors: string[]; loading: boolean; onSelect: (floor: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const empty = !loading && floors.length === 0;
  return (
    <div className="relative">
      <select
        aria-label="저장된 안내도 선택"
        value=""
        disabled={loading || busy || empty}
        onChange={async (event) => {
          const floor = event.target.value;
          if (!floor || busy) return;
          setBusy(true);
          try { await onSelect(floor); } finally { setBusy(false); }
        }}
        className="h-[52px] w-full appearance-none rounded-2xl border-[1.5px] border-edge bg-surface pr-12 pl-4 text-[16px] font-semibold text-ink disabled:text-muted"
      >
        <option value="" disabled>{busy ? "안내도 불러오는 중…" : loading ? "저장된 안내도 확인 중…" : empty ? "저장된 안내도 없음" : "저장된 안내도 사용"}</option>
        {floors.map((floor) => <option key={floor} value={floor}>{floorName(floor)} 안내도</option>)}
      </select>
      <svg className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
