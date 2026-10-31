export type Screen =
  | "welcome"
  | "building"
  | "captureIntro"
  | "mapResult"
  | "start"
  | "search"
  | "preview"
  | "mode"
  | "guide"
  | "elevator"
  | "scan"
  | "offroute"
  | "arrive"
  | "editor";

export type GuideMode = "both" | "voice" | "screen";
export type DirectionState = "far" | "near" | "aligned" | "unstable";
export type ScanTarget = "map" | "floor4" | "sign" | "door";
export type ScanOutcome = "success" | "mismatch" | "fail";
export type ScanState = "aim" | "analyzing" | ScanOutcome | "denied";
export type OffrouteState = "alert" | "floor" | "confirm";
export type GuideStep = 0 | 1 | 2;
export type HapticPattern = "dir" | "left" | "right" | "floor" | "arrive" | "off";

export type RoomCategory = "강의실" | "행정실" | "엘리베이터" | "계단";

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
}

export interface GraphEdge {
  a: string;
  b: string;
  src: GraphSource;
}

export interface FloorGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphError {
  nodeId: string;
  text: string;
}
