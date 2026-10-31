// Mirrors of the Laravel API responses (backend/app/Http/Controllers). Keep in sync with the backend.

export type ApiNodeType = "room" | "junction" | "stairs" | "elevator_hall" | "entrance" | "exit" | "landmark";

export interface ApiSearchResult {
  id: string; // node id, e.g. "4F-405"
  label: string;
  type: ApiNodeType;
  floor: string; // "4F", "B1"
  building: string;
}

export interface ApiCheckpoint {
  kind: "room_no" | "floor_sign" | "elevator_sign";
  text: string;
}

interface ApiStepBase {
  from: string;
  to: string;
  to_label: string; // where the step ends, e.g. "중앙 엘리베이터 홀"
  floor: string;
  checkpoint: ApiCheckpoint | null;
  text: string; // spoken-style instruction
}

export interface ApiWalkStep extends ApiStepBase {
  kind: "walk";
  heading_deg: number | null; // compass, 0 = north, clockwise
  turn: "left" | "right" | "straight" | "back" | null; // null = facing unknown, use heading_deg + compass
  length_m: number;
}

export interface ApiVerticalStep extends ApiStepBase {
  kind: "elevator" | "stairs";
  elevator: string | null;
  to_floor: string;
}

export type ApiStep = ApiWalkStep | ApiVerticalStep;

export interface ApiRoute {
  total_m: number;
  path: string[]; // node ids, for drawing the route line
  steps: ApiStep[];
  arrived: { node: string; label: string; floor: string };
  /** Routed on a photographed floor map nobody has checked yet (POST /api/route/photo). */
  draft?: boolean;
}

/** POST /api/locate: where am I, from one photo of a nearby sign (no expected node). */
export interface ApiLocateResult {
  status: "found" | "floor_only" | "unknown"; // floor_only: only a floor sign was read, ask for a room number
  texts: string[];
  node: { id: string; label: string; floor: string } | null;
  floor: string | null;
}

/** GET /api/start-points: entrances, exits, elevator halls and stairs on verified floors, bottom floor first. */
export interface ApiStartFloor {
  floor: string;
  points: { id: string; label: string; type: "entrance" | "exit" | "elevator_hall" | "stairs" }[];
}

export interface ApiCheckpointResult {
  status: "matched" | "mismatch" | "unknown";
  texts: string[];
  node: { id: string; label: string; floor: string } | null; // on mismatch: where the camera actually is
}

/** Graph JSON contract from 업무분담.md (parse output / PUT /api/graph body). x, y are 0–1. */
export interface ApiGraph {
  building: string;
  floor: string;
  /** parse only: "map" = floor read from the sign, "hint" = the floor the app sent. */
  floor_source?: "map" | "hint";
  status: "draft" | "verified";
  current_node_id?: string | null;
  /** `outline`: wall outline of a room/stair/elevator, 0–1 photo coords, closing edge implicit (display only). */
  nodes: { id: string; type: ApiNodeType; label: string; x: number; y: number; ref?: string; outline?: { x: number; y: number }[] }[];
  edges: { from: string; to: string; type: "walk"; length_m?: number | null; heading_deg?: number | null }[];
  elevators?: { id: string; name: string; served_floors: string[] }[];
  /** parse / saved map: the building it was saved under, and when (saved map only). */
  building_id?: number;
  saved_at?: string;
}

/** GET /api/buildings: nearest first when a location was sent, with the floors that have a saved map. */
export interface ApiBuilding {
  id: number;
  name: string;
  distance_m: number | null;
  saved_floors: string[];
}
