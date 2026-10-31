// Demo data from the Claude Design handoff (Gilgyeol Prototype v2).
// Not field-verified — real API / team-reviewed graphs take precedence.
import type {
  DirectionState,
  FloorGraph,
  GraphEdge,
  GraphNode,
  FloorStatus,
  HapticPattern,
  NodeType,
  Room,
  RouteStep,
  ScanTarget,
  StartNode,
  StartNodeId,
} from "./types";

export const C = {
  ink: "#202421",
  muted: "#5E625D",
  brand: "#7A1832",
  route: "#2864A0",
  haptic: "#5B4AB8",
  success: "#25734B",
  warning: "#965900",
  error: "#B3261E",
  line: "#E3E0D7",
  border: "#D9D5CB",
  disabled: "#A8A49A",
} as const;

export const BUILDING = "우정정보관";
export const DEST_FLOOR = 4;

export const PATTERNS: Record<HapticPattern, { name: string; label: string; p: number[] }> = {
  dir: { name: "방향 맞추기", label: "방향 안내", p: [40, 600, 40, 300, 40, 120, 40, 120, 40] },
  left: { name: "왼쪽 회전", label: "왼쪽 회전 알림", p: [80, 90, 80] },
  right: { name: "오른쪽 회전", label: "오른쪽 회전 알림", p: [320, 140, 320] },
  floor: { name: "층 이동", label: "층 이동 알림", p: [90, 70, 90, 70, 90] },
  confirm: { name: "체크포인트 확인", label: "확인 알림", p: [60] },
  arrive: { name: "도착", label: "도착 알림", p: [520, 160, 90, 110, 90] },
  off: { name: "이탈 경고", label: "이탈 경고 알림", p: [40, 50, 40, 50, 40] },
};

export const DIRECTION: Record<Exclude<DirectionState, "unstable">, { rot: number; period: number; msg: string; color: string }> = {
  far: { rot: 72, period: 1.4, msg: "휴대전화를 천천히 돌려주세요", color: C.warning },
  near: { rot: 24, period: 0.7, msg: "목표 방향에 가까워요", color: C.haptic },
  aligned: { rot: 0, period: 0.3, msg: "이 방향으로 이동하세요", color: C.success },
};

export const ROOMS: Room[] = [
  { id: "405", name: "405호", kind: "강의실", floor: 4, cat: "강의실", routeReady: true },
  { id: "401", name: "401호", kind: "강의실", floor: 4, cat: "강의실", routeReady: true },
  { id: "402", name: "402호", kind: "강의실", floor: 4, cat: "강의실", routeReady: true },
  { id: "407", name: "407호", kind: "세미나실", floor: 4, cat: "강의실", routeReady: true },
  { id: "305", name: "305호", kind: "강의실", floor: 3, cat: "강의실", routeReady: false },
  { id: "adm", name: "행정실", kind: "행정", floor: 1, cat: "행정실", routeReady: false },
  { id: "elv", name: "중앙 엘리베이터", kind: "승강기", floor: 1, cat: "엘리베이터", routeReady: false },
  { id: "stA", name: "계단 A", kind: "계단", floor: 1, cat: "계단", routeReady: false },
];

export const CATEGORIES = ["강의실", "행정실", "엘리베이터", "계단", "기타"] as const;
export const FLOORS = [1, 2, 3, 4, 5];

/** Verified demo destination used by presenter shortcuts (id must be a real backend node id in live mode). */
export const DEMO_DEST: Room = { id: "4F-405", name: "405호", kind: "호실", floor: 4, cat: "강의실", routeReady: true };

export const START_NODES: StartNode[] = [
  { id: "here", label: "현위치 표시", x: 44, y: 194 },
  { id: "stair", label: "계단 A", x: 44, y: 62 },
  { id: "hall", label: "엘리베이터 홀", x: 167, y: 112 },
  { id: "main", label: "정문 출입구", x: 167, y: 216 },
];

/** Start choices on the demo 1F map -> verified graph node ids used by POST /api/route. */
export const START_NODE_IDS: Record<StartNodeId, string> = {
  here: "1F-elev-A", // the 1F evacuation map's 현위치 (current_node_id in the seed)
  stair: "1F-stairs-W",
  hall: "1F-elev-A",
  main: "1F-entrance", // 주 출입구
};

export function routeSteps(dest: string, elevUnverified: boolean): RouteStep[] {
  return [
    {
      floor: "1층",
      title: "정면 엘리베이터 홀로 가세요",
      sub: elevUnverified ? "엘리베이터 안 층 버튼을 확인해 주세요" : "이 엘리베이터는 4층에 정차합니다",
      subWarn: elevUnverified,
      turn: "",
      next: "엘리베이터 홀 도착",
      landmark: "엘리베이터 표지",
      cta: "엘리베이터 홀에 왔어요",
      offDemo: false,
    },
    {
      floor: "4층",
      title: "왼쪽 복도로 가세요",
      sub: `${dest}에 도착하면 아래 버튼을 눌러주세요`,
      subWarn: false,
      turn: "좌회전",
      next: `${dest} 도착`,
      landmark: "호실 번호 표지",
      cta: `${dest}에 도착했어요`,
      offDemo: true,
    },
    {
      floor: "4층",
      title: "뒤로 돌아 엘리베이터 홀 쪽으로 가세요",
      sub: "홀을 지나 왼쪽 복도로 직진합니다",
      subWarn: false,
      turn: "뒤로 돌기",
      next: `${dest} 도착`,
      landmark: "호실 번호 표지",
      cta: `${dest}에 도착했어요`,
      offDemo: false,
    },
  ];
}

export interface ScanMeta {
  title: string;
  /** Text the (demo) recognizer read off the sign. */
  read: string;
  /** Instruction shown after a successful match. */
  next: string;
  expect: string;
  guide: string;
  ok: string;
  okCta: string;
  mis: string;
  runLabel: string;
  analyzing: string;
  manualLabel: string;
}

export function scanMeta(target: ScanTarget, dest: string): ScanMeta {
  const run = "데모 인식 실행";
  const analyzing = "표지를 분석하고 있어요";
  switch (target) {
    case "map":
      return { title: "안내도 촬영", read: "안내도 “우정정보관 1층”", next: "현재 위치를 확인한 뒤 목적지를 찾아요.", expect: "층별 안내도 전체", guide: "안내도 전체가 프레임 안에 들어오게 맞춰주세요", ok: "우정정보관 1층 안내도를 찾았어요", okCta: "인식 결과 보기", mis: "인식: 다른 건물 안내도", runLabel: "안내도 촬영", analyzing: "층·복도·엘리베이터 정보를 읽고 있어요", manualLabel: "데모 안내도 사용" };
    case "sign":
      return { title: "주변 표지 확인", read: "방향 표지 “401–404 →”", next: `현재 위치에서 ${dest}까지 경로를 다시 계산해요.`, expect: "주변 층·호실 표지", guide: "현재 위치를 다시 확인할게요", ok: "4층 동측 복도 표지 확인됨", okCta: "복구 결과 보기", mis: "인식: 5층 표지", runLabel: run, analyzing, manualLabel: "직접 선택" };
  }
}

export const NODE_TYPES: Record<NodeType, { short: string; desc: string; def: string }> = {
  room: { short: "방", desc: "호실", def: "새 호실" },
  junction: { short: "교", desc: "복도 교차점", def: "새 교차점" },
  // Elevators and stairs must carry the same label on every floor so the ref matches across floors.
  stairs: { short: "계", desc: "계단", def: "서쪽 계단" },
  elevator_hall: { short: "승", desc: "엘리베이터", def: "중앙 엘리베이터 홀" },
  entrance: { short: "입", desc: "출입구", def: "새 출입구" },
  exit: { short: "출", desc: "출구", def: "새 출구" },
  landmark: { short: "랜", desc: "랜드마크", def: "새 랜드마크" },
};

export const EDITOR_W = 340;
export const EDITOR_H = 230;

/**
 * Normalizes the editor's free-text stop list into backend floor labels.
 * Accepts "1,2,3" (old demo form) and "1F, B1" (contract form); invalid entries become null.
 */
export function parseServedFloors(text: string): (string | null)[] {
  return text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((raw) => {
      const t = raw.toUpperCase();
      const basement = /^B(\d+)$/.exec(t);
      if (basement) return `B${parseInt(basement[1], 10)}`;
      const above = /^(\d+)F$/.exec(t);
      if (above) return `${parseInt(above[1], 10)}F`;
      if (/^-?\d+$/.test(t)) {
        const n = parseInt(t, 10);
        return n < 0 ? `B${-n}` : `${n}F`;
      }
      return null;
    });
}

/** Simulated AI draft for the 2F evacuation map — intentionally contains errors to review. */
/**
 * The 1F demo floor (same layout as FLOOR1 / the start-location pins) as a parsed graph, so the
 * demo and sample paths render with the same map look as a real photo. Plane coords × (340/260, 230/200).
 */
export const DEMO_1F_GRAPH = (() => {
  const sx = (px: number) => Math.round(px * (EDITOR_W / 260));
  const sy = (py: number) => Math.round(py * (EDITOR_H / 200));
  // `block`: FLOOR1 room rect (x, y, w, h) in plane coords, drawn as the room outline.
  const n = (id: string, type: NodeType, label: string, px: number, py: number, block?: [number, number, number, number]): GraphNode => ({
    id, type, label, x: sx(px), y: sy(py), ocr: "", servedFloors: "", src: "ai",
    ...(block ? { outline: [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => ({ x: sx(block[0] + u * block[2]), y: sy(block[1] + v * block[3]) })) } : {}),
  });
  const e = (a: string, b: string): GraphEdge => ({ a, b, src: "ai" });
  return {
    building: BUILDING,
    floor: "1F",
    current_node_id: "1F-here",
    elevators: [],
    nodes: [
      n("1F-here", "junction", "로비", 35, 148),
      n("1F-stairs", "stairs", "계단 A", 35, 46),
      n("1F-elev", "elevator_hall", "엘리베이터 홀", 132, 87),
      n("1F-main", "entrance", "정문 출입구", 132, 186),
      n("1F-jw", "junction", "서측 모서리", 35, 87),
      n("1F-je", "junction", "동측 끝", 240, 87),
      n("1F-d1", "junction", "101 앞", 84, 87),
      n("1F-d2", "junction", "102 앞", 198, 87),
      n("1F-101", "room", "101호", 84, 41, [52, 12, 64, 58]),
      n("1F-102", "room", "102호", 198, 41, [150, 12, 96, 58]),
      n("1F-103", "room", "103호", 84, 133, [52, 104, 64, 58]),
      n("1F-adm", "room", "행정실", 198, 133, [150, 104, 96, 58]),
    ],
    edges: [
      e("1F-stairs", "1F-jw"), e("1F-jw", "1F-here"), e("1F-jw", "1F-d1"), e("1F-d1", "1F-elev"),
      e("1F-elev", "1F-d2"), e("1F-d2", "1F-je"), e("1F-elev", "1F-main"),
      e("1F-101", "1F-d1"), e("1F-103", "1F-d1"), e("1F-102", "1F-d2"), e("1F-adm", "1F-d2"),
    ],
  };
})();

/** Example photo on the capture intro, and a hand-made graph of it (pixel coords of the 1000×635 image). */
export const EXAMPLE_PHOTO = { url: "/examples/evac-map-4f.jpg", w: 1000, h: 635 };
export const EXAMPLE_4F_GRAPH = (() => {
  type Rect = [number, number, number, number]; // x0, y0, x1, y1 in image px
  const X = (px: number) => (px / 1000) * EDITOR_W;
  const Y = (py: number) => (py / 635) * EDITOR_H;
  const n = (id: string, type: NodeType, label: string, px: number, py: number, r?: Rect): GraphNode => ({
    id, type, label, x: X(px), y: Y(py), ocr: "", servedFloors: "", src: "ai",
    ...(r ? { outline: [{ x: X(r[0]), y: Y(r[1]) }, { x: X(r[2]), y: Y(r[1]) }, { x: X(r[2]), y: Y(r[3]) }, { x: X(r[0]), y: Y(r[3]) }] } : {}),
  });
  const rooms: [string, number, number, string, Rect][] = [
    ["406", 391, 242, "dA", [372, 192, 411, 283]], ["405", 430, 242, "dA", [411, 192, 449, 283]], ["404", 471, 242, "dB", [449, 192, 492, 283]],
    ["403", 512, 241, "dB", [492, 192, 532, 283]], ["402", 551, 240, "dC", [532, 192, 572, 283]],
    ["401A", 430, 365, "dA", [380, 312, 474, 415]], ["401B", 525, 364, "dC", [474, 312, 572, 413]], ["401C", 624, 362, "J2", [572, 312, 670, 410]],
    ["413", 346, 338, "J1", [310, 315, 378, 376]], ["412", 343, 404, "J3", [310, 378, 378, 418]],
    ["407B", 125, 372, "J4", [63, 316, 178, 425]], ["407A", 232, 370, "L2", [178, 316, 282, 425]],
    ["408", 126, 509, "J4", [73, 452, 176, 558]], ["409", 229, 507, "L2", [176, 450, 282, 556]],
    ["410", 307, 504, "J3", [282, 448, 333, 554]], ["411", 357, 503, "J5", [333, 448, 383, 554]],
  ];
  const corridors = [["here", "J6"], ["elev", "J6"], ["stW", "J6"], ["J6", "J1"], ["J1", "dA"], ["dA", "dB"], ["dB", "dC"], ["dC", "J2"], ["J2", "stE"], ["J1", "J3"], ["J3", "L2"], ["L2", "J4"], ["J3", "J5"]];
  return {
    building: BUILDING,
    floor: "4F",
    current_node_id: "here",
    elevators: [],
    nodes: [
      n("here", "junction", "현위치", 313, 240),
      n("elev", "elevator_hall", "엘리베이터", 343, 240, [331, 222, 371, 262]),
      n("stW", "stairs", "서측 계단", 200, 262, [182, 240, 272, 290]),
      n("stE", "stairs", "동측 계단", 614, 264, [572, 243, 655, 290]),
      ...([["J6", 295, 265], ["J1", 295, 300], ["dA", 391, 300], ["dB", 471, 300], ["dC", 551, 300], ["J2", 583, 300], ["J3", 295, 435], ["J4", 126, 435], ["L2", 229, 435], ["J5", 330, 435]] as const).map(([id, x, y]) => n(id, "junction", id, x, y)),
      ...rooms.map(([no, x, y, , r]) => n(no, "room", no === "412" || no === "413" ? `${no}호(화장실)` : `${no}호`, x, y, r)),
    ],
    edges: [...corridors.map(([a, b]) => ({ a, b, src: "ai" as const })), ...rooms.map(([no, , , door]) => ({ a: no, b: door, src: "ai" as const }))],
  };
})();

export const SAMPLE_AI_GRAPH: FloorGraph = {
  nodes: [
    { id: "E1", type: "elevator_hall", label: "중앙 엘리베이터 홀", x: 170, y: 120, ocr: "", servedFloors: "", src: "ai" },
    { id: "C1", type: "junction", label: "서측 교차점", x: 100, y: 120, ocr: "", servedFloors: "", src: "ai" },
    { id: "C2", type: "junction", label: "동측 교차점", x: 245, y: 120, ocr: "", servedFloors: "", src: "ai" },
    { id: "R201", type: "room", label: "201호", x: 60, y: 58, ocr: "201", servedFloors: "", src: "ai" },
    { id: "R205", type: "room", label: "2O5호", x: 290, y: 58, ocr: "2O5", servedFloors: "", src: "ai" },
    { id: "S1", type: "stairs", label: "서쪽 계단", x: 42, y: 176, ocr: "", servedFloors: "", src: "ai" },
    { id: "C3", type: "junction", label: "교차점 3", x: 245, y: 186, ocr: "", servedFloors: "", src: "ai" },
  ],
  edges: [
    { a: "E1", b: "C1", src: "ai" },
    { a: "E1", b: "C2", src: "ai" },
    { a: "C1", b: "R201", src: "ai" },
    { a: "C1", b: "S1", src: "ai" },
    { a: "C2", b: "R205", src: "ai" },
  ],
};

/** Demo status of each floor's map data. 2F is the example draft, 3F/5F the upload example, 4F the demo route. */
export const FLOOR_STATUS: FloorStatus[] = [
  { floor: 1, status: "verified", summary: "노드 24 · 간선 31" },
  { floor: 2, status: "draft", summary: "AI 초안 · 수정 필요" },
  { floor: 3, status: "none", summary: "평면도 없음" },
  { floor: 4, status: "verified", summary: "검수 완료 · 데모 경로 사용 중" },
  { floor: 5, status: "none", summary: "평면도 없음" },
];

/** 4F emergency exits — demo data, not field-verified. */
export const EXITS_4F = [
  { name: "계단 A", where: "서측 복도 끝 · 405호에서 왼쪽으로 약 10걸음" },
  { name: "계단 B", where: "동측 복도 끝 · 엘리베이터 홀 지나 오른쪽" },
];

/** Off-route rule (PRD): shown to explain why the warning fired. */
export const DETECTION_RULE = "목표 방향과 60° 넘게 다른 쪽으로 5초 이상 향했어요.";
