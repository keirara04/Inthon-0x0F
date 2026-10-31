// Demo data from the Claude Design handoff (Gilgyeol Prototype v2).
// Not field-verified — real API / team-reviewed graphs take precedence.
import type {
  DirectionState,
  FloorGraph,
  HapticPattern,
  NodeType,
  Room,
  RouteStep,
  ScanTarget,
  StartNode,
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
  dir: { name: "방향 맞추기", label: "가까울수록 펄스 간격이 짧아짐", p: [40, 600, 40, 300, 40, 120, 40, 120, 40] },
  left: { name: "왼쪽 회전", label: "짧게–짧게", p: [80, 90, 80] },
  right: { name: "오른쪽 회전", label: "길게–길게", p: [320, 140, 320] },
  floor: { name: "층 이동", label: "짧게 3회", p: [90, 70, 90, 70, 90] },
  arrive: { name: "도착", label: "길게 1회 + 짧게 2회", p: [520, 160, 90, 110, 90] },
  off: { name: "이탈 경고", label: "아주 짧게 3회", p: [40, 50, 40, 50, 40] },
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

export const CATEGORIES = ["강의실", "행정실", "엘리베이터", "계단"] as const;
export const FLOORS = [1, 2, 3, 4, 5];

export const START_NODES: StartNode[] = [
  { id: "here", label: "현위치 표시", x: 44, y: 194 },
  { id: "stair", label: "계단 A", x: 44, y: 62 },
  { id: "hall", label: "엘리베이터 홀", x: 167, y: 112 },
  { id: "main", label: "정문 출입구", x: 167, y: 216 },
];

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
      sub: `${dest} 표지를 확인해 주세요`,
      subWarn: false,
      turn: "좌회전 · 진동 짧게–짧게",
      next: `${dest} 문패 확인`,
      landmark: "호실 번호 표지",
      cta: `${dest} 앞에 왔어요`,
      offDemo: true,
    },
    {
      floor: "4층",
      title: "뒤로 돌아 엘리베이터 홀 쪽으로 가세요",
      sub: "홀을 지나 왼쪽 복도로 직진합니다",
      subWarn: false,
      turn: "방향 전환 · 뒤로 돌기",
      next: `${dest} 문패 확인`,
      landmark: "호실 번호 표지",
      cta: `${dest} 앞에 왔어요`,
      offDemo: false,
    },
  ];
}

export interface ScanMeta {
  title: string;
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
      return { title: "안내도 촬영", expect: "층별 안내도 전체", guide: "안내도 전체가 프레임 안에 들어오게 맞춰주세요", ok: "우정정보관 1층 안내도를 찾았어요", okCta: "인식 결과 보기", mis: "인식: 다른 건물 안내도", runLabel: "촬영 · 데모 인식", analyzing: "층·복도·엘리베이터 정보를 읽고 있어요", manualLabel: "데모 안내도 사용" };
    case "floor4":
      return { title: "체크포인트 확인", expect: "4층 층 표지", guide: "층 표지나 호실 번호를 화면에 맞춰주세요", ok: "4층 확인됨", okCta: "다음 안내 듣기", mis: "인식: 3층", runLabel: run, analyzing, manualLabel: "층 직접 선택" };
    case "sign":
      return { title: "체크포인트 확인", expect: "주변 층·호실 표지", guide: "현재 위치를 다시 확인할게요", ok: "4층 동측 복도 표지 확인됨", okCta: "복구 결과 보기", mis: "인식: 5층 표지", runLabel: run, analyzing, manualLabel: "직접 선택" };
    case "door":
      return { title: "체크포인트 확인", expect: `${dest} 문패`, guide: "호실 번호를 화면에 맞춰주세요", ok: `${dest} 확인됨`, okCta: "도착 완료", mis: "인식: 404호", runLabel: run, analyzing, manualLabel: "직접 확인" };
  }
}

export const NODE_TYPES: Record<NodeType, { short: string; desc: string; def: string }> = {
  room: { short: "방", desc: "호실", def: "새 호실" },
  junction: { short: "교", desc: "복도 교차점", def: "새 교차점" },
  stairs: { short: "계", desc: "계단", def: "새 계단" },
  elevator_hall: { short: "승", desc: "엘리베이터", def: "새 엘리베이터" },
  entrance: { short: "입", desc: "출입구", def: "새 출입구" },
  exit: { short: "출", desc: "출구", def: "새 출구" },
  landmark: { short: "랜", desc: "랜드마크", def: "새 랜드마크" },
};

export const EDITOR_W = 340;
export const EDITOR_H = 230;

/** Simulated AI draft for the 4F evacuation map — intentionally contains errors to review. */
export const SAMPLE_AI_GRAPH: FloorGraph = {
  nodes: [
    { id: "E1", type: "elevator_hall", label: "중앙 엘리베이터 A", x: 170, y: 120, ocr: "", servedFloors: "", src: "ai" },
    { id: "C1", type: "junction", label: "서측 교차점", x: 100, y: 120, ocr: "", servedFloors: "", src: "ai" },
    { id: "C2", type: "junction", label: "동측 교차점", x: 245, y: 120, ocr: "", servedFloors: "", src: "ai" },
    { id: "R401", type: "room", label: "401호", x: 60, y: 58, ocr: "401", servedFloors: "", src: "ai" },
    { id: "R405", type: "room", label: "4O5호", x: 290, y: 58, ocr: "4O5", servedFloors: "", src: "ai" },
    { id: "S1", type: "stairs", label: "계단 A", x: 42, y: 176, ocr: "", servedFloors: "", src: "ai" },
    { id: "C3", type: "junction", label: "교차점 3", x: 245, y: 186, ocr: "", servedFloors: "", src: "ai" },
  ],
  edges: [
    { a: "E1", b: "C1", src: "ai" },
    { a: "E1", b: "C2", src: "ai" },
    { a: "C1", b: "R401", src: "ai" },
    { a: "C1", b: "S1", src: "ai" },
    { a: "C2", b: "R405", src: "ai" },
  ],
};
