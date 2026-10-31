export type Screen =
  | "landing"
  | "trial"
  | "welcome"
  | "building"
  | "captureIntro"
  | "invalidMap"
  | "wrongFloor"
  | "mapResult"
  | "start"
  | "search"
  | "preview"
  | "mode"
  | "guide"
  | "elevator"
  | "floorMap"
  | "scan"
  | "offroute"
  | "arrive"
  | "editor";

export type GuideMode = "both" | "voice" | "screen";
export type DirectionState = "far" | "near" | "aligned" | "unstable";
/** Camera checks: the evacuation map before starting, and nearby signs after going off route. */
export type ScanTarget = "map" | "sign";
export type ScanOutcome = "success" | "mismatch" | "fail";
export type ScanState = "aim" | "analyzing" | ScanOutcome | "denied";
export type OffrouteState = "alert" | "floor" | "pin" | "confirm";
export type GuideStep = number;
export type HapticPattern = "dir" | "left" | "right" | "floor" | "confirm" | "arrive" | "off";

export type RoomCategory = "강의실" | "행정실" | "엘리베이터" | "계단" | "기타";

export interface Room {
  id: string;
  name: string;
  kind: string;
  floor: number;
  cat: RoomCategory;
  /** Whether a verified demo route exists to this destination. */
  routeReady: boolean;
}

export type StartNodeId = "here" | "stair" | "hall" | "main";

export interface StartNode {
  id: StartNodeId;
  label: string;
  x: number;
  y: number;
}

export interface RouteStep {
  floor: string;
  title: string;
  sub: string;
  subWarn: boolean;
  turn: string;
  next: string;
  landmark: string;
  cta: string;
  offDemo: boolean;
  /** Set from the API step so screens can branch on walk / elevator / stairs. */
  kind?: "walk" | "elevator" | "stairs";
  elevator?: string | null;
  toFloor?: string;
  headingDeg?: number | null;
  lengthM?: number;
  turnDir?: "left" | "right" | "back" | "straight" | null;
  checkpoint?: { kind: string; text: string } | null;
  toNode?: string;
}

export type GraphStatus = "empty" | "draft" | "verified";
export type NodeType =
  | "room"
  | "junction"
  | "stairs"
  | "elevator_hall"
  | "entrance"
  | "exit"
  | "landmark";
export type GraphSource = "ai" | "human";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  /** Position in canvas units (0–EDITOR_W, 0–EDITOR_H); shown to admins as 0–1 ratio. */
  x: number;
  y: number;
  ocr: string;
  servedFloors: string;
  src: GraphSource;
  /** Backend `ref`: links an elevator/stairs node to the same shaft on other floors. */
  ref?: string;
  /** Wall outline of a room/stair/elevator in canvas units, closing edge implicit. Display only, never saved. */
  outline?: { x: number; y: number }[];
  /** Outline estimated from spacing (fallbackOutlines), not traced by the AI: no interior detail is drawn. */
  outlineEstimated?: boolean;
}

export interface GraphEdge {
  a: string;
  b: string;
  src: GraphSource;
  /** Backend `length_m`; kept so editing a parsed graph does not lose measured values. */
  lengthM?: number;
  /** Backend `heading_deg`; null/undefined means "unknown", not straight. */
  headingDeg?: number | null;
}

export interface FloorGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphError {
  nodeId: string;
  text: string;
}

export interface FloorStatus {
  floor: number;
  status: "verified" | "draft" | "none";
  summary: string;
}
