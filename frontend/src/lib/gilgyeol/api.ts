// API adapter. Screens call these functions instead of fetching directly.
// Mock mode is the default; set NEXT_PUBLIC_GILGYEOL_API=live to call the Laravel API.
// The backend contract lives in the repo root 업무분담.md / backend/routes/api.php.
import { EDITOR_H, EDITOR_W, ROOMS, SAMPLE_AI_GRAPH, floorLabel, parseServedFloors } from "./data";
import type { FloorGraph, GraphEdge, GraphNode, NodeType, Room, RoomCategory } from "./types";

export const API_MODE: "live" | "mock" = process.env.NEXT_PUBLIC_GILGYEOL_API === "live" ? "live" : "mock";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_GILGYEOL_ADMIN_TOKEN ?? "";

/** Same assumption as backend EvacMapParser when a map has no measured lengths. */
const MAP_WIDTH_M = 50;

type Envelope<T> = { data: T };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요");
  }

  if (!res.ok) {
    // Laravel abort()/validation responses carry {message, errors?}.
    const body = (await res.json().catch(() => null)) as { message?: string; errors?: Record<string, string[]> } | null;
    const firstFieldError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
    throw new Error(firstFieldError ?? body?.message ?? `요청 실패 (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------------------------------------------------------------- search */

type ContractNodeType = NodeType;
interface SearchPayload {
  id: string;
  label: string;
  type: ContractNodeType;
  floor: string;
  building: string;
}

const CATEGORY_BY_TYPE: Record<ContractNodeType, RoomCategory> = {
  room: "강의실",
  junction: "기타",
  stairs: "계단",
  elevator_hall: "엘리베이터",
  entrance: "기타",
  exit: "기타",
  landmark: "기타",
};

const KIND_BY_TYPE: Record<ContractNodeType, string> = {
  room: "호실",
  junction: "복도",
  stairs: "계단",
  elevator_hall: "승강기",
  entrance: "출입구",
  exit: "출구",
  landmark: "랜드마크",
};

function floorNumber(label: string): number {
  const basement = /^B(\d+)$/i.exec(label);
  if (basement) return -parseInt(basement[1], 10);
  return parseInt(label, 10) || 0;
}

function toRoom(r: SearchPayload): Room {
  // Backend only returns non-junction nodes of verified floors, so every result is routable.
  const cat: RoomCategory =
    r.type === "room" && /행정|사무|학과|조교|상담/.test(r.label) ? "행정실" : CATEGORY_BY_TYPE[r.type] ?? "기타";
  return {
    id: r.id,
    name: r.label,
    kind: KIND_BY_TYPE[r.type] ?? "시설",
    floor: floorNumber(r.floor),
    cat,
    routeReady: true,
  };
}

export async function searchPlaces(q: string): Promise<Room[]> {
  const query = q.trim();
  if (API_MODE === "live") {
    // `q` is required by the backend. The building name matches every node of that building,
    // so an empty search still shows browsable results and the screen filters them locally.
    const { data } = await request<Envelope<SearchPayload[]>>(`/api/search?q=${encodeURIComponent(query || "우정정보관")}`);
    return data.map(toRoom);
  }
  return ROOMS.filter((r) => !query || r.name.includes(query) || `${r.floor}층`.includes(query));
}

/* ------------------------------------------------------- evacuation map */

export interface ContractElevator {
  id: string;
  name: string;
  served_floors: string[];
}

interface EvacMapNodePayload {
  id: string;
  type: ContractNodeType;
  label: string;
  x: number;
  y: number;
  ref?: string;
}

interface EvacMapEdgePayload {
  from: string;
  to: string;
  type?: string;
  length_m?: number;
  heading_deg?: number;
}

interface EvacMapPayload {
  building: string;
  floor: string;
  status: "draft";
  current_node_id: string | null;
  nodes: EvacMapNodePayload[];
  edges: EvacMapEdgePayload[];
  elevators: ContractElevator[];
}

/** Parsed graph plus the fields the flow needs before the admin edits it. */
export interface ParsedGraph extends FloorGraph {
  building: string;
  floor: string;
  /** Node the evacuation map marked as "현위치" — the default start node. */
  current_node_id: string | null;
  elevators: ContractElevator[];
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

function toParsedGraph(p: EvacMapPayload): ParsedGraph {
  const servedByRef = new Map((p.elevators ?? []).map((e) => [e.id, e.served_floors.join(",")]));
  const nodes: GraphNode[] = (p.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    label: n.label,
    // Contract is 0–1 ratio; the editor canvas is EDITOR_W × EDITOR_H.
    x: Math.round(clamp01(n.x) * EDITOR_W),
    y: Math.round(clamp01(n.y) * EDITOR_H),
    ocr: n.type === "room" ? (n.label.match(/\d+/)?.[0] ?? "") : "",
    servedFloors: n.type === "elevator_hall" && n.ref ? (servedByRef.get(n.ref) ?? "") : "",
    src: "ai",
    ref: n.ref,
  }));
  const edges: GraphEdge[] = (p.edges ?? []).map((e) => ({
    a: e.from,
    b: e.to,
    src: "ai",
    lengthM: e.length_m,
    headingDeg: e.heading_deg ?? null,
  }));
  return {
    building: p.building,
    floor: p.floor,
    current_node_id: p.current_node_id ?? null,
    elevators: p.elevators ?? [],
    nodes,
    edges,
  };
}

/** Parses an evacuation-map photo into a draft graph. Results always start as draft. */
export async function parseEvacMap(image: File | null, building: string, floor: number): Promise<ParsedGraph> {
  if (API_MODE === "live") {
    if (!image) throw new Error("피난안내도 이미지를 먼저 선택해 주세요");
    const body = new FormData();
    body.append("image", image);
    body.append("building", building);
    body.append("floor", floorLabel(floor));
    const { data } = await request<Envelope<EvacMapPayload>>("/api/evac-map/parse", { method: "POST", body });
    return toParsedGraph(data);
  }
  await delay(1500);
  return {
    ...structuredClone(SAMPLE_AI_GRAPH),
    building,
    floor: floorLabel(floor),
    current_node_id: null,
    elevators: [],
  };
}

/* ----------------------------------------------------------- graph save */

export interface SaveGraphInput {
  building: string;
  floor: number;
  graph: FloorGraph;
  status: "draft" | "verified";
  /** Required by the backend to overwrite a floor that is already verified. */
  replace?: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** Root for the cross-floor `ref` when the editor has no explicit value (elevator/stairs). */
function slug(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^0-9a-z가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "node"
  );
}

function refFor(n: GraphNode): string | undefined {
  if (n.type !== "elevator_hall" && n.type !== "stairs") return undefined;
  const auto = `${n.type === "elevator_hall" ? "elev" : "stairs"}-${slug(n.label)}`;
  return (n.ref?.trim() || auto).slice(0, 50); // backend caps ref at 50 chars
}

/** Preserve measured edge values; otherwise estimate them from the canvas (map-relative, like the parser). */
function edgeGeometry(a: GraphNode, b: GraphNode, e: GraphEdge): { length_m: number; heading_deg: number | null } {
  const dx = ((b.x - a.x) / EDITOR_W) * MAP_WIDTH_M;
  const dy = ((b.y - a.y) / EDITOR_H) * MAP_WIDTH_M;
  const length_m = e.lengthM ?? round2(Math.hypot(dx, dy));
  const heading_deg =
    e.headingDeg ?? round2((((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360);
  return { length_m, heading_deg };
}

export async function saveFloorGraph({
  building,
  floor,
  graph,
  status,
  replace = false,
}: SaveGraphInput): Promise<void> {
  if (API_MODE !== "live") {
    await delay(400);
    return;
  }
  if (!ADMIN_TOKEN) throw new Error("관리자 토큰이 설정되지 않았어요 (NEXT_PUBLIC_GILGYEOL_ADMIN_TOKEN)");

  const floorId = floorLabel(floor);

  // Backend requires every node id to start with "<floor>-" and to be distinct.
  // The editor keeps contract ids when it parsed a map, but new nodes are added as "N1" etc.
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  for (const n of graph.nodes) {
    const base = n.id.startsWith(`${floorId}-`) ? n.id : `${floorId}-${n.id}`;
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
    used.add(id);
    idMap.set(n.id, id);
  }

  const elevators = new Map<string, ContractElevator>();
  for (const n of graph.nodes) {
    const ref = refFor(n);
    if (n.type !== "elevator_hall" || !ref || elevators.has(ref)) continue;
    const served = parseServedFloors(n.servedFloors).filter((f): f is string => f !== null);
    // Skip unverified stop lists: sending [] would erase a surveyed elevator on the server.
    if (!served.length) continue;
    elevators.set(ref, { id: ref, name: n.label, served_floors: served });
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const nodes = graph.nodes.map((n) => ({
    id: idMap.get(n.id)!,
    type: n.type,
    label: n.label,
    x: round4(clamp01(n.x / EDITOR_W)),
    y: round4(clamp01(n.y / EDITOR_H)),
    ...(refFor(n) ? { ref: refFor(n) } : {}),
  }));

  const edges = graph.edges.flatMap((e) => {
    const from = idMap.get(e.a);
    const to = idMap.get(e.b);
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!from || !to || from === to || !a || !b) return [];
    return [{ from, to, type: "walk", ...edgeGeometry(a, b, e) }];
  });

  await request("/api/graph", {
    method: "PUT",
    headers: { "X-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify({
      building,
      floor: floorId,
      status,
      replace,
      nodes,
      edges,
      elevators: [...elevators.values()],
    }),
  });
}

/* --------------------------------------------------------------- route */

export interface CheckpointHit {
  kind: "room_no" | "floor_sign" | "elevator_sign";
  text: string;
}

export interface RouteStepPayload {
  kind: "walk" | "elevator" | "stairs";
  from: string;
  to: string;
  floor: string;
  checkpoint: CheckpointHit | null;
  heading_deg?: number | null;
  turn?: "left" | "right" | "straight" | "back" | null;
  length_m?: number;
  text: string;
  elevator?: string | null;
  to_floor?: string;
}

export interface RouteResult {
  total_m: number;
  path: string[];
  steps: RouteStepPayload[];
  arrived: { node: string; label: string; floor: string };
}

/** POST /api/route — Dijkstra over verified floors. Node ids come from search results. */
export async function fetchRoute(startNode: string, destNode: string): Promise<RouteResult> {
  if (API_MODE !== "live") throw new Error("목업 모드에서는 경로 API를 사용할 수 없어요 (NEXT_PUBLIC_GILGYEOL_API=live)");
  const { data } = await request<Envelope<RouteResult>>("/api/route", {
    method: "POST",
    body: JSON.stringify({ start_node: startNode, dest_node: destNode }),
  });
  return data;
}

/* ---------------------------------------------------------- checkpoint */

export type CheckpointStatus = "matched" | "mismatch" | "unknown";

export interface CheckpointResult {
  status: CheckpointStatus;
  texts: string[];
  node: { id: string; label: string; floor: string } | null;
}

/** POST /api/checkpoint — reads signs in a camera frame and matches them to `expectedNode`. */
export async function checkCheckpoint(image: Blob, expectedNode: string): Promise<CheckpointResult> {
  if (API_MODE !== "live") {
    await delay(900);
    return { status: "matched", texts: [], node: null };
  }
  const body = new FormData();
  body.append("image", image, "frame.jpg");
  body.append("expected_node", expectedNode);
  const { data } = await request<Envelope<CheckpointResult>>("/api/checkpoint", { method: "POST", body });
  return data;
}
