# 길결 AI 평가 결과

각 (작업, 모델)의 가장 최근 실행 기준. 측정한 값만 기록한다. `-`는 아직 측정하지 않은 항목.

## 발표용 요약

| 모델 | json_valid | room_recall | current_node_ok | 안내도 응답 | 체크포인트 exact_rate | confident_wrong | threshold | 체크포인트 응답 | 장면 top-3 |
|---|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.5-flash-lite` | 100% | - | - | 7.6s | - | - | - | - | - |
| `google/gemini-3.8-flash` | 100% | - | - | 38.0s | - | - | - | - | - |
| `google/gemini-3.8-flash (reasoning=low)` | 100% | 100% | 100% | 16.4s | - | - | - | - | - |
| `google/gemini-3.8-flash (reasoning=low) compact` | 100% | 100% | 100% | 15.8s | - | - | - | - | - |
| `google/gemini-3.8-flash (reasoning=minimal)` | 100% | - | - | 18.8s | - | - | - | - | - |
| `lablup:DeepSeek-V4.1-Flash-B300` | 67% | - | - | 47.2s | - | - | - | - | - |

## 실행 기록

| 작업 | 모델 | 실행 | 사진 수 | CSV |
|---|---|---|---|---|
| evac | `google/gemini-3.5-flash-lite` | 20261031-160841 | 7 | evac_google_gemini-3.5-flash-lite_20261031-160841.csv |
| evac | `google/gemini-3.8-flash` | 20261031-152011 | 3 | evac_google_gemini-3.8-flash_20261031-152011.csv |
| evac | `google/gemini-3.8-flash (reasoning=low)` | 20261031-162343 | 7 | evac_google_gemini-3.8-flash_r-low_20261031-162343.csv |
| evac | `google/gemini-3.8-flash (reasoning=low) compact` | 20261031-162341 | 7 | evac_google_gemini-3.8-flash_r-low_compact_20261031-162341.csv |
| evac | `google/gemini-3.8-flash (reasoning=minimal)` | 20261031-160839 | 7 | evac_google_gemini-3.8-flash_r-minimal_20261031-160839.csv |
| evac | `lablup:DeepSeek-V4.1-Flash-B300` | 20261031-151355 | 3 | evac_lablup_DeepSeek-V4.1-Flash-B300_20261031-151355.csv |
