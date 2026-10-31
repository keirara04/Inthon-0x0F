# 길결 AI 모듈 (담당: 상후)

피난안내도 → 층 그래프(작업 A), 체크포인트 OCR(작업 B), 장면 인식 백업(작업 C)의 프롬프트·스키마·평가 스크립트입니다.
실제 서비스에서는 Laravel이 이 폴더의 프롬프트와 스키마를 그대로 읽어 OpenRouter를 호출합니다.

```
ai/
  prompts/   evac_map_to_graph.md · checkpoint_ocr.md · scene_recognition.md   (시스템 프롬프트 원문, 파일 전체가 프롬프트)
  schema/    floor_graph · checkpoint · scene .schema.json                     (structured output 스키마 = 팀 공유 규격)
  eval/      run_*_eval.py · make_summary.py · common.py
    data/    evac/ checkpoint/ scene/ (사진, 커밋 안 함) · truth/ (정답 JSON, 커밋함)
    results/ CSV + summary.json + summary.md (커밋함) · raw/ (모델 원본 출력·overlay, 커밋 안 함)
```

## 실행

```bash
pip install -r ai/requirements.txt
cp ai/.env.example ai/.env        # OPENROUTER_API_KEY 입력 (환경변수나 backend/.env에 있어도 됨)

python ai/eval/run_evac_eval.py --model google/gemini-2.5-flash --model google/gemini-2.5-pro --overlay
python ai/eval/run_checkpoint_eval.py --model google/gemini-2.5-flash
python ai/eval/run_scene_eval.py --model google/gemini-2.5-flash
python ai/eval/make_summary.py    # results/summary.md 갱신 (발표 표)
```

**Lablup(대회 제공 API)으로 돌리기:** 모델 id 앞에 `lablup:`을 붙입니다. 키는 `LABLUP_API_KEY`(환경변수 → `ai/.env` → `backend/.env`)에서 읽습니다.
Lablup은 structured output이 없어서 스키마를 프롬프트에 넣고 응답을 파싱합니다 (CSV `format` 열이 `prompt_json`).

```bash
python ai/eval/run_evac_eval.py --model lablup:DeepSeek-V4.1-Flash-B300 --overlay
```

공통 옵션: `--model`(여러 번 지정 가능), `--reasoning low|minimal|medium|high`, `--pattern 'evac_4F_*'`(파일 고르기), `--limit N`, `--max-side PX`(기본: 안내도 2048, 체크포인트·장면 768).
모델 id는 예시입니다. 실제 비교한 모델은 아래 "선택한 모델"에 측정 후 기록합니다.

## 데이터 넣는 법

| 폴더 | 파일 이름 | 정답 |
|---|---|---|
| `data/evac/` | `evac_<층>_<조건>.jpg` (예: `evac_1F_front.jpg`) | `truth/<층>.json` |
| `data/checkpoint/` | `room_<번호>_<조건>.jpg` | `<번호>호`와 그 호실 노드 |
| | `sign_<층>_<조건>.jpg` | 층 `<층>`과 그 층 표지 노드 |
| | `none_<아무거나>.jpg` | `none` (표지 없음) |
| `data/scene/` | `scene_<node_id>_<n>.jpg` (예: `scene_1F-elev-A_01.jpg`) | `<node_id>` |

- `truth/<층>.json`: 명성이 손으로 만든 정답. 형식은 `schema/floor_graph.schema.json`과 같습니다.
- `truth/landmarks.json` (선택): `[{node_id, kind, ocr_text}]`. 없으면 `truth/<층>.json`에서 만듭니다.
  room 노드는 `room_no`로, 층마다 엘리베이터 홀 하나(없으면 계단 → 출입구)는 `floor_sign`으로 씁니다.
- `data/scene/descriptions.json`: `{"1F-elev-A": "엘리베이터 2대, 자판기, 유리문"}`

## 지표 계산 방식

**작업 A (`run_evac_eval.py`)**: 지표는 모델 출력에서 잘못된 노드·간선(없는 노드를 잇는 간선, 범위 밖 좌표)을 버린 뒤 계산합니다.
`json_valid`는 버리기 전의 원본으로 판단합니다.
- `room_recall` / `room_precision`: 호실 라벨을 정규화해서 집합으로 비교합니다 (`405호`, `405 호`, `405` → `405`).
- `current_node_ok`: 정규화한 라벨이 정답 현위치 노드와 같거나, 좌표 거리가 0.08 이내면 맞음.
- `vertical_found`: 계단·엘리베이터 홀·비상구를 타입별 개수로 비교합니다 (Σ min(예측, 정답) / Σ 정답). 사진 구도가 정답 이미지와 달라 좌표로 짝짓기 어렵기 때문입니다.
- `connected`: `current_node_id`에서 BFS로 모든 room에 갈 수 있는지. 현위치가 없으면 false.

**작업 B (`run_checkpoint_eval.py`)**
- 표지 사진에는 정답 노드를 `expected_node_id`로 줍니다 (정상 안내 상황). none 사진에는 파일 이름으로 고정한 임의 노드를 줍니다.
- 기본으로는 예상 노드가 있는 층의 랜드마크만 줍니다. `--all-floors`를 쓰면 전체 층을 줍니다.
- `exact`: 텍스트(정규화)와 노드가 모두 맞음. `confident_wrong`: 기준값 이상의 확신으로 정답이 아닌 노드를 고름 (none 사진에서 노드를 고른 경우 포함).
- 기준값 0.50~0.95마다 `exact_rate` / `confident_wrong` / `none_rate`를 `*_thresholds.csv`에 저장합니다.
  추천 기준값은 `confident_wrong = 0`이 되는 가장 낮은 값입니다.

**작업 C (`run_scene_eval.py`)**: 정답 노드의 층 노드 목록과 설명을 주고 top-1·top-3 정확도를 계산합니다.

## Laravel에서 호출하는 방법

OpenRouter `POST https://openrouter.ai/api/v1/chat/completions`:

```json
{
  "model": "google/gemini-3.8-flash",
  "temperature": 0,
  "reasoning": { "effort": "low" },
  "messages": [
    { "role": "system", "content": "<ai/prompts/evac_map_to_graph.md 파일 전체>" },
    { "role": "user", "content": [
      { "type": "text", "text": "건물 힌트: 우정정보관\n층 힌트: 4F\n이 피난안내도를 층 그래프 JSON으로 변환하라." },
      { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
    ]}
  ],
  "response_format": { "type": "json_schema", "json_schema": {
    "name": "floor_graph", "strict": true,
    "schema": "<ai/schema/floor_graph.schema.json에서 $schema, $id 키를 뺀 것>"
  }},
  "provider": { "require_parameters": true },
  "usage": { "include": true }
}
```

응답의 `choices[0].message.content`가 JSON 문자열입니다.

| 작업 | 시스템 프롬프트 | 스키마 (name) | user 텍스트 | 이미지 긴 변 |
|---|---|---|---|---|
| A | `evac_map_to_graph.md` | `floor_graph` | `건물 힌트: …\n층 힌트: …\n이 피난안내도를 층 그래프 JSON으로 변환하라.` | 2048px |
| B | `checkpoint_ocr.md` | `checkpoint` | `expected_node_id: 4F-405\nlandmarks: [{"node_id":…,"kind":…,"ocr_text":…}, …]` | 768px |
| C | `scene_recognition.md` | `scene` | `nodes: [{"id","type","label"}…]\nlandmark_descriptions: [{"node_id","description"}…]` | 768px |

서버에서 꼭 할 후처리:
- **A**: 없는 노드를 잇는 간선, 0~1 범위 밖 좌표, 중복 id를 버립니다 (`run_evac_eval.py`의 `clean_graph`와 같은 규칙). 저장 상태는 `draft`이고, 사람이 검수해야 `verified`가 됩니다.
- **B**: `match`는 모델 값을 믿지 말고 `matched_node_id == expected_node_id`로 다시 계산합니다. `matched_node_id`가 landmarks 목록에 없으면 null로 봅니다. `confidence < 기준값`이면 none으로 처리합니다 (기준값은 아래에 기록).
- provider가 `json_schema`를 거부하면 `{"type": "json_object"}`로 한 번 더 시도합니다 (평가 스크립트도 이렇게 하고, CSV의 `format` 열에 남깁니다).

## 규격 메모 (팀 공유)

- 출력은 팀 공유 그래프 JSON 형식과 같습니다 (필드 추가 없음).
- `heading_deg`: 북쪽 0°, 시계 방향. 안내도에 방위표가 없으면 **안내도 위쪽을 북쪽으로 간주**하므로, 실제 방위와 다를 수 있습니다 (백엔드에서 층별 보정값을 더하면 됨).
- `building`, `floor`는 안내도와 힌트 둘 다에서 알 수 없으면 빈 문자열입니다. `current_node_id`는 현위치를 못 찾으면 null입니다.
- 한 장의 안내도에서는 `walk` 간선만 나옵니다. 층 사이 `stairs`·`elevator` 간선은 백엔드가 층 그래프를 합칠 때 만듭니다.

## 선택한 모델 · 기준값 (측정 후 기록)

작업 A 응답 시간 실험 (2026-10-31, 사진 7장): 이미지 1536/1024px, reasoning minimal, 간선 속성 빼기(출력 축소)는
정확도를 지키면서 빨라지지 않았고, `gemini-3.5-flash-lite`는 7.6s로 빠르지만 엘리베이터를 3/7만 찾아 제외했다.
reasoning을 기본값으로 두면 품질은 같고 2.5배 느리다.

| 작업 | 모델 | 기준값 | 근거 |
|---|---|---|---|
| A | `google/gemini-3.8-flash`, `reasoning: {effort: "low"}`, 이미지 긴 변 2048px | - | 1F·2F·4F 사진 7장: 호실·현위치·연결 100%, 응답 약 13~22s (2026-10-31, 정답은 검수 전 초안) |
| B | (미정) | (미정) | |
| C | (미정) | - | |
