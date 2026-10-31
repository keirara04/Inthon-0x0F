# 길결 AI 평가 (담당: 상후)

피난안내도 → 층 그래프(작업 A), 체크포인트 OCR(작업 B), 장면 인식 백업(작업 C)을 **prod와 같은 조건으로** 재는 평가 스크립트입니다.

**원본은 백엔드 하나입니다.** 평가는 아래 파일을 직접 읽으므로, 프롬프트를 고치면 prod와 평가에 같이 반영됩니다.

| 무엇 | 위치 | prod에서 쓰는 곳 |
|---|---|---|
| 시스템 프롬프트 | `backend/resources/prompts/{evac-map,checkpoint,scene}.md` | `VisionClient` (파일 전체를 그대로 보냄) |
| 출력 스키마 | `backend/resources/schemas/{evac-map,checkpoint,scene}.json` | `VisionClient` (strict structured output) |
| 정답 그래프 | `backend/database/seeders/data/<건물>-<층>.json` (아래 '정답 시드') | `GraphSeeder` |
| 체크포인트 매칭 규칙 | `ai/eval/matcher.py` = `backend/app/Services/CheckpointMatcher.php` 이식 | `CheckpointMatcher` |

`matcher.py`는 PHP와 한 줄씩 맞춰 둔 사본입니다. **`CheckpointMatcher.php`나 `GraphImporter`의 랜드마크 저장 규칙을 바꾸면 `matcher.py`도 같이 바꿔 주세요.** (`scene`은 아직 백엔드 API에 연결되지 않았습니다.)

```
ai/
  eval/      run_evac_eval.py · run_checkpoint_eval.py · run_scene_eval.py · matcher.py · make_summary.py · common.py
    data/    evac/ checkpoint/ scene/ (사진, 커밋 안 함)
    results/ CSV + summary.json + summary.md (커밋함) · raw/ (모델 원본 출력·overlay, 커밋 안 함)
```

## 실행

```bash
pip install -r ai/requirements.txt
# OPENROUTER_API_KEY는 환경변수 → ai/.env → backend/.env 순서로 찾습니다 (커밋 금지)

python ai/eval/run_evac_eval.py --model google/gemini-3.8-flash --reasoning low --overlay
python ai/eval/run_checkpoint_eval.py --model google/gemini-3.8-flash --reasoning low
python ai/eval/run_scene_eval.py --model google/gemini-3.8-flash --reasoning low
python ai/eval/run_e2e_latency.py --task checkpoint   # 배포 API 전체 응답 시간 (evac도 가능, 비용은 배포 서버 키)
python ai/eval/make_summary.py    # results/summary.md 갱신 (발표 표)
```

공통 옵션: `--model`(여러 번 지정 가능), `--reasoning low|minimal|medium|high`(prod는 low), `--pattern 'evac_4F_*'`(파일 고르기),
`--limit N`, `--building 우정정보관`, `--max-side PX`(기본: 안내도 2048, 체크포인트·장면 768. `0`이면 원본 그대로).
prod 업로드는 2MB 제한이고 클라이언트가 1280px 이하로 줄이므로, prod 조건은 `--max-side 1280`입니다.

**Lablup(대회 제공 API):** 모델 id 앞에 `lablup:`을 붙입니다 (`LABLUP_API_KEY`). structured output이 없어서 스키마를 프롬프트에 넣고 파싱합니다.

## 데이터 넣는 법

| 폴더 | 파일 이름 | 정답 |
|---|---|---|
| `data/evac/` | `evac_<층>_<조건>.jpg` (예: `evac_1F_front.jpg`) | 시드 `<건물>-<층>.json` |
| `data/checkpoint/` | `room_<번호>_<조건>.jpg` (예: `room_401A_far.jpg`) | 시드에서 라벨이 `<번호>호`인 노드 |
| | `sign_<층>_<조건>.jpg` | 그 층 표지 (시드의 엘리베이터 홀·계단 노드) |
| | `none_<아무거나>.jpg` | 표지 없음 |
| `data/scene/` | `scene_<node_id>_<n>.jpg` (예: `scene_4F-elev-A_01.jpg`) | `<node_id>` |

- `data/scene/descriptions.json`: `{"4F-elev-A": "엘리베이터 2대, 자판기, 유리문"}`
- 시드에 없는 층(예: 2F)의 사진은 정답 없이 JSON 형식·연결·응답 시간만 잽니다.
- 체크포인트: 이름에 `poster`가 들어간 사진은 기본으로 뺍니다 (우정정보관에 포스터가 없음. 넣으려면 `--exclude ""`).
  `--rooms-from-photos`는 시드가 임시본일 때 사진 이름의 호실을 랜드마크로 보태는 비상용 옵션입니다 (지금 시드에서는 필요 없음).

### 정답 시드 (2026-10-31)

| 층 | 만든 방법 | 내용 |
|---|---|---|
| 4F | 피난안내도 사진을 벡터 도면으로 딴 결과(`vector-plan-1.2`, DeepSeek-V4.1-Flash, `review_required`)를 그대로 변환 | 호실 16개(401A~C, 402~406, 407A/B, 408~411, 412/413), 엘리베이터 홀 1 (`elev-1`, 현위치), 계단 2 (`stairs-1` 서, `stairs-2` 동), 복도 junction |
| 1F | 상후가 `evac_1F_front` 사진을 보고 직접 땀 | 호실 9개(101~105, 106/106A, 107/107A), 엘리베이터 홀 1 (`elev-1`, 현위치), 계단 2, 주 출입구, 동쪽 출구 |

- 거리(`length_m`)는 추정값입니다 (도면 1px = 0.05m, 405호 폭 ≈ 3.6m 기준). 방향은 좌표로 계산 (안내도 위쪽 = 0°).
- 둘 다 AI·사람이 사진에서 딴 것이라 측량 도면이 아닙니다. 실제 층과 대조해 고치면 `truth_version`(시드 해시)이 바뀌고, `make_summary.py`는 새 시드로 채점한 실행만 발표 표에 넣습니다.
- 정답 좌표는 펴진 도면 기준이고 모델 출력은 사진 기준이라 **좌표를 직접 비교하는 지표는 없습니다** (현위치는 노드 종류로, 윤곽은 방 중심점으로 축을 맞춘 뒤 비교).

## 지표

**작업 A (`run_evac_eval.py`)**: user 문장은 prod와 같은 `건물: <건물>, 층: <층>`. 지표는 잘못된 노드·간선을 버린 뒤 계산하고, `json_valid`는 원본으로 판단합니다.
- `room_recall` / `room_precision`: 호실 라벨 정규화 후 집합 비교 (`405호` = `405`)
- `current_node_ok`: 현위치 노드가 정답 현위치와 같은 종류(예: 엘리베이터 홀)이거나, 예측 그래프 안에서 가장 가까운 시설이 그 종류인지
- `vertical_found`: 계단·엘리베이터 홀·비상구 타입별 개수 비교
- `connected`: 현위치에서 모든 room에 갈 수 있는지 (BFS)
- `ref_match`: 계단·엘리베이터 노드의 (type, ref) 집합이 정답과 같은지 → 층 연결이 맞는지
- `floor_ok`: 안내도에서 읽은 층(`EvacMapParser::readFloor`와 같은 규칙)이 정답 층과 같은지
- `elevator_count_ok`: elevator_hall 개수가 정답과 같은지 (승강로 하나 = 엘리베이터 하나)
- `outline_coverage` / `outline_iou`: 방 윤곽을 낸 비율 / 같은 번호 방끼리 윤곽 bbox IoU. **지금 프롬프트는 윤곽을 내지 않으므로 비어 있음** (아래 실험 참고)
- `corridor_axis_ok`: 복도끼리 잇는 간선의 방향이 0/90/180/270°에서 15° 이내인 비율 (모델이 쓴 `heading_deg` 기준. prod `EvacMapParser`는 heading을 좌표로 다시 계산함)

**작업 B (`run_checkpoint_eval.py`)**: AI는 글자만 읽고(`{text, kind}`), 매칭은 `matcher.py`(= `CheckpointMatcher`)가 합니다.
AI 호출은 사진당 한 번, 매칭은 여러 '예상 노드'로 돌려 봅니다.
- `read`: 정답 글자를 `canonical()`로 읽어냈는지
- `matched`: 예상 노드 = 실제 위치일 때 `matched`가 나온 비율 (정상 안내)
- `mismatch 감지`: 예상 노드 = 다른 위치일 때 `mismatch`가 나온 비율 (길 잘못 듦)
- **`false_match`**: 다른 위치를 예상했는데 `matched`가 나온 횟수 / 확인한 횟수. **0이어야 합니다** (틀린 곳에서 "맞다"고 하는 가장 나쁜 실패).
  호실 사진은 라벨이 다른 모든 호실을, 층 표지 사진은 다른 층의 모든 노드를 예상 노드로 넣어 봅니다. none 사진은 모든 노드에서 `unknown`이어야 합니다.
- `latency avg/p50/max`

**작업 C (`run_scene_eval.py`)**: 정답 노드의 층 노드 목록과 설명을 주고 top-1·top-3 정확도.

## 선택한 모델 · 측정 기록

| 작업 | 설정 | 근거 (측정한 값만) |
|---|---|---|
| A | `google/gemini-3.8-flash`, reasoning low, 1280px | 사진 7장(1F 1·2F 3·4F 3, 정답은 1F·4F 4장): json 100%, 호실 recall 97%·precision 100%, 현위치·계단/엘리베이터·ref·층·엘리베이터 수·연결 100%, 응답 평균 17.4s / 최대 24.3s (1회) |
| B | `google/gemini-3.5-flash-lite`, reasoning low, 768px | 20장(문패 13: 4F 12·1F 1, 층 표지 3, 표지 없음 4) × 2회: read·matched·mismatch 감지 100%, **false_match 0/467**, none 100%, 응답 p50 1.8s / 최대 3.1s. 비교: gemini-3.8-flash 1회 같은 정확도, p50 3.6s |
| C | 미정 | |

자세한 표는 `ai/eval/results/summary.md` (`python ai/eval/make_summary.py`로 갱신). 모두 2026-10-31 측정.

- 작업 A에서 놓친 호실은 `evac_4F_angle`(약 30° 돌아간 사진)의 화장실 412·413 하나뿐이다 (번호 없이 "화장실"로 읽음).
- 작업 B 문패: 끝 글자만 다른 401A/B/C·407A/B, 한 자리 차이 404/405/406, 문패 위 기수 동판, 흔들린 사진(404·405), 같은 102 판 3개가 붙은 1F 사진 모두 맞음. 1F 문패는 1장뿐이라 1F 결과는 이 정도만 말할 수 있다.

**윤곽(outline) 실험** (2026-10-31, 4F 사진 3장, gemini-3.8-flash low 1280px, 각 1회): main의 PR #16이 방 윤곽 출력을 추가한 뒤

| | 출력 토큰 평균 | 응답 평균 | 호실 recall |
|---|---|---|---|
| 윤곽 추가 전 | 2,720 | 18.4s | (당시 임시 정답) |
| 윤곽 있음 | 5,435 | 27.5s | 96% (윤곽 IoU 0.43, 돌아간 사진은 0.06) |
| 윤곽 뺌 | 3,696 | 21.4s | 100% |

→ 윤곽 규칙·필드를 프롬프트·스키마에서 뺐다 (응답 30s 한계에 가까워서). `EvacMapParser`의 윤곽 정리 코드는 그대로라 다시 넣으면 바로 동작한다.

**배포 서버 전체 응답 시간** (`run_e2e_latency.py`, 2026-10-31 21:14~21:19 KST, 각 1회): 앱처럼 1280px JPEG(품질 0.7)로 줄여
`https://inthon-api.hakeemiridza.com`에 보내고, 업로드부터 응답을 다 받을 때까지 잼 (네트워크·Laravel·AI 포함).

| 작업 | 성공 | 평균 | p50 | 최소 / 최대 |
|---|---|---|---|---|
| 체크포인트 `POST /api/checkpoint` | 20/20 | 2.6s | 2.5s | 1.9s / 3.2s |
| 피난안내도 `POST /api/evac-map/parse` | 6/7 | 25.9s | 25.1s | 23.3s / 29.4s |

- `evac_4F_front`(노드가 가장 많은 사진, 직접 호출로 24.3s·출력 4,190토큰)는 **두 번 다 약 31s에 HTTP 500**이 났다.
  Laravel HTTP 타임아웃은 60s라서, PHP 기본 실행 제한 30s에 걸린 것으로 보인다 (서버 로그로 확인하지는 않음).
- 이때 배포 서버는 **아직 윤곽을 내는 예전 프롬프트**였다 (1F 응답 노드 17개 중 10개에 `outline`). 그래서 직접 호출(윤곽 뺌, 평균 17.4s)보다 느리다.
  이 브랜치가 배포되면 다시 재야 한다. 배포 서버의 체크포인트 모델(`OPENROUTER_CHECKPOINT_MODEL`)은 밖에서 확인할 수 없다.
- 배포 DB는 예전 임시 시드(노드 `1F-101`, `1F-lobby`, `4F-401`, `4F-405`)라서, DB에 없는 호실 사진은 `expected_node=4F-405`로 보냈다.
  응답 시간은 기대 노드와 상관없고, 이 실행의 matched/unknown 결과는 정확도로 쓰지 않는다.

### 예전 기록 (임시 정답·임시 세트, 참고용)

**작업 A 응답 시간 실험** (2026-10-31, 사진 7장): 이미지 1536/1024px, reasoning minimal, 간선 속성 빼기(출력 축소)는 정확도를 지키면서 빨라지지 않았고,
`gemini-3.5-flash-lite`는 7.6s로 빠르지만 엘리베이터를 3/7만 찾았다. reasoning 기본값은 품질이 같고 2.5배 느리다.
prod 프롬프트(ref 포함)로 2048px 19.3s / 1280px 18.3s (각 1회, 7장).

**작업 B 지연 임시 측정** (2026-10-31, prod 프롬프트·스키마·user 문장, 사진 3장 × 2회: 합성 문패 1 + 실제 폰 사진 2. 실제 문패 사진으로 다시 잴 것):

| 모델 | 이미지 | 평균 | p50 | 최대 |
|---|---|---|---|---|
| gemini-3.8-flash (low) | 원본 4000px | 8.3s | 7.4s | 15.5s |
| gemini-3.8-flash (low) | 1280px | 7.8s | 7.7s | 12.7s |
| gemini-3.8-flash (low) | 768px | 5.1s | 5.2s | 6.0s |
| gemini-3.8-flash (low) | 512px | 6.1s | 6.3s | 9.4s |
| gemini-3.5-flash-lite | 1280px | 2.9s | 2.9s | 3.1s |
| gemini-3.5-flash-lite | 768px | 2.4s | 2.5s | 2.8s |

**ref 규칙 영향 확인** (2026-10-31, 사진 7장, gemini-3.8-flash low 2048px, 사진 대조 초안 정답 aabf456으로 채점, 각 1회):
ref 있음 / 없음 = 호실 recall·precision 100% / 100%, 현위치 100% / 100%, 연결 100% / 100%, vertical 90% / 95%, 응답 19.4s / 19.3s.
→ ref 규칙은 품질을 떨어뜨리지 않는다. 1280·2048px 실행의 room_recall 62%·current 0%는 시드 정답이 임시값이라서다
(시드 4F 호실 "401호"는 실제 401A~C와 다르고, 시드 현위치 좌표가 사진과 다름).

**작업 B 임시 세트 정확도** (2026-10-31, 10장: 실제 폰 사진의 안내판 층 표시 4 + 실제 사진에서 자른 벽·포스터·엘리베이터 표시등 5 + 합성 문패 1.
실제 문패 사진으로 다시 잴 것):

| 모델 | 이미지 | 실행 | read | matched | false_match | none | 응답 avg / p50 / max |
|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | 768px | 2 | 80% / 80% | 80% / 80% | 0/64 / 0/64 | 100% / 100% | 2.2 / 2.2 / 2.8s · 2.1 / 2.1 / 2.6s |
| gemini-3.5-flash-lite | 1280px | 1 | 80% | 80% | 0/64 | 100% | 2.2 / 2.2 / 2.7s |
| gemini-3.8-flash (low) | 768px | 1 | 100% | 100% | 0/64 | 100% | 5.5 / 4.0 / 10.4s |

flash-lite가 틀린 사진은 모두 안내판 옆에 **엘리베이터 위치 표시등("6")**이 같이 찍힌 사진으로, 층 표지 대신 "6"을 읽었다 (결과는 unknown이라 오안내는 아님).

→ `checkpoint.md`에 "엘리베이터 위치 표시등은 층 표지가 아님 / 안내판·계단참의 층 표시는 floor_sign" 규칙 추가 후 (같은 10장):

| 모델 | 이미지 | 실행 | read | matched | false_match | none | 응답 avg / p50 / max |
|---|---|---|---|---|---|---|---|
| gemini-3.5-flash-lite | 768px | 2 | 100% / 100% | 100% / 100% | 0/64 / 0/64 | 100% / 100% | 2.2 / 2.2 / 2.8s · 2.3 / 2.2 / 2.7s |
| gemini-3.8-flash (low) | 768px | 1 | 100% | 100% | 0/64 | 100% | 3.9 / 3.8 / 4.9s |

중간에 표시등을 "주황·빨강 LED"로 설명했더니 flash-lite가 안내판의 빨간 "1F"까지 무시해서(2회 모두 none) 색 설명을 빼고 모양으로 바꿨다.
이 10장에 맞춰 고친 규칙이라 실제 문패·층 표지 사진으로 다시 확인해야 한다.

## 규격 메모 (팀 공유)

- `heading_deg`: 안내도 위쪽 = 0°, 시계 방향. **실제 나침반 방위가 아님** → 층별 방위 보정 필요
- `ref`: 모델 형식(`stairs-1`, `elev-1`, 왼쪽(서쪽)부터 번호)으로 통일 (2026-10-31 키미 결정). 시드의 ref 값도 이 형식으로 바뀜. 노드 id(`1F-elev-A` 등)는 프론트가 쓰므로 그대로
- 체크포인트 매칭 (키미 `feat/keira-ref-roomletter`, `matcher.py` 반영): 호실 끝 글자 보존(`401A호` → `401A`, 랜드마크도 같은 함수로 저장), 지하 호실 `B101`은 호실·`B1`은 층, 엘리베이터 표시등 `6`은 null. 카메라가 `301`만 읽으면 `301A/B` 중 못 고르므로 unknown. `python ai/eval/matcher.py`로 PHP 테스트(VisionTest) 기대값 22개를 검사
- 한 장의 안내도에서는 `walk` 간선만 나옵니다. 층 사이 간선은 `GraphImporter::linkFloors`가 `ref`로 만듭니다.
