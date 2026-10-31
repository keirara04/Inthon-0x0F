// API adapter. Screens call these functions instead of fetching directly.
// Mock mode is the default; set NEXT_PUBLIC_GILGYEOL_API=live to call the Laravel API at NEXT_PUBLIC_API_URL.
// Live responses are converted to the UI types here, so screens don't care which mode is on.
import type { ApiCheckpointResult, ApiGraph, ApiLocateResult, ApiNodeType, ApiRoute, ApiSearchResult, ApiStartFloor, ApiStep } from "@/types/api";
import { BUILDING, EDITOR_H, EDITOR_W, ROOMS, SAMPLE_AI_GRAPH, parseServedFloors } from "./data";
import type { FloorGraph, GraphNode, Room, RoomCategory, RouteStep } from "./types";

export const API_MODE: "live" | "mock" = process.env.NEXT_PUBLIC_GILGYEOL_API === "live" ? "live" : "mock";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers },
    });
  } catch {
    throw new ApiError("서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; errors?: Record<string, string[]> } | null;
    const firstFieldError = body?.errors ? Object.values(body.errors)[0]?.[0] : undefined;
    throw new ApiError(firstFieldError ?? body?.message ?? `요청 실패 (${res.status})`, res.status);
  }
  if (res.status === 204) return undefined as T;
  // Laravel API Resources wrap every payload in { data }.
  return ((await res.json()) as { data: T }).data;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** "4F" => 4, "B1" => -1 */
export function floorNumber(label: string): number {
  const b = /^B(\d+)$/i.exec(label);
  return b ? -Number(b[1]) : parseInt(label, 10);
}

/** 4 => "4F", -1 => "B1" */
export function floorLabel(n: number): string {
  return n < 0 ? `B${-n}` : `${n}F`;
}

const CATEGORY: Partial<Record<ApiNodeType, RoomCategory>> = {
  room: "강의실",
  elevator_hall: "엘리베이터",
  stairs: "계단",
  entrance: "기타",
  exit: "기타",
  landmark: "기타",
};

const KIND: Partial<Record<ApiNodeType, string>> = {
  room: "호실",
  stairs: "계단",
  elevator_hall: "승강기",
  entrance: "출입구",
  exit: "출구",
  landmark: "랜드마크",
};

export async function searchPlaces(q: string): Promise<Room[]> {
  const query = q.trim();
  if (API_MODE === "live") {
    // `q` is required by the backend. The building name matches every node in it, so an empty
    // search still returns a browsable list; SearchScreen applies the category/floor filters locally.
    const rows = await request<ApiSearchResult[]>(`/api/search?q=${encodeURIComponent(query || BUILDING)}`);
    return rows.map((r) => ({
      id: r.id, // node id ("4F-405"), pass it to fetchRoute
      name: r.label,
      kind: KIND[r.type] ?? "시설",
      floor: floorNumber(r.floor),
      cat: r.type === "room" && /행정|사무|학과|조교|상담/.test(r.label) ? "행정실" : (CATEGORY[r.type] ?? "기타"),
      routeReady: true, // search only returns verified floors
    }));
  }
  return ROOMS.filter((r) => !query || r.name.includes(query) || `${r.floor}층`.includes(query));
}

/** Parsed graph plus the fields the flow needs before the admin edits it. */
export interface ParsedGraph extends FloorGraph {
  building: string;
  floor: string;
  /** Whether `floor` was read from the sign or is just the hint the app sent. */
  floorSource?: "map" | "hint";
  /** Node the evacuation map marked as "현위치" — the default start node. */
  current_node_id: string | null;
  elevators: NonNullable<ApiGraph["elevators"]>;
}

/**
 * Parses an evacuation-map image into a draft graph. Results always start as draft. Nothing is saved.
 * Sent at 2048px long side: the AI evals (ai/README.md) measured map reading at that size.
 */
export async function parseEvacMap(image: Blob | null, floor: number = 4, signal?: AbortSignal): Promise<ParsedGraph> {
  if (API_MODE === "live") {
    if (!image) throw new Error("피난안내도 이미지를 먼저 선택해 주세요");
    const body = new FormData();
    body.append("image", await downscale(image, 2048, MAP_JPEG_QUALITY));
    body.append("building", BUILDING);
    body.append("floor", floorLabel(floor));
    return fromApiGraph(await request<ApiGraph>("/api/evac-map/parse", { method: "POST", body, signal }));
  }
  await delay(1500);
  return {
    ...structuredClone(SAMPLE_AI_GRAPH),
    building: BUILDING,
    floor: floorLabel(floor),
    current_node_id: null,
    elevators: [],
  };
}

/**
 * Saves one floor (PUT /api/graph). Needs the admin token, asked once and kept in this browser only.
 * A verified floor is only overwritten after the admin confirms (backend answers 409).
 * Saving replaces the whole floor: there is no "load existing floor" endpoint, so edit floors not on the demo route.
 */
export async function saveFloorGraph(floor: number, graph: FloorGraph, status: "draft" | "verified"): Promise<void> {
  if (API_MODE === "live") {
    const put = (replace: boolean) =>
      request("/api/graph", {
        method: "PUT",
        headers: { "X-Admin-Token": adminToken() },
        body: JSON.stringify({ ...toApiGraph(graph, floorLabel(floor), status), replace }),
      });
    try {
      await put(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) clearAdminToken(); // wrong token: ask again next time
      if (err instanceof ApiError && err.status === 409 && window.confirm(`${err.message}\n\n덮어쓸까요?`)) {
        await put(true);
        return;
      }
      throw err;
    }
    return;
  }
  await delay(400);
}

export async function fetchRoute(startNode: string, destNode: string): Promise<ApiRoute> {
  if (API_MODE === "live") {
    return request<ApiRoute>("/api/route", { method: "POST", body: JSON.stringify({ start_node: startNode, dest_node: destNode }) });
  }
  await delay(300);
  return structuredClone(MOCK_ROUTE);
}

/** Sends one camera frame (downscaled) to check where the user is. Frames are not stored by the backend. */
export async function postCheckpoint(image: Blob, expectedNode: string): Promise<ApiCheckpointResult> {
  if (API_MODE === "live") {
    const body = new FormData();
    body.append("image", await downscale(image), "frame.jpg");
    body.append("expected_node", expectedNode);
    return request<ApiCheckpointResult>("/api/checkpoint", { method: "POST", body });
  }
  await delay(1200);
  return { status: "matched", texts: [], node: { id: expectedNode, label: "", floor: "" } };
}

/** Where am I? One photo of a nearby door number or floor sign, matched across the whole building. */
export async function locate(image: Blob): Promise<ApiLocateResult> {
  if (API_MODE === "live") {
    const body = new FormData();
    body.append("image", await downscale(image), "sign.jpg");
    body.append("building", BUILDING);
    return request<ApiLocateResult>("/api/locate", { method: "POST", body });
  }
  await delay(1200);
  return { status: "found", texts: ["101"], node: { id: "1F-101", label: "101호", floor: "1F" }, floor: "1F" };
}

/** Entrances, exits, elevator halls and stairs to start from ("다른 입구에 계신가요?"). */
export async function startPoints(): Promise<ApiStartFloor[]> {
  if (API_MODE === "live") return request<ApiStartFloor[]>(`/api/start-points?building=${encodeURIComponent(BUILDING)}`);
  await delay(200);
  return [
    {
      floor: "1F",
      points: [
        { id: "1F-lobby", label: "1층 로비", type: "entrance" },
        { id: "1F-elev-A", label: "중앙 엘리베이터 홀", type: "elevator_hall" },
        { id: "1F-stairs-W", label: "서쪽 계단", type: "stairs" },
      ],
    },
  ];
}

const TURN_LABEL: Record<NonNullable<Extract<ApiStep, { kind: "walk" }>["turn"]>, string> = {
  left: "좌회전 · 진동 짧게–짧게",
  right: "우회전 · 진동 길게–길게",
  back: "방향 전환 · 뒤로 돌기",
  straight: "직진",
};

const LANDMARK_LABEL = { room_no: "호실 번호 표지", floor_sign: "층 표지", elevator_sign: "엘리베이터 표지" } as const;

/** Backend step -> the RouteStep the guidance screens already render. */
export function toRouteStep(step: ApiStep): RouteStep {
  const floor = `${floorNumber(step.floor)}층`;
  const check = step.checkpoint;
  return {
    floor,
    title: step.text,
    sub: check ? `${check.kind === "room_no" ? `${check.text}호` : check.text} 표지가 보이면 카메라로 확인하세요` : "도착하면 아래 버튼을 눌러주세요",
    subWarn: false,
    turn: step.kind === "walk" ? (step.turn ? TURN_LABEL[step.turn] : "") : `층 이동 · ${floor}`,
    next: step.kind === "walk" ? `${step.to_label} 도착` : `${floor} 도착`,
    landmark: check ? LANDMARK_LABEL[check.kind] : "",
    cta: check ? "표지 확인하기" : "여기 도착했어요",
    offDemo: step.kind === "walk",
    kind: step.kind,
    elevator: step.kind === "walk" ? null : step.elevator,
    toFloor: step.kind === "walk" ? undefined : step.to_floor,
    headingDeg: step.kind === "walk" ? step.heading_deg : null,
    lengthM: step.kind === "walk" ? step.length_m : undefined,
    checkpoint: step.checkpoint,
    toNode: step.to,
  };
}

/** Phone photos are 3–8 MB; the backend accepts 2 MB. Shrink to a JPEG (<= 1280px by default) before upload. */
/** JPEG quality for evacuation maps: room numbers are tiny, so keep more detail than for door signs. */
export const MAP_JPEG_QUALITY = 0.85;
const MAX_UPLOAD_BYTES = 1_900_000; // backend rejects images over 2 MB

/**
 * Encodes a canvas as JPEG at `quality`, stepping down (0.7, then 0.6) only if the file would be too big
 * for the backend. Encoding once at the final size avoids stacking JPEG artefacts.
 */
export async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  for (const q of [quality, 0.7, 0.6]) {
    if (q > quality) continue;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    if (!blob) throw new Error("이미지 변환 실패");
    if (blob.size <= MAX_UPLOAD_BYTES || q === 0.6) return blob;
  }
  throw new Error("이미지 변환 실패");
}

async function downscale(image: Blob, max = 1280, quality = 0.7): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  // Already small enough (e.g. a camera frame): skip a second lossy JPEG pass, small text matters.
  if (image.type === "image/jpeg" && image.size <= 2_000_000 && Math.max(bmp.width, bmp.height) <= max) {
    bmp.close();
    return image;
  }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvasToJpeg(canvas, quality);
}

const KEY = "gilgyeol-admin-token";

function clearAdminToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

function adminToken(): string {
  // Bundled env is only a convenience for local testing; prefer the prompt (kept in this browser only).
  let token = process.env.NEXT_PUBLIC_GILGYEOL_ADMIN_TOKEN || null;
  try {
    token = localStorage.getItem(KEY) ?? token;
  } catch {}
  if (!token) {
    token = window.prompt("관리자 토큰을 입력하세요") ?? "";
    try {
      localStorage.setItem(KEY, token);
    } catch {}
  }
  return token;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** API graph (0–1 coords, from/to edges) -> editor graph (canvas units, a/b edges). */
function fromApiGraph(g: ApiGraph): ParsedGraph {
  const elevators = g.elevators ?? [];
  const served = new Map(elevators.map((e) => [e.id, e.served_floors.join(",")]));
  return {
    building: g.building,
    floor: g.floor,
    floorSource: g.floor_source,
    current_node_id: g.current_node_id ?? null,
    elevators,
    nodes: g.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      x: Math.round(clamp01(n.x) * EDITOR_W),
      y: Math.round(clamp01(n.y) * EDITOR_H),
      ocr: n.type === "room" ? n.label.replace(/\D/g, "") : "",
      servedFloors: (n.ref && served.get(n.ref)) || "",
      src: "ai",
      ref: n.ref,
      outline: n.outline?.map((p) => ({ x: clamp01(p.x) * EDITOR_W, y: clamp01(p.y) * EDITOR_H })),
    })),
    edges: g.edges.map((e) => ({
      a: e.from,
      b: e.to,
      src: "ai",
      lengthM: e.length_m ?? undefined,
      headingDeg: e.heading_deg ?? null,
    })),
  };
}

/** Cross-floor link key. Preserve the parsed ref; otherwise link new nodes by label (same label on every floor). */
function refFor(n: GraphNode): string | undefined {
  if (n.type !== "elevator_hall" && n.type !== "stairs") return undefined;
  const auto = `${n.type === "elevator_hall" ? "elev" : "stairs"}-${n.label
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "") || "node"}`;
  return (n.ref?.trim() || auto).slice(0, 50); // backend caps ref at 50 chars
}

/** Editor graph -> API graph. */
function toApiGraph(g: FloorGraph, floor: string, status: "draft" | "verified"): ApiGraph {
  // Backend requires ids to start with "<floor>-" and to be distinct.
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  for (const n of g.nodes) {
    const base = n.id.startsWith(`${floor}-`) ? n.id : `${floor}-${n.id}`;
    let id = base;
    for (let i = 2; used.has(id); i++) id = `${base}-${i}`;
    used.add(id);
    idMap.set(n.id, id);
  }
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const elevators = new Map<string, NonNullable<ApiGraph["elevators"]>[number]>();
  for (const n of g.nodes) {
    const ref = refFor(n);
    if (n.type !== "elevator_hall" || !ref || elevators.has(ref)) continue;
    const served = parseServedFloors(n.servedFloors).filter((f): f is string => f !== null);
    // Sending [] would erase a surveyed elevator on the server.
    if (served.length) elevators.set(ref, { id: ref, name: n.label, served_floors: served });
  }
  return {
    building: BUILDING,
    floor,
    status,
    nodes: g.nodes.map((n) => ({
      id: idMap.get(n.id)!,
      type: n.type,
      label: n.label,
      x: clamp01(n.x / EDITOR_W),
      y: clamp01(n.y / EDITOR_H),
      ...(refFor(n) ? { ref: refFor(n) } : {}),
    })),
    edges: g.edges.flatMap((e) => {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      const from = idMap.get(e.a);
      const to = idMap.get(e.b);
      if (!a || !b || !from || !to || from === to) return [];
      const dx = (b.x - a.x) / EDITOR_W;
      const dy = (b.y - a.y) / EDITOR_H;
      return [{
        from,
        to,
        type: "walk" as const,
        // Preserve measured values; otherwise assume the map spans ~50 m and is drawn north-up.
        // Real guidance headings must be measured on site (see 업무분담.md).
        length_m: e.lengthM ?? round1(Math.hypot(dx, dy) * 50),
        heading_deg: e.headingDeg ?? round2(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360),
      }];
    }),
    elevators: [...elevators.values()],
  };
}

/** Same shape as prod /api/route for 1F-lobby -> 4F-405, so mock mode exercises the real flow. */
const MOCK_ROUTE: ApiRoute = {
  total_m: 35,
  path: ["1F-lobby", "1F-101", "1F-junc", "1F-elev-A", "4F-elev-A", "4F-junc", "4F-405"],
  steps: [
    { kind: "walk", from: "1F-lobby", to: "1F-elev-A", to_label: "중앙 엘리베이터 홀", floor: "1F", checkpoint: null, heading_deg: 0, turn: null, length_m: 12, text: "101호 지나서 중앙 엘리베이터 홀까지 가세요" },
    { kind: "elevator", from: "1F-elev-A", to: "4F-elev-A", to_label: "중앙 엘리베이터 홀", floor: "4F", checkpoint: { kind: "floor_sign", text: "4F" }, elevator: "중앙 엘리베이터", to_floor: "4F", text: "중앙 엘리베이터에 타서 4층에서 내리세요" },
    { kind: "walk", from: "4F-elev-A", to: "4F-junc", to_label: "4층 중앙 복도", floor: "4F", checkpoint: null, heading_deg: 180, turn: null, length_m: 5, text: "4층 중앙 복도 쪽으로 가세요" },
    { kind: "walk", from: "4F-junc", to: "4F-405", to_label: "405호", floor: "4F", checkpoint: { kind: "room_no", text: "405" }, heading_deg: 270, turn: "right", length_m: 18, text: "오른쪽으로 돌아 405호까지 가세요" },
  ],
  arrived: { node: "4F-405", label: "405호", floor: "4F" },
};
