# 어디路 프론트엔드 개발 노트

실내 길찾기 서비스 **어디路**(어디로)의 모바일 웹 프론트엔드(Next.js) 개발 현황 정리입니다.
대표 시나리오: 우정정보관 1층 로비 → 4층 405호.

- 기준 디자인: Claude Design 핸드오프 `Gilgyeol Prototype v2.dc.html` (밝은 배경 · 버건디 · Pretendard)
- 기능 레퍼런스: 팀 화면 흐름 목업 8장 (안내도 촬영 → 3D·위치 확인 → 경로 → 진동 안내 → 체크포인트 → 이탈 → 도착 → 관리자)
- 브랜치: `frontend`

---

## 1. 실행

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # 배포 전 확인 (output: standalone)
npx eslint src
npx tsc --noEmit
```

| 환경 변수 | 기본값 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Laravel 백엔드 주소 (배포: `https://inthon-api.hakeemiridza.com`) |
| `NEXT_PUBLIC_GILGYEOL_API` | (없음 = `mock`) | `live`로 두면 실제 API 호출. 미설정 시 목업 데이터 |
| `NEXT_PUBLIC_GILGYEOL_ADMIN_TOKEN` | (없음) | `PUT /api/graph`의 `X-Admin-Token`. 빌드에 포함되므로 배포 환경변수로만 설정 |

- 카메라(`getUserMedia`)는 **HTTPS 또는 localhost**에서만 동작합니다. 같은 Wi-Fi의 폰에서 `http://<PC IP>:3000`으로 열면 카메라는 막히고 수동 체크포인트로 진행합니다.
- 기본 화면에는 **사용자가 보는 앱 화면만** 나옵니다. 넓은 화면(≥760px)에서는 390×844 기기 프레임 안에, 폰에서는 전체 화면으로 실행됩니다.
- 발표·테스트용 **시연 패널**은 `http://localhost:3000/?demo`로 열 때만 보입니다 (넓은 화면: 기기 오른쪽, 폰: `설정` 시트 하단).
- 화면 안의 점선 **데모 입력 박스**(방향 센서 시뮬레이션, 폰 들기, 반대 복도 이동, 승강기 데이터 상태)와 스캐너의 **데모 결과 선택**도 `?demo`일 때만 보입니다. 기본 모드에서 스캔은 항상 `성공` 결과로 진행합니다. (`lib/gilgyeol/demo.ts`의 `useDemoTools`)

---

## 2. 기술 스택과 규칙

- Next.js 16.4.3 (App Router, Turbopack, `cacheComponents`), React 19.3, TypeScript, Tailwind CSS 4
- `frontend/AGENTS.md`: Next 16은 이전 버전과 다르므로 `node_modules/next/dist/docs/`를 먼저 확인
  - `viewport` / `metadata`는 서버 컴포넌트(`layout.tsx`)에서만 export
  - 상호작용 화면은 모두 `"use client"` 클라이언트 컴포넌트
- 핸드오프 런타임(`support.js`, `x-dc`, `DCLogic`)은 사용하지 않고 React로 재작성
- 폰트: Pretendard Variable (jsDelivr CDN, `layout.tsx`의 `<link>`)

---

## 3. 폴더 구조

```text
frontend/src/
  app/
    layout.tsx            # lang=ko, viewport(viewportFit: cover), Pretendard 로드
    page.tsx              # <AppShell /> 하나만 렌더
    manifest.ts           # PWA manifest (/manifest.webmanifest)
    globals.css           # 디자인 토큰(@theme), 기기 프레임/안전 영역, 펄스 애니메이션
  components/gilgyeol/
    AppShell.tsx          # Provider + 기기 프레임 + 화면 스위치 + cue/toast/설정 시트 오버레이
    ui.tsx                # 공통 UI (PrimaryButton, BackHeader, Badge, DemoBox 등)
    IsoFloor.tsx          # 3D(아이소메트릭) 층 도식, 회전 훅/버튼
    WelcomeScreen.tsx  LandingScreen.tsx  BuildingScreen.tsx  CaptureIntroScreen.tsx  MapResultScreen.tsx
    TrialScreen.tsx  TrialGuide.tsx   # 3분 체험 진입 화면 / 실제 화면 위 가이드 오버레이
    StartLocationScreen.tsx  SearchScreen.tsx  RoutePreviewScreen.tsx  ModeScreen.tsx
    GuidanceScreen.tsx  ElevatorScreen.tsx  CheckpointScanner.tsx  OffRouteScreen.tsx
    ArrivalScreen.tsx  GraphEditorScreen.tsx  SettingsSheet.tsx  DemoPanel.tsx
  lib/gilgyeol/
    types.ts              # Screen, GuideMode, DirectionState, ScanTarget, GraphNode 등
    data.ts               # 색상 상수, 진동 패턴, 방 목록, 경로 단계, 스캔 문구, 샘플 그래프 (데모 데이터)
    store.tsx             # 앱 상태 + 액션 (GilgyeolProvider / useGilgyeol)
    feedback.ts           # 진동·음성 capability 래퍼
    api.ts                # API 어댑터 (mock / live)
```

---

## 4. 화면 흐름

라우트는 `/` 하나이고, 화면 전환은 `store.tsx`의 typed `screen` 상태로 합니다.

```text
landing (3분 체험해보기) → trial → welcome → building → captureIntro → scan(map) → mapResult → start(여기 계신가요?)
  → search(405호) → preview → mode → guide(step 0, 1층)
  → elevator → guide(step 1, 4층 왼쪽 복도)
  → offroute(경고) → scan(sign) → offroute(confirm) → guide(step 2, 복구)   ※ 경로 이탈 시에만
  → arrive
```

첫 화면은 랜딩(`landing`)이고, 랜딩의 `3분 체험해보기` CTA는 체험 안내 화면(`trial`)으로 들어갑니다. `trial`의 `3분 체험 시작`은 **실제 앱 화면 위에 가이드 오버레이**를 켜고 `captureIntro`(우정정보관 안내도 사진 선택)로 바로 들어갑니다 — 별도 데모 화면을 복제하지 않고, 실제 컨트롤을 눌러야만 다음 단계로 넘어갑니다. `체험 없이 사용하기`는 실제 흐름의 첫 화면인 `welcome`으로 갑니다. `welcome` 하단의 `서비스 소개`로 랜딩에 다시 갈 수 있어요.

### 3분 체험 오버레이 (`TrialGuide.tsx`)

- 흐름: `captureIntro`(1/8) → `mapResult`(2/8) → `start`(3/8) → `search`(4/8) → `preview`(5/8) → `mode`(6/8) → `guide`·`elevator`(7/8) → `arrive`(8/8, 체험 종료). 실제 앱의 `scan`·`offroute`는 체험에 넣지 않았습니다(경로 이탈은 실제 센서 조건에서만 발생).
- 각 단계는 화면의 실제 컨트롤에 붙은 `data-trial="…"` 앵커를 찾아 흰 테두리 + 흰 글로우 + 나머지 영역 딤(`box-shadow: 0 0 0 9999px`)으로 강조합니다. 오버레이 루트는 `pointer-events-none`이라 터치를 막지 않고, 설명 카드만 `pointer-events-auto`입니다.
- 대상 컨트롤이 화면 밖으로 밀리면(예: 랜드마크 목록 열림) 900ms 간격으로 `scrollIntoView` 해 따라갑니다. 위치는 120ms 폴링 + scroll/resize로 다시 재고, 390px 폭에서 설명 카드가 강조 대상과 겹치지 않도록 위/아래 중 여유 있는 쪽에 놓습니다.
- 다음 단계로 넘어가는 유일한 방법은 **강조된 실제 버튼/입력을 조작하는 것**입니다. 오버레이에는 장식용 가짜 진행 버튼이 없고, `체험 종료`만 예외입니다.
- 안내도 파싱이 실패하면(`scanState === "fail"`) 오버레이를 유지한 채 "안내도를 읽지 못했어요" 카드로 `사진 다시 고르기` / `데모 안내도로 계속` / `체험 종료`를 제공합니다.
- `actions.startTrial()` / `actions.endTrial(toLanding)`이 상태를 정리하고, 체험 중 뒤로 가기도 체험을 종료합니다(`trialOn: false`).

| 단계 | 화면 | `data-trial` 앵커 | 문구 요지 |
|---|---|---|---|
| 1/8 | captureIntro | `capture-album` (앨범에서 선택) | 저장해 둔 안내도 사진을 고르기 (카메라 아님) |
| 2/8 | mapResult | `map-confirm` (이 안내도가 맞아요) | AI가 읽은 안내도 확인, mock 모드면 샘플 데이터 안내 |
| 3/8 | start | `start-landmarks` → `start-main` → `start-confirm` | 출발 위치 지정·확인 (파싱에 현위치가 있으면 `start-main`부터) |
| 4/8 | search | `search-input` → `dest-405` | ‘405호’ 입력 후 결과 선택 |
| 5/8 | preview | `preview-next` (안내 방식 선택) | 경로 확인 후 이동 준비 |
| 6/8 | mode | `mode-start` (진동·음성 안내 시작) | 기본 안내 방식 그대로 시작 |
| 7/8 | guide · elevator | `guide-next` → `elev-leave` | 방향 화면 따라 이동, 4층에서 내리기 (하위 화면이 바뀌어도 단계 번호 유지) |
| 8/8 | arrive | `arrive-title` (도착 제목) | 405호 도착, 체험 종료 |

### 카메라 확인 시점

| 시점 | 읽는 것 | 진입 |
|---|---|---|
| 안내 시작 전 | 1층 피난안내도 | `카메라 켜기` (`데모 안내도 불러오기`로 생략 가능) |
| 경로 이탈 시에만 | 주변 층·호실 표지 | 이탈 경고의 `주변 표지 확인` 또는 자세 감지 중 폰 들기 |

4층 하차와 목적지(405호) 도착은 카메라 확인 없이 사용자가 버튼(`4층에서 내렸어요`, `405호에 도착했어요`)으로 진행합니다.

```text
welcome → editor (관리자 · 지도 만들기)
```

| Screen | 파일 | 핵심 기능 |
|---|---|---|
| `landing` | LandingScreen | 첫 화면. 히어로·경로 요약·안내 방식(AI가 안내도를 읽음)·하은의 3분·FAQ·CTA, `3분 체험해보기` → `trial` |
| `trial` | TrialScreen | 3분 체험 안내. 하은 페르소나, 실제 8단계 오버레이 안내, `3분 체험 시작` → `captureIntro`(+`trialOn`), `체험 없이 사용하기` → `welcome` |
| `welcome` | WelcomeScreen | 시연용 배지, 설정, 길찾기 시작, 관리자 진입, 서비스 소개(→ `landing`), 비상 시 고지 |
| `building` | BuildingScreen | 우정정보관 선택, 정운오IT교양관 준비 중 |
| `captureIntro` | CaptureIntroScreen | 촬영 안내·권한 이유·개인정보, 카메라 켜기 / 데모 안내도 |
| `mapResult` | MapResultScreen | 인식 결과(건물·층 확인됨, 현위치 추정), 데모/OCR 미연결 라벨 |
| `start` | StartLocationScreen | 안내도 / **3D 보기** 탭, 위치 수정, 랜드마크 직접 선택, 위치 확정 전 CTA 비활성 |
| `search` | SearchScreen | 검색, 분류 칩, 층 필터, 로딩/오류/재시도/결과 없음, 미지원 목적지 토스트 |
| `preview` | RoutePreviewScreen | 출발/도착 요약, 2D 층별 도식 / **3D 적층 경로**, "N단계" 단계 카드 |
| `mode` | ModeScreen | 진동+음성 / 음성만 / 화면만, 진동 테스트, 미지원 안내 |
| `guide` | GuidanceScreen | 방향 링·펄스, 폰 자세 상태, 진동 강도 막대·패턴 범례, 2D/3D 미니맵, 데모 입력, 전체 경로, 다시 듣기/종료 |
| `elevator` | ElevatorScreen | 4층 이동, 정차 확인/미확인 상태, 층 표시 스트립 |
| `scan` | CheckpointScanner | 대상: map(안내도) / sign(이탈 시 주변 표지). 상태: aim·analyzing·success·mismatch·fail·denied, 수동 선택 |
| `offroute` | OffRouteScreen | 경고 → 층·랜드마크 선택 → 위치 재확인 → 새 경로 |
| `arrive` | ArrivalScreen | 도착, **이동 통계**(소요 시간·층 이동·경로 재확인), **비상구 정보** |
| `editor` | GraphEditorScreen | **층별 데이터 목록**, 이미지 업로드/샘플, AI 초안(시뮬레이션), SVG 그래프 편집, 검증, draft/verified 저장 |

뒤로 가기: 화면의 뒤로 버튼과 브라우저/안드로이드 하드웨어 뒤로 가기(`popstate`)가 같은 `actions.back()`을 탑니다. 랜딩과 환영 화면은 앱의 첫 화면이라 하드웨어 뒤로 가기는 앱을 나갑니다. `trial`의 뒤로 가기는 `landing`입니다.

---

## 5. 상태 관리 (`lib/gilgyeol/store.tsx`)

- `useState` + 동기 `ref` 미러(`update(patch)`): 연속 액션과 타이머가 항상 최신 상태를 읽도록 함
- 컴포넌트는 `const { state, actions } = useGilgyeol()`로 사용

주요 상태

| 그룹 | 필드 |
|---|---|
| 위치 | `mapDemo`, `start`, `locEdit`, `landmarks` |
| 검색 | `query`, `cat`, `floorPick`, `dest` |
| 안내 | `mode`, `vibe`, `voice`, `view`, `dir`, `step`, `routeOpen` |
| 스캔 | `scanTarget`, `scanFrom`, `scanState`, `outcome`, `manual` |
| 이탈 | `offState`, `offFloor`, `offSign` |
| 자세 | `raised`, `postureSensor` |
| 통계 | `trip: { startedAt, arrivedAt, reroutes }` |
| 시연 대체 상태 | `simNoVibe`, `camDenied`, `elevUnverified` |
| 오버레이 | `sheet`, `toast`, `cue` |
| 체험 | `trialOn` (가이드 오버레이 표시 여부) |

주요 액션: `go`, `back`, `startTrial`, `endTrial`, `beginTrip`, `startGuide`, `setDir`, `toElevator`, `openScan`, `runScan`, `cancelScan`, `scanNext`, `toOffroute`, `arrive`, `pickDest`, `endGuide`, `setMode`, `replay`, `testVibe`, `playPattern`, `toggleVoice`, `setRaised`, `enablePosture`

---

## 6. 진동 · 음성 · 센서

`feedback.ts`가 지원 여부를 확인하고 실패를 삼킵니다. 미지원이면 화면 배너와 음성/문구로 대체합니다.

| 상황 | 패턴 (ms) | 비고 |
|---|---|---|
| 방향 맞추기 | 주기 펄스 (벗어남 1.4s / 가까움 0.7s / 일치 0.3s) | `guide` 화면에서 반복, 불안정이면 정지 |
| 왼쪽 회전 | 80,90,80 | 짧게–짧게 |
| 오른쪽 회전 | 320,140,320 | 길게–길게 |
| 층 이동 | 90,70,90,70,90 | 짧게 3회 |
| 표지 확인 성공 | 60 | 짧게 1회 (이탈 후 주변 표지) |
| 도착 | 520,160,90,110,90 | 길게 1회 + 짧게 2회 |
| 경로 이탈 | 40,50,40,50,40 | 아주 짧게 3회 |

- 음성: Web Speech API `ko-KR`. 안내 종료 시 발화·진동 취소
- iPhone은 `navigator.vibrate`가 없어 진동 미지원 배너가 뜸 (네이티브 브리지 없음)
- **폰 자세 감지**: `DeviceOrientationEvent` 기울기 > 60° = 들음, < 35° = 내림
  - iOS는 `requestPermission()`을 버튼 탭에서 요청
  - 들면: 이탈 경고 화면(offroute)에서만 주변 표지 스캔을 엽니다. 일반 안내 중에는 카메라를 켜지 않습니다
  - 내리면: 스캔 대기 중일 때 이전 안내 화면으로 복귀
  - 센서가 없으면 데모 버튼 `폰 들어 표지 비추기`로 동일 동작
- **카메라**: 스캐너의 `실제 카메라 켜기`로 후면 카메라 미리보기. 이탈 시 표지 확인에서 프레임 1장을 `POST /api/checkpoint`로 보내며, 백엔드는 저장하지 않습니다. 권한 거부 시 `denied` 상태와 수동 선택으로 전환

---

## 7. API 어댑터 (`lib/gilgyeol/api.ts`)

화면은 직접 `fetch`하지 않고 어댑터만 호출합니다. `NEXT_PUBLIC_GILGYEOL_API=live`가 아니면 **mock이 기본**입니다. 백엔드 응답은 모두 `{ data: ... }`로 감싸여 있어 어댑터에서 풀어 줍니다.

| 함수 | live 엔드포인트 | mock 동작 | 사용처 |
|---|---|---|---|
| `searchPlaces(q)` | `GET /api/search?q=` | `ROOMS` 필터 | SearchScreen (로딩/오류/재시도) |
| `parseEvacMap(file, building, floor)` | `POST /api/evac-map/parse` (multipart `image`, `building`, `floor: "4F"`) | 1.5초 후 `SAMPLE_AI_GRAPH` | GraphEditor AI 초안 |
| `saveFloorGraph({ building, floor, graph, status, replace })` | `PUT /api/graph` (`X-Admin-Token`, 0–1 좌표, `elevators[]`) | 0.4초 지연 | GraphEditor 저장 |
| `fetchRoute(start, dest)` | `POST /api/route` (`start_node`, `dest_node`) | 오류 | 아직 화면 미연결 |
| `checkCheckpoint(blob, expectedNode)` | `POST /api/checkpoint` (multipart `image`, `expected_node`) | 1.2초 후 `matched` | CheckpointScanner (카메라 켜짐 + live) |

변환 규칙:
- 검색 결과 `{id,label,type,floor:"4F",building}` → `Room` (`label→name`, `floor→4`, `type→cat`). `id`는 **노드 id 그대로** 두고 `route`/`checkpoint`에 씁니다.
- 빈 검색어는 백엔드가 422라서 `q=우정정보관`으로 전체 목록을 받고, 분류·층 필터는 화면에서 클라이언트 필터로 적용합니다.
- 안내도 파싱 좌표는 0–1 비율 → 에디터 캔버스(340×230)로, 저장할 때 다시 0–1로 변환합니다.
- 저장 시 노드 id에 `<층>-` 접두어를 붙이고, 엘리베이터·계단은 `ref`(층 연결 키)를 함께 보냅니다. `servedFloors`는 `1F`/`B1` 형식으로 변환합니다.
- 검수된 층을 덮어쓸 때만 `replace: true` — draft 저장이 verified 데이터를 지우지 않도록 editor는 `status === "verified"`일 때만 보냅니다.

원칙: 안내도 파싱 결과는 항상 `draft`로 시작하고, 사람이 검수한 `verified` 그래프만 사용자 안내에 사용합니다.

---

## 8. 그래프 에디터 (관리자)

- 층별 상태 목록: 1F 검수 완료(요약만), 2F 초안(샘플 초안, 에디터 기본 진입 층), 3F·5F 업로드, 4F 검수 완료·데모 경로 사용 중, 현재 편집 층 실시간 상태
- 저장하지 않은 수정이 있으면 층 전환을 막음
- 캔버스: 340×230 단위 SVG, 관리자에게는 0–1 비율로 표시. 포인터 이벤트로 마우스·터치 동시 지원
- 노드 유형: room, junction, stairs, elevator_hall, entrance, exit, landmark
- 엘리베이터·계단 기본 이름은 백엔드 시드와 같은 `중앙 엘리베이터 홀`, `서쪽 계단` — 층마다 같은 이름이어야 `ref`가 맞아 층간 연결이 됩니다
- 표시 규칙: AI 추출 = 보라 점선, 사람이 수정 = 진한 실선, 검증 오류 = 빨간 테두리
- 검증 (`validateGraph`): 연결 없는 노드, 없는 노드로의 간선, 자기 연결, `served_floors` 누락·형식 오류·현재 층 미포함, 호실 번호 형식(`405호`)
- 저장: `draft 저장` / `verified로 저장`(오류 0개 + 확인 다이얼로그)
- `엘리베이터 정차 층 편집`: 첫 elevator_hall 노드를 선택하고 `served_floors` 입력으로 포커스
- 업로드 이미지는 Object URL로 메모리에만 두고 교체·이탈 시 해제

---

## 9. 디자인 토큰 (`globals.css` `@theme`)

| 토큰 | 값 | 용도 |
|---|---|---|
| `ink` | `#202421` | 기본 텍스트 |
| `muted` | `#5E625D` | 보조 텍스트 |
| `brand` | `#7A1832` | 주요 CTA·선택 |
| `route` | `#2864A0` | 경로선·층 도식 |
| `haptic` | `#5B4AB8` | 진동/방향 피드백 |
| `success` | `#25734B` | 확인·도착 |
| `warning` | `#965900` | 추정·확인 필요 |
| `error` | `#B3261E` | 이탈·오류 |
| `app-bg` | `#F6F5F1` | 앱 바탕 |
| `line` / `edge` | `#E3E0D7` / `#D9D5CB` | 구분선 / 테두리 |
| `warm-panel` | `#EFEDE7` | 비활성·보조 패널 |
| `haptic-tint` | `#EEEBFA` | 진동 관련 보조 버튼 |

- 터치 타깃 44px 이상, 주요 CTA 52–60px
- 상태는 색 + 텍스트/아이콘 병기, 결과·오류는 `role="status"` / `role="alert"`
- `prefers-reduced-motion`이면 펄스 애니메이션 정지 (텍스트 안내는 유지)
- 안전 영역: `viewportFit: cover` + `env(safe-area-inset-*)`

---

## 10. 실제 기능과 시연(데모)의 구분

| 항목 | 상태 |
|---|---|
| 진동 · 음성 | 기기가 지원하면 **실제 동작** |
| 카메라 미리보기 · 체크포인트 인식 | **실제 동작** (HTTPS/localhost + live + 카메라 켜짐). `matched` → 다음 단계, `mismatch` → 현재 위치에서 재경로, `unknown` → 재촬영 |
| 폰 자세 감지 | **실제 센서** (권한 필요), 데모 버튼 대체 |
| 안내도 OCR | **데모**: 샘플 결과, 실제 OCR 미연결 |
| 주변 표지 인식 | **실제 동작** (카메라 켜짐 + live). 카메라를 끄면 `?demo` 선택값/기본 성공으로 대체 |
| 방향 센서 | **실제 나침반** (`useNavigation`). `?demo`에서는 벗어남/가까움/일치/불안정 버튼 |
| 경로 이탈 감지 | **실제**: 목표와 60° 이상 다른 방향을 5초 유지하면 경고. `?demo`는 `반대 복도로 이동해 보기`로 재현 |
| 건물·경로·비상구·층 상태 데이터 | **데모 데이터**, 현장 검증 아님 |
| 3D 도식 | 그래프 기반 도식이며 실제 건물 스캔 아님 |

시연 패널(`?demo`에서만 표시)의 대체 상태 토글: 진동 미지원 기기, 카메라 권한 거부, 승강기 정차 미확인, 방향 센서 불안정.

---

## 11. 검증 내역

- `npx tsc --noEmit`, `npx eslint src`, `npm run build` 통과
- Edge(headless, 390×844)로 안내도 촬영 → 위치 확인(3D) → 검색 → 경로(3D) → 안내 → 엘리베이터 → 4층 → 이탈 → 주변 표지 → 복구 → 도착(비상구) → 관리자(초안·정차 층 편집) 전체 흐름 클릭 확인, 콘솔 오류 없음
- 3분 체험: 같은 환경에서 `landing → trial → 3분 체험 시작 → captureIntro → mapResult → start → search → preview → mode → guide → elevator → guide → arrive` 8단계 오버레이를 실제 컨트롤 클릭으로 통과 확인. 사진은 숨은 `<input type="file">`에 실제 파일을 넣어 선택(카메라 화면 없음), 콘솔 오류 없음. 실패·성공 양쪽 파싱 결과와 파싱 실패 대체 카드 확인
- 실제 휴대폰에서 진동·음성·카메라·자세 센서는 **아직 확인하지 않음**
- 백엔드 `POST /api/evac-map/parse`가 현재 HTTP 500(약 32초 후)을 반환해, 체험판은 파싱 실패 시 데모 안내도로 이어가는 대체 경로를 제공합니다

---

## 12. 남은 작업

- [ ] 실제 기기 테스트 (Android 진동, iOS 음성·자세 권한, HTTPS 환경 카메라)
- [ ] 백엔드 `search` / `evac-map/parse` / `graph` 연동 완료(어댑터 기준). 화면에서 `NEXT_PUBLIC_GILGYEOL_API=live`로 전환해 확인
- [ ] 경로 단계를 `POST /api/route` 응답 기준으로 렌더 (현재 고정 3단계 + 405호 기준 문구)
- [ ] 실제 방향 센서(heading) 기반 방향 상태와 이탈 감지(60°/5초)
- [ ] 그래프 에디터 층별 세션 유지 (현재 층 전환 시 이전 편집 세션 초기화)
- [ ] PWA 아이콘(192/512 PNG) 추가, 오프라인 지원 검토

---

## 13. Git 규칙

- 원격: `https://github.com/keirara04/Inthon-0x0F.git`
- 프론트 작업 브랜치: `frontend` (main 직접 푸시 금지)
- 커밋 메시지 접두어: `feat<전소현>` (기능) / `fix<전소현>` (수정)

| 커밋 | 내용 |
|---|---|
| `8f80219` | feat<전소현> 길결 모바일 프로토타입 화면 구현 |
| `d3058ee` | feat<전소현> 화면 흐름 레퍼런스 기능 반영 |
| `5d43f9b` | fix<전소현> 기본 화면에서 시연 패널 숨김, 개발 노트 추가 |
| `103ae56` | fix<전소현> 데모 입력 박스와 데모 결과 선택을 ?demo 모드에서만 표시 |
