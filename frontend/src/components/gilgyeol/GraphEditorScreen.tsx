"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { API_MODE, parseEvacMap, saveFloorGraph } from "@/lib/gilgyeol/api";
import { BUILDING, C, EDITOR_H, EDITOR_W, FLOOR_STATUS, NODE_TYPES, SAMPLE_AI_GRAPH, parseServedFloors } from "@/lib/gilgyeol/data";
import { useGilgyeol } from "@/lib/gilgyeol/store";
import type { GraphEdge, GraphError, GraphNode, NodeType } from "@/lib/gilgyeol/types";
import { BackHeader, Badge } from "./ui";


type Phase = "empty" | "ready" | "loading" | "draft";

interface Snapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function validateGraph(nodes: GraphNode[], edges: GraphEdge[], floor: number): GraphError[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out: GraphError[] = [];
  edges.forEach((e) => {
    if (!ids.has(e.a) || !ids.has(e.b)) out.push({ nodeId: ids.has(e.a) ? e.a : e.b, text: "존재하지 않는 노드에 연결된 간선이 있어요" });
    else if (e.a === e.b) out.push({ nodeId: e.a, text: "자기 자신과 연결된 간선이 있어요" });
  });
  nodes.forEach((n) => {
    const deg = edges.filter((e) => e.a === n.id || e.b === n.id).length;
    if (!deg) out.push({ nodeId: n.id, text: `${n.label} · 연결된 간선이 없어요` });
    if (n.type === "elevator_hall") {
      const floors = parseServedFloors(n.servedFloors);
      if (!floors.length) out.push({ nodeId: n.id, text: `${n.label} · served_floors가 입력되지 않았어요` });
      else if (floors.some((f) => f === null)) out.push({ nodeId: n.id, text: `${n.label} · served_floors는 4F·B1 형식으로 입력해 주세요` });
      else if (!floors.includes(`${floor}F`)) out.push({ nodeId: n.id, text: `${n.label} · 현재 층(${floor}F)이 정차 층에 없어요` });
    }
    if (n.type === "room" && !/^\d{3}호$/.test(n.label)) out.push({ nodeId: n.id, text: `${n.label} · 호실 번호 형식을 확인해 주세요 (예: 405호)` });
  });
  return out;
}

export function GraphEditorScreen() {
  const { actions } = useGilgyeol();
  const [phase, setPhase] = useState<Phase>("empty");
  const [img, setImg] = useState<{ url: string; file: File } | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hist, setHist] = useState<Snapshot[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [conn, setConn] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.55);
  const [zoom, setZoom] = useState(1);
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState<"draft" | "verified" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [floor, setFloor] = useState(4);
  const stopsRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; moved: boolean; sx: number; sy: number } | null>(null);
  const nextId = useRef(1);

  // Uploaded images live only in memory as object URLs; release them when replaced or unmounted.
  useEffect(
    () => () => {
      if (img) URL.revokeObjectURL(img.url);
    },
    [img],
  );

  const errors = phase === "draft" ? validateGraph(nodes, edges, floor) : [];
  const errIds = new Set(errors.map((e) => e.nodeId));
  const selN = nodes.find((n) => n.id === sel);

  const commit = (next: Partial<Snapshot>) => {
    setHist((h) => [...h.slice(-30), { nodes, edges }]);
    if (next.nodes) setNodes(next.nodes);
    if (next.edges) setEdges(next.edges);
    setTouched(true);
    setSaved(null);
  };

  const updateSel = (patch: Partial<GraphNode>) => {
    if (!sel) return;
    commit({ nodes: nodes.map((n) => (n.id === sel ? { ...n, ...patch, src: "human" } : n)) });
  };

  const reset = () => {
    setPhase("empty");
    setImg(null);
    setNodes([]);
    setEdges([]);
    setHist([]);
    setSel(null);
    setConn(null);
    setTouched(false);
    setSaved(null);
    setZoom(1);
    setParseError(null);
  };

  const generate = async () => {
    setPhase("loading");
    setParseError(null);
    try {
      const g = await parseEvacMap(img?.file ?? null, BUILDING, floor);
      setNodes(g.nodes);
      setEdges(g.edges);
      setHist([]);
      setSel(null);
      setConn(null);
      setTouched(false);
      setSaved(null);
      setPhase("draft");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "초안을 만들지 못했어요");
      setPhase("ready");
    }
  };

  const save = async (status: "draft" | "verified") => {
    setSaving(true);
    setSaveError(null);
    try {
      // Draft saves never overwrite a verified floor (the API answers 409); verified saves are confirmed below.
      await saveFloorGraph({ building: BUILDING, floor, graph: { nodes, edges }, status, replace: status === "verified" });
      setSaved(status);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setSaving(false);
    }
  };

  const tapNode = (id: string) => {
    if (conn && conn !== id) {
      if (edges.some((x) => (x.a === conn && x.b === id) || (x.a === id && x.b === conn))) {
        setConn(null);
        setSel(id);
        actions.toast("이미 연결된 노드예요");
        return;
      }
      commit({ edges: [...edges, { a: conn, b: id, src: "human" }] });
      setConn(null);
      setSel(id);
      actions.toast("간선을 연결했어요");
      return;
    }
    setSel(id);
    setConn(null);
  };

  const onNodeDown = (e: ReactPointerEvent, id: string) => {
    e.preventDefault();
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    drag.current = { id, moved: false, sx: e.clientX, sy: e.clientY };
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.round(Math.max(12, Math.min(EDITOR_W - 12, ((e.clientX - r.left) / r.width) * EDITOR_W)));
    const y = Math.round(Math.max(12, Math.min(EDITOR_H - 12, ((e.clientY - r.top) / r.height) * EDITOR_H)));
    if (!d.moved) setHist((h) => [...h.slice(-30), { nodes, edges }]);
    d.moved = true;
    setNodes((ns) => ns.map((n) => (n.id === d.id ? { ...n, x, y, src: "human" } : n)));
    setTouched(true);
    setSaved(null);
    setSel(d.id);
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) tapNode(d.id);
  };

  const addNode = (type: NodeType) => {
    const id = `N${nextId.current++}`;
    commit({ nodes: [...nodes, { id, type, label: NODE_TYPES[type].def, x: EDITOR_W / 2, y: 196, ocr: "", servedFloors: "", src: "human" }] });
    setSel(id);
    setConn(null);
  };

  const deleteNode = () => {
    if (!selN) return;
    commit({ nodes: nodes.filter((n) => n.id !== selN.id), edges: edges.filter((x) => x.a !== selN.id && x.b !== selN.id) });
    setSel(null);
    setConn(null);
  };

  const undo = () => {
    const h = hist[hist.length - 1];
    if (!h) return;
    setNodes(h.nodes);
    setEdges(h.edges);
    setHist(hist.slice(0, -1));
    setSaved(null);
    setTouched(true);
  };

  const switchFloor = (f: number, status: "verified" | "draft" | "none") => {
    if (f === floor) return;
    if (touched && !saved) {
      actions.toast(`${floor}층 수정 사항을 먼저 저장해 주세요`);
      return;
    }
    if (status === "verified") {
      actions.toast(`${f}층은 검수 완료된 데이터예요. 시연에서는 요약만 볼 수 있어요`);
      return;
    }
    reset();
    setFloor(f);
    if (status === "draft") {
      // Demo: reopen the floor's saved AI draft for review.
      const g = structuredClone(SAMPLE_AI_GRAPH);
      setNodes(g.nodes);
      setEdges(g.edges);
      setPhase("draft");
      setSaved("draft");
    }
  };

  const editElevatorStops = () => {
    const el = nodes.find((n) => n.type === "elevator_hall");
    if (!el) {
      actions.toast("엘리베이터 노드가 없어요. 노드 추가에서 elevator_hall을 추가해 주세요");
      return;
    }
    setSel(el.id);
    setConn(null);
    requestAnimationFrame(() => {
      stopsRef.current?.focus();
      stopsRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const sessionStatus: "verified" | "draft" | "none" = saved === "verified" ? "verified" : phase === "draft" ? "draft" : "none";
  const floorRows = [...FLOOR_STATUS, { floor: 4, status: "none" as const, summary: "평면도 없음" }]
    .map((r) =>
      r.floor === floor
        ? { ...r, status: sessionStatus, summary: phase === "draft" ? `노드 ${nodes.length} · 간선 ${edges.length}${touched && !saved ? " · 저장 안 됨" : ""}` : "편집 중 · 안내도 업로드 전" }
        : r,
    )
    .sort((a, b) => a.floor - b.floor);
  const statusBadge = {
    verified: { label: "검수 완료", tone: "ok" as const },
    draft: { label: "초안", tone: "warn" as const },
    none: { label: "데이터 없음", tone: "neutral" as const },
  };

  const phaseBadge =
    saved === "verified"
      ? { label: "verified · 검수 완료", tone: "ok" as const }
      : saved === "draft"
        ? { label: "draft 저장됨", tone: "neutral" as const }
        : !touched
          ? { label: "AI 초안", tone: "haptic" as const }
          : { label: "수정 중", tone: "warn" as const };

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const toolBtn = "h-11 rounded-xl border-[1.5px] border-edge bg-surface text-[14px] font-semibold text-ink disabled:text-[#A8A49A]";
  const field = "h-11 rounded-[10px] border-[1.5px] border-edge bg-surface px-2.5 text-[15px] font-normal text-ink";
  const labelCls = "flex flex-col gap-[5px] text-[12px] font-bold text-muted";

  return (
    <div className="flex flex-col gap-3.5 px-4 pt-1 pb-7">
      <div className="flex items-center gap-1">
        <BackHeader
          label={
            <span className="flex flex-col gap-px">
              <span className="text-[17px] font-extrabold text-ink">지도 만들기</span>
              <span className="text-[12px] font-semibold text-muted">관리자 · 우정정보관 · {floor}층 · 좌표 0–1 비율</span>
            </span>
          }
          onBack={actions.back}
        />
      </div>

      <section aria-label="층별 지도 데이터" className="flex flex-col overflow-hidden rounded-2xl bg-surface">
        {floorRows.map((r) => {
          const cur = r.floor === floor;
          const b = statusBadge[r.status];
          return (
            <button
              type="button"
              key={r.floor}
              aria-current={cur ? "true" : undefined}
              onClick={() => switchFloor(r.floor, r.status)}
              className={`flex min-h-14 items-center justify-between gap-3 border-0 border-b border-divider px-4 py-2 text-left last:border-b-0 ${cur ? "bg-[#F7EEF1]" : "bg-surface"}`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="text-[16px] font-bold text-ink">
                  {r.floor}F{cur && <span className="ml-1.5 text-[12px] font-bold text-brand">편집 중</span>}
                </span>
                <span className="text-[12px] text-muted">{r.summary}</span>
              </span>
              {r.status === "none" && !cur ? (
                <span className="flex h-9 items-center rounded-[10px] border-[1.5px] border-brand px-3 text-[13px] font-bold text-brand">업로드</span>
              ) : (
                <Badge tone={b.tone}>{b.label}</Badge>
              )}
            </button>
          );
        })}
      </section>

      {phase === "draft" && (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={phaseBadge.tone}>{phaseBadge.label}</Badge>
          <Badge tone={errors.length ? "err" : "ok"}>{errors.length ? `검증 오류 ${errors.length}개` : "검증 통과"}</Badge>
        </div>
      )}

      {phase === "empty" && (
        <div className="flex flex-col gap-3 rounded-[18px] bg-surface p-[18px]">
          <div className="text-[13px] font-bold text-muted">1 · 건물·층</div>
          <div className="flex gap-2">
            <div className="flex h-12 flex-1 items-center rounded-xl bg-app-bg px-3.5 text-[15px] font-semibold">우정정보관</div>
            <div className="flex h-12 w-[84px] items-center justify-center rounded-xl bg-app-bg text-[15px] font-bold">{floor}층</div>
          </div>
          <div className="pt-1.5 text-[13px] font-bold text-muted">2 · 피난안내도 이미지</div>
          <label className="flex h-[52px] cursor-pointer items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-surface text-[15px] font-bold focus-within:outline-3 focus-within:outline-route">
            이미지 업로드 · 촬영
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setImg({ url: URL.createObjectURL(f), file: f });
                setPhase("ready");
              }}
            />
          </label>
          <button type="button" onClick={() => setPhase("ready")} className="h-[52px] rounded-[14px] border-[1.5px] border-dashed border-[#BDB8AC] bg-surface text-[15px] font-semibold text-ink">
            데모 샘플 선택
          </button>
        </div>
      )}

      {phase !== "empty" && (
        <div className="max-h-[300px] overflow-auto rounded-2xl border border-line bg-surface">
          <div style={{ width: `${Math.round(zoom * 100)}%` }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${EDITOR_W} ${EDITOR_H}`}
              className="block h-auto w-full touch-none bg-[#FAF9F6]"
              role="application"
              aria-label="안내도 그래프 편집 캔버스. 노드를 탭해 선택하고 끌어서 이동해요"
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => (drag.current = null)}
            >
              <defs>
                <pattern id="ggst" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#EFEDE6" />
                  <rect width="3" height="8" fill="#E4E1D7" />
                </pattern>
              </defs>
              {img ? (
                <image href={img.url} x="0" y="0" width={EDITOR_W} height={EDITOR_H} preserveAspectRatio="xMidYMid meet" opacity={opacity} />
              ) : (
                <g opacity={Math.max(0.15, opacity)}>
                  <rect width={EDITOR_W} height={EDITOR_H} fill="url(#ggst)" />
                  <text x={EDITOR_W / 2} y="222" textAnchor="middle" fontSize="9" fontFamily="ui-monospace,Menlo,monospace" fill={C.muted}>
                    4층 피난안내도 샘플 · 데모 이미지 자리
                  </text>
                </g>
              )}
              {edges.map((x, i) => {
                const a = byId[x.a];
                const b = byId[x.b];
                if (!a || !b) return null;
                return (
                  <line
                    key={`${x.a}-${x.b}-${i}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={x.src === "ai" ? C.haptic : C.ink}
                    strokeWidth="3"
                    strokeDasharray={x.src === "ai" ? "6 4" : undefined}
                    strokeLinecap="round"
                  />
                );
              })}
              {nodes.map((n) => {
                const isSel = sel === n.id;
                const isConn = conn === n.id;
                const err = errIds.has(n.id);
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} className="cursor-grab" onPointerDown={(e) => onNodeDown(e, n.id)}>
                    <circle r="20" fill="transparent" />
                    {(isSel || isConn) && <circle r="17" fill="none" stroke={isConn ? C.route : C.brand} strokeWidth="2.5" />}
                    <circle r="12" fill="#fff" stroke={err ? C.error : n.src === "ai" ? C.haptic : C.ink} strokeWidth="2.5" strokeDasharray={n.src === "ai" && !err ? "4 2.5" : undefined} />
                    <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill={C.ink} pointerEvents="none">
                      {NODE_TYPES[n.type].short}
                    </text>
                    <text y="28" textAnchor="middle" fontSize="9.5" fontWeight="600" fill={C.ink} stroke="#fff" strokeWidth="3" paintOrder="stroke" pointerEvents="none">
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {phase === "ready" && (
        <>
          {parseError && (
            <div role="alert" className="rounded-[14px] bg-err-tint px-3.5 py-3 text-[14px] font-semibold text-err-ink">
              {parseError} · 다시 시도해 주세요
            </div>
          )}
          <button type="button" onClick={generate} className="h-14 rounded-2xl border-none bg-haptic text-[16px] font-bold text-white">
            AI 초안 생성{API_MODE === "mock" ? " · 시뮬레이션" : ""}
          </button>
          <button type="button" onClick={reset} className="h-[46px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[14px] font-semibold text-ink">
            다른 이미지 선택
          </button>
        </>
      )}

      {phase === "loading" && (
        <div role="status" className="rounded-[14px] bg-haptic-tint p-4 text-[15px] leading-normal font-bold text-haptic-ink">
          AI가 노드·간선 초안을 만들고 있어요{API_MODE === "mock" ? " · 시뮬레이션" : ""}
        </div>
      )}

      {phase === "draft" && (
        <>
          <div className="flex items-center gap-2.5">
            <label className="flex flex-1 items-center gap-2.5 text-[13px] font-semibold text-muted">
              원본 투명도
              <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} className="flex-1 accent-brand" />
            </label>
            <button type="button" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="축소" className="size-11 rounded-xl border-[1.5px] border-edge bg-surface text-[20px] font-semibold text-ink">
              −
            </button>
            <button type="button" onClick={() => setZoom((z) => Math.min(2.5, z + 0.5))} aria-label="확대" className="size-11 rounded-xl border-[1.5px] border-edge bg-surface text-[20px] font-semibold text-ink">
              +
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-[12px] text-muted">
            <span className="flex items-center gap-[5px]">
              <span className="w-4 border-t-[2.5px] border-dashed border-haptic" />
              AI 추출
            </span>
            <span className="flex items-center gap-[5px]">
              <span className="w-4 border-t-[2.5px] border-ink" />
              사람이 수정
            </span>
            <span className="flex items-center gap-[5px]">
              <span className="size-2.5 rounded-full border-[2.5px] border-error" />
              검증 오류
            </span>
          </div>
          {conn && (
            <div role="status" className="flex items-center justify-between gap-2 rounded-xl bg-[#E8F0F8] px-3 py-2.5 text-[14px] font-semibold text-[#1F4F80]">
              연결할 다른 노드를 탭하세요
              <button type="button" onClick={() => setConn(null)} className="h-9 rounded-lg border-none bg-white px-3 text-[13px] font-bold text-[#1F4F80]">
                연결 취소
              </button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            <button type="button" disabled={!selN} onClick={() => selN && setConn(selN.id)} className={toolBtn}>
              간선 연결
            </button>
            <button type="button" disabled={!selN} onClick={deleteNode} className={toolBtn}>
              노드 삭제
            </button>
            <button type="button" disabled={!hist.length} onClick={undo} className={toolBtn}>
              실행 취소
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-bold text-muted">노드 추가</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(NODE_TYPES) as NodeType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => addNode(t)}
                  aria-label={`${t} (${NODE_TYPES[t].desc}) 노드 추가`}
                  className="flex h-11 items-center gap-[5px] rounded-[10px] border-[1.5px] border-edge bg-surface px-2.5 text-[13px] font-semibold text-ink"
                >
                  <span aria-hidden="true" className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-ink text-[10px] font-extrabold">
                    {NODE_TYPES[t].short}
                  </span>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {errors.length > 0 && (
            <div className="flex flex-col overflow-hidden rounded-2xl bg-err-tint" role="region" aria-label="검증 오류">
              <div className="px-3.5 pt-3 pb-1.5 text-[13px] font-extrabold text-err-ink">검증 오류</div>
              {errors.map((er, i) => (
                <div key={`${er.nodeId}-${i}`} className="flex items-center justify-between gap-2.5 py-2 pr-2 pl-3.5">
                  <span className="text-[14px] leading-[1.4] text-ink">{er.text}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSel(er.nodeId);
                      setConn(null);
                    }}
                    className="h-9 flex-none rounded-[10px] border-none bg-error px-3 text-[13px] font-bold text-white"
                  >
                    보기
                  </button>
                </div>
              ))}
            </div>
          )}

          {selN && (
            <div className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4">
              <div className="flex items-center justify-between">
                <div className="text-[15px] font-extrabold">노드 속성 · {selN.id}</div>
                <Badge tone={selN.src === "ai" ? "haptic" : "neutral"} className="rounded-md px-2 py-[3px] text-[12px]">
                  {selN.src === "ai" ? "AI 추출값" : "사람이 수정함"}
                </Badge>
              </div>
              <label className={labelCls}>
                유형
                <select value={selN.type} onChange={(e) => updateSel({ type: e.target.value as NodeType })} className={field}>
                  {(Object.keys(NODE_TYPES) as NodeType[]).map((t) => (
                    <option key={t} value={t}>
                      {t} · {NODE_TYPES[t].desc}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                라벨
                <input value={selN.label} onChange={(e) => updateSel({ label: e.target.value })} className={field} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className={labelCls}>
                  층<div className="flex h-11 items-center rounded-[10px] bg-app-bg px-2.5 text-[15px] font-medium text-ink">{floor}층</div>
                </div>
                <div className={labelCls}>
                  위치 (0–1)
                  <div className="flex h-11 items-center rounded-[10px] bg-app-bg px-2.5 text-[15px] font-medium text-ink">
                    {(selN.x / EDITOR_W).toFixed(2)}, {(selN.y / EDITOR_H).toFixed(2)}
                  </div>
                </div>
              </div>
              <label className={labelCls}>
                OCR 값
                <input value={selN.ocr} onChange={(e) => updateSel({ ocr: e.target.value })} placeholder="인식된 텍스트 없음" className={field} />
              </label>
              {selN.type === "elevator_hall" && (
                <label className={labelCls}>
                  served_floors · 정차 층 (현장 확인 후 입력)
                  <input ref={stopsRef} value={selN.servedFloors} onChange={(e) => updateSel({ servedFloors: e.target.value })} placeholder="예: 1F,2F,3F,4F (또는 1,2,3,4)" className={field} />
                </label>
              )}
            </div>
          )}

          {saved && (
            <div role="status" className={`rounded-xl px-3.5 py-3 text-[14px] leading-[1.45] font-semibold ${saved === "verified" ? "bg-ok-tint text-ok-ink" : "bg-warm-panel text-ink"}`}>
              {saved === "verified" ? "verified로 저장했어요. 검수된 이 그래프만 사용자 길찾기에 연결됩니다." : "draft로 저장했어요. draft는 사용자 경로 계산에 쓰이지 않아요."}
            </div>
          )}
          {saveError && (
            <div role="alert" className="rounded-xl bg-err-tint px-3.5 py-3 text-[14px] font-semibold text-err-ink">
              {saveError} · 다시 저장해 주세요
            </div>
          )}
          <button type="button" onClick={editElevatorStops} className="h-12 rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink">
            엘리베이터 정차 층 편집
          </button>
          <div className="grid grid-cols-[1fr_1.3fr] gap-2">
            <button type="button" disabled={saving} onClick={() => save("draft")} className="h-[54px] rounded-2xl border-[1.5px] border-ink bg-surface text-[15px] font-bold text-ink">
              {saving ? "저장 중…" : "draft 저장"}
            </button>
            <button
              type="button"
              disabled={saving}
              aria-disabled={errors.length > 0}
              onClick={() => (errors.length ? actions.toast(`검증 오류 ${errors.length}개를 먼저 해결해 주세요`) : setConfirm(true))}
              className="h-[54px] rounded-2xl border-none text-[15px] font-bold text-white"
              style={{ background: errors.length ? C.disabled : C.success }}
            >
              verified로 저장
            </button>
          </div>
        </>
      )}

      {confirm &&
        createPortal(
          <div className="absolute inset-0 z-[8] flex items-center justify-center bg-[rgba(20,22,20,.5)] p-5">
            <div role="alertdialog" aria-modal="true" aria-labelledby="gg-verify-title" className="flex flex-col gap-3 rounded-[22px] bg-surface p-[22px]">
              <h2 id="gg-verify-title" className="m-0 text-[19px] font-extrabold">
                verified로 저장할까요?
              </h2>
              <p className="m-0 text-[15px] leading-normal text-muted">검수한 경로만 사용자 안내에 사용됩니다. 노드 위치, 연결, 엘리베이터 정차 층을 현장 기준으로 확인했는지 다시 봐주세요.</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button type="button" autoFocus onClick={() => setConfirm(false)} className="h-[50px] rounded-[14px] border-[1.5px] border-edge bg-surface text-[15px] font-semibold text-ink">
                  다시 볼게요
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirm(false);
                    save("verified");
                  }}
                  className="h-[50px] rounded-[14px] border-none bg-success text-[15px] font-bold text-white"
                >
                  verified 저장
                </button>
              </div>
            </div>
          </div>,
          // The modal is only opened by a click, so this always runs on the client.
          document.getElementById("gg-overlay") ?? document.body,
        )}
    </div>
  );
}
