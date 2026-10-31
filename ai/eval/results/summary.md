# 길결 AI 평가 결과

지금 시드(정답 버전 `a0620d64`)로 채점한 실행 중 (작업, 모델)마다 가장 최근 것. 측정한 값만 기록한다. `-`는 측정하지 않았거나 해당 없음.

## 작업 A: 피난안내도 → 층 그래프

| 모델 | 사진 (정답 있음) | json_valid | room_recall | room_precision | current_node_ok | vertical | ref_match | floor_ok | 엘리베이터 수 | connected | 응답 평균 / 최대 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash (reasoning=low) 1280px` | 7 (4) | 100% | 97% | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 17.4s / 24.3s |

## 작업 B: 체크포인트 (문패·층 표지)

| 모델 | 사진 (표지 / 표지 없음) | read | matched | mismatch 감지 | false_match | none | 응답 평균 / p50 / 최대 |
|---|---|---|---|---|---|---|---|
| `google/gemini-3.5-flash-lite (reasoning=low) 768px` | 20 (16 / 4) | 100% | 100% | 100% | 0/467 | 100% | 1.9 / 1.8 / 3.1s |
| `google/gemini-3.8-flash (reasoning=low) 768px` | 20 (16 / 4) | 100% | 100% | 100% | 0/467 | 100% | 3.5 / 3.6 / 4.3s |

## 배포 서버 전체 응답 시간 (업로드 → 응답, `run_e2e_latency.py`)

정답 채점 없음 (시간만). 배포 서버의 프롬프트·모델 기준.

| 작업 | 실행 | 성공/전체 | 평균 | p50 | 최소 / 최대 |
|---|---|---|---|---|---|
| checkpoint | 20261031-211430 | 20/20 | 2.6s | 2.5s | 1.9s / 3.2s |
| evac | 20261031-211825 | 6/7 | 25.9s | 25.1s | 23.3s / 29.4s |

## 실행 기록 (모든 실행, 예전 시드 포함)

| 작업 | 모델 | 실행 | 사진 수 | 정답 버전 | CSV |
|---|---|---|---|---|---|
| checkpoint | `google/gemini-3.5-flash-lite (reasoning=low) 768px` | 20261031-210419_2 | 20 | a0620d64 ✅ | checkpoint_google_gemini-3.5-flash-lite_r-low_px768_20261031-210419_2.csv |
| checkpoint | `google/gemini-3.5-flash-lite 1280px` | 20261031-170412 | 10 | (기록 없음) | checkpoint_google_gemini-3.5-flash-lite_px1280_20261031-170412.csv |
| checkpoint | `google/gemini-3.5-flash-lite 768px` | 20261031-172510 | 10 | (기록 없음) | checkpoint_google_gemini-3.5-flash-lite_px768_20261031-172510.csv |
| checkpoint | `google/gemini-3.8-flash (reasoning=low) 768px` | 20261031-210419 | 20 | a0620d64 ✅ | checkpoint_google_gemini-3.8-flash_r-low_px768_20261031-210419.csv |
| e2e_checkpoint | `deployed https://inthon-api.hakeemiridza.com 1280px` | 20261031-211430 | 20 | (기록 없음) | e2e_checkpoint_px1280_20261031-211430.csv |
| e2e_evac | `deployed https://inthon-api.hakeemiridza.com 1280px` | 20261031-211825 | 7 | (기록 없음) | e2e_evac_px1280_20261031-211825.csv |
| evac | `google/gemini-3.5-flash-lite` | 20261031-160841 | 7 | (기록 없음) | evac_google_gemini-3.5-flash-lite_20261031-160841.csv |
| evac | `google/gemini-3.8-flash` | 20261031-152011 | 3 | (기록 없음) | evac_google_gemini-3.8-flash_20261031-152011.csv |
| evac | `google/gemini-3.8-flash (reasoning=low)` | 20261031-162343 | 7 | (기록 없음) | evac_google_gemini-3.8-flash_r-low_20261031-162343.csv |
| evac | `google/gemini-3.8-flash (reasoning=low) 1280px` | 20261031-210418 | 7 | a0620d64 ✅ | evac_google_gemini-3.8-flash_r-low_px1280_20261031-210418.csv |
| evac | `google/gemini-3.8-flash (reasoning=low) 2048px` | 20261031-203234 | 3 | (기록 없음) | evac_google_gemini-3.8-flash_r-low_px2048_20261031-203234.csv |
| evac | `google/gemini-3.8-flash (reasoning=low) compact` | 20261031-162341 | 7 | (기록 없음) | evac_google_gemini-3.8-flash_r-low_compact_20261031-162341.csv |
| evac | `google/gemini-3.8-flash (reasoning=minimal)` | 20261031-160839 | 7 | (기록 없음) | evac_google_gemini-3.8-flash_r-minimal_20261031-160839.csv |
| evac | `lablup:DeepSeek-V4.1-Flash-B300` | 20261031-151355 | 3 | (기록 없음) | evac_lablup_DeepSeek-V4.1-Flash-B300_20261031-151355.csv |
