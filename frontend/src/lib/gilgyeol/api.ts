// API adapter. Screens call these functions instead of fetching directly.
// Mock mode is the default because the backend does not expose the 길결 endpoints yet;
// set NEXT_PUBLIC_GILGYEOL_API=live to call the Laravel API at NEXT_PUBLIC_API_URL.
import { ROOMS, SAMPLE_AI_GRAPH } from "./data";
import type { FloorGraph, Room } from "./types";

export const API_MODE: "live" | "mock" = process.env.NEXT_PUBLIC_GILGYEOL_API === "live" ? "live" : "mock";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers },
  });
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return res.json() as Promise<T>;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function searchPlaces(q: string): Promise<Room[]> {
  if (API_MODE === "live") return request<Room[]>(`/api/search?q=${encodeURIComponent(q)}`);
  const query = q.trim();
  return ROOMS.filter((r) => !query || r.name.includes(query) || `${r.floor}층`.includes(query));
}

/** Parses an evacuation-map image into a draft graph. Results always start as draft. */
export async function parseEvacMap(image: File | null): Promise<FloorGraph> {
  if (API_MODE === "live" && image) {
    const body = new FormData();
    body.append("image", image);
    return request<FloorGraph>("/api/evac-map/parse", { method: "POST", body });
  }
  await delay(1500);
  return structuredClone(SAMPLE_AI_GRAPH);
}

export async function saveFloorGraph(floorId: string, graph: FloorGraph, status: "draft" | "verified"): Promise<void> {
  if (API_MODE === "live") {
    await request(`/api/floors/${floorId}/graph`, { method: "PUT", body: JSON.stringify({ ...graph, status }) });
    return;
  }
  await delay(400);
}
