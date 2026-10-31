// API adapter. Screens call these functions instead of fetching directly.
// Mock mode is the default; set NEXT_PUBLIC_GILGYEOL_API=live to call the Laravel API at NEXT_PUBLIC_API_URL.
// Live responses are converted to the UI types here, so screens don't care which mode is on.
import type { ApiCheckpointResult, ApiGraph, ApiNodeType, ApiRoute, ApiSearchResult, ApiStep } from "@/types/api";
import { BUILDING, EDITOR_H, EDITOR_W, ROOMS, SAMPLE_AI_GRAPH } from "./data";
import type { FloorGraph, Room, RoomCategory, RouteStep } from "./types";

export const API_MODE: "live" | "mock" = process.env.NEXT_PUBLIC_GILGYEOL_API === "live" ? "live" : "mock";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `요청 실패 (${res.status})`, res.status);
  }
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

const CATEGORY: Partial<Record<ApiNodeType, RoomCategory>> = { room: "강의실", elevator_hall: "엘리베이터", stairs: "계단" };

export async function searchPlaces(q: string): Promise<Room[]> {
  if (API_MODE === "live") {
    if (!q.trim()) return [];
    const rows = await request<ApiSearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`);
    return rows.map((r) => ({
      id: r.id, // node id ("4F-405"), pass it to fetchRoute
      name: r.label,
      kind: r.type === "room" ? "강의실" : r.label,
      floor: floorNumber(r.floor),
      cat: CATEGORY[r.type] ?? "행정실",
      routeReady: true, // search only returns verified floors
    }));
  }
  const query = q.trim();
  return ROOMS.filter((r) => !query || r.name.includes(query) || `${r.floor}층`.includes(query));
}

/** Parses an evacuation-map image into a draft graph. Results always start as draft. Nothing is saved. */
export async function parseEvacMap(image: File | null, floor: number = 4): Promise<FloorGraph> {
  if (API_MODE === "live" && image) {
    const body = new FormData();
    body.append("image", await downscale(image));
    body.append("building", BUILDING);
    body.append("floor", floorLabel(floor));
    return fromApiGraph(await request<ApiGraph>("/api/evac-map/parse", { method: "POST", body }));
  }
  await delay(1500);
  return structuredClone(SAMPLE_AI_GRAPH);
}

/**
 * Saves one floor (PUT /api/graph). floorId is "woojung-4f". Needs the admin token, asked once and kept
 * in this browser only. A verified floor is only overwritten after the admin confirms (backend answers 409).
 * Saving replaces the whole floor: there is no "load existing floor" endpoint, so edit floors not on the demo route.
 */
export async function saveFloorGraph(floorId: string, graph: FloorGraph, status: "draft" | "verified"): Promise<void> {
  if (API_MODE === "live") {
    const floor = floorLabel(Number(/(\d+)f$/i.exec(floorId)?.[1] ?? 1));
    const put = (replace: boolean) =>
      request("/api/graph", {
        method: "PUT",
        headers: { "X-Admin-Token": adminToken() },
        body: JSON.stringify({ ...toApiGraph(graph, floor, status), replace }),
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
    next: step.kind === "walk" ? "다음 지점 도착" : `${floor} 도착`,
    landmark: check ? LANDMARK_LABEL[check.kind] : "",
    cta: check ? "표지 확인하기" : "여기 도착했어요",
    offDemo: false,
  };
}

/** Phone photos are 3–8 MB; the backend accepts 2 MB. Shrink to <= 1280px JPEG before upload. */
async function downscale(image: Blob, max = 1280): Promise<Blob> {
  const bmp = await createImageBitmap(image);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), "image/jpeg", 0.7));
}

const KEY = "gilgyeol-admin-token";

function clearAdminToken() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

function adminToken(): string {
  let token: string | null = null;
  try {
    token = localStorage.getItem(KEY);
  } catch {}
  if (!token) {
    token = window.prompt("관리자 토큰을 입력하세요") ?? "";
    try {
      localStorage.setItem(KEY, token);
    } catch {}
  }
  return token;
}

/** API graph (0–1 coords, from/to edges) -> editor graph (canvas units, a/b edges). */
function fromApiGraph(g: ApiGraph): FloorGraph {
  const elevators = new Map((g.elevators ?? []).map((e) => [e.id, e.served_floors.join(",")]));
  return {
    nodes: g.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      x: Math.round(n.x * EDITOR_W),
      y: Math.round(n.y * EDITOR_H),
      ocr: n.type === "room" ? n.label.replace(/\D/g, "") : "",
      servedFloors: (n.ref && elevators.get(n.ref)) ?? "",
      src: "ai",
    })),
    edges: g.edges.map((e) => ({ a: e.from, b: e.to, src: "ai" })),
  };
}

/**
 * Editor graph -> API graph. The editor has no `ref`, so stairs/elevators link across floors by label:
 * use the same label ("중앙 엘리베이터 A") on every floor. servedFloors "1,2,4" or "1F,2F" both work.
 */
function toApiGraph(g: FloorGraph, floor: string, status: "draft" | "verified"): ApiGraph {
  const id = (raw: string) => (raw.startsWith(`${floor}-`) ? raw : `${floor}-${raw}`);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  return {
    building: BUILDING,
    floor,
    status,
    nodes: g.nodes.map((n) => ({
      id: id(n.id),
      type: n.type,
      label: n.label,
      x: Math.min(1, Math.max(0, n.x / EDITOR_W)),
      y: Math.min(1, Math.max(0, n.y / EDITOR_H)),
      ...(n.type === "stairs" || n.type === "elevator_hall" ? { ref: n.label } : {}),
    })),
    edges: g.edges.flatMap((e) => {
      const a = byId.get(e.a);
      const b = byId.get(e.b);
      if (!a || !b) return [];
      const dx = (b.x - a.x) / EDITOR_W;
      const dy = (b.y - a.y) / EDITOR_H;
      return [{
        from: id(e.a),
        to: id(e.b),
        type: "walk" as const,
        // ponytail: assumes the map spans ~50 m and is drawn north-up; measure on site for real guidance.
        length_m: Math.round(Math.hypot(dx, dy) * 50 * 10) / 10,
        heading_deg: Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360),
      }];
    }),
    elevators: g.nodes
      .filter((n) => n.type === "elevator_hall" && n.servedFloors.trim())
      .map((n) => ({
        id: n.label,
        name: n.label,
        served_floors: n.servedFloors.split(/[,\s]+/).filter(Boolean).map((f) => (/^B?\d+$/i.test(f) ? (f.startsWith("B") ? f : `${f}F`) : f)),
      })),
  };
}

/** Same shape as prod /api/route for 1F-lobby -> 4F-405, so mock mode exercises the real flow. */
const MOCK_ROUTE: ApiRoute = {
  total_m: 35,
  path: ["1F-lobby", "1F-101", "1F-junc", "1F-elev-A", "4F-elev-A", "4F-junc", "4F-405"],
  steps: [
    { kind: "walk", from: "1F-lobby", to: "1F-elev-A", floor: "1F", checkpoint: { kind: "floor_sign", text: "1F" }, heading_deg: 0, turn: null, length_m: 12, text: "101호 지나서 중앙 엘리베이터 홀까지 가세요" },
    { kind: "elevator", from: "1F-elev-A", to: "4F-elev-A", floor: "4F", checkpoint: { kind: "floor_sign", text: "4F" }, elevator: "중앙 엘리베이터", to_floor: "4F", text: "중앙 엘리베이터에 타서 4층에서 내리세요" },
    { kind: "walk", from: "4F-elev-A", to: "4F-junc", floor: "4F", checkpoint: null, heading_deg: 180, turn: null, length_m: 5, text: "4층 중앙 복도 쪽으로 가세요" },
    { kind: "walk", from: "4F-junc", to: "4F-405", floor: "4F", checkpoint: { kind: "room_no", text: "405" }, heading_deg: 270, turn: "right", length_m: 18, text: "오른쪽으로 돌아 405호까지 가세요" },
  ],
  arrived: { node: "4F-405", label: "405호", floor: "4F" },
};
