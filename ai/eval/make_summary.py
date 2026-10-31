#!/usr/bin/env python3
"""results/*.summary.json 중 (작업, 모델)마다 가장 최근 실행을 골라 results/summary.md 표를 만든다.

측정한 값만 들어간다. 실행하지 않은 칸은 '-'로 남는다.
발표용 표에는 **지금 시드(정답)로 채점한 실행만** 넣는다 (summary의 truth_version = 현재 시드 해시).
예전 시드(임시 정답)로 채점한 실행은 실행 기록 표에만 남는다.

  python ai/eval/make_summary.py [--building 우정정보관]
"""

from __future__ import annotations

import argparse
import json

from common import RESULTS_DIR, fmt, truth_version


def latest_runs(only_version: str | None = None) -> dict[tuple[str, str], dict]:
    latest: dict[tuple[str, str], dict] = {}
    for path in sorted(RESULTS_DIR.glob("*.summary.json")):
        s = json.loads(path.read_text(encoding="utf-8"))
        if only_version and s.get("truth_version") != only_version:
            continue
        if s["task"] == "checkpoint" and "matched_rate" not in s:
            continue  # 백엔드 설계(AI 읽기 + 코드 매칭) 이전 형식
        key = (s["task"], s["model"])
        if key not in latest or s["run"] > latest[key]["run"]:
            latest[key] = s
    return latest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--building", default="우정정보관")
    args = ap.parse_args()
    version = truth_version(args.building)

    current = latest_runs(version)
    lat = lambda s: f"{fmt(s.get('latency_s_mean'), digits=1)}s" if s else "-"
    pct = lambda s, k: fmt(s.get(k), True) if s else "-"

    lines = ["# 길결 AI 평가 결과", "",
             f"지금 시드(정답 버전 `{version}`)로 채점한 실행 중 (작업, 모델)마다 가장 최근 것. 측정한 값만 기록한다. "
             "`-`는 측정하지 않았거나 해당 없음.", ""]

    evac = sorted((m, s) for (t, m), s in current.items() if t == "evac")
    lines += ["## 작업 A: 피난안내도 → 층 그래프", "",
              "| 모델 | 사진 (정답 있음) | json_valid | room_recall | room_precision | current_node_ok | vertical | "
              "ref_match | floor_ok | 엘리베이터 수 | connected | 응답 평균 / 최대 |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for m, s in evac:
        lines.append("| " + " | ".join([
            f"`{m}`", f"{s['n_images']} ({s.get('n_with_truth', '-')})",
            pct(s, "json_valid"), pct(s, "room_recall"), pct(s, "room_precision"), pct(s, "current_node_ok"),
            pct(s, "vertical_found"), pct(s, "ref_match"), pct(s, "floor_ok"), pct(s, "elevator_count_ok"),
            pct(s, "connected"), f"{lat(s)} / {fmt(s.get('latency_s_max'), digits=1)}s",
        ]) + " |")
    if not evac:
        lines.append("| (아직 없음) |" + " - |" * 11)

    ckpt = sorted((m, s) for (t, m), s in current.items() if t == "checkpoint")
    lines += ["", "## 작업 B: 체크포인트 (문패·층 표지)", "",
              "| 모델 | 사진 (표지 / 표지 없음) | read | matched | mismatch 감지 | false_match | none | 응답 평균 / p50 / 최대 |",
              "|---|---|---|---|---|---|---|---|"]
    for m, s in ckpt:
        lines.append("| " + " | ".join([
            f"`{m}`", f"{s['n_images']} ({s['n_sign']} / {s['n_none']})",
            pct(s, "read_rate"), pct(s, "matched_rate"), pct(s, "mismatch_detected"),
            f"{s['false_match']}/{s['false_match_checks']}", pct(s, "none_rate"),
            f"{fmt(s.get('latency_s_mean'), digits=1)} / {fmt(s.get('latency_s_p50'), digits=1)} / "
            f"{fmt(s.get('latency_s_max'), digits=1)}s",
        ]) + " |")
    if not ckpt:
        lines.append("| (아직 없음) |" + " - |" * 7)

    scene = sorted((m, s) for (t, m), s in current.items() if t == "scene")
    if scene:
        lines += ["", "## 작업 C: 장면 인식", "", "| 모델 | 사진 | top-1 | top-3 | 응답 평균 |", "|---|---|---|---|---|"]
        for m, s in scene:
            lines.append(f"| `{m}` | {s['n_images']} | {pct(s, 'top1_acc')} | {pct(s, 'top3_acc')} | {lat(s)} |")

    e2e = sorted((t, s) for (t, m), s in latest_runs().items() if t.startswith("e2e_"))
    if e2e:
        lines += ["", "## 배포 서버 전체 응답 시간 (업로드 → 응답, `run_e2e_latency.py`)", "",
                  "정답 채점 없음 (시간만). 배포 서버의 프롬프트·모델 기준.", "",
                  "| 작업 | 실행 | 성공/전체 | 평균 | p50 | 최소 / 최대 |", "|---|---|---|---|---|---|"]
        for t, s in e2e:
            lines.append(f"| {t.removeprefix('e2e_')} | {s['run']} | {s['n_ok']}/{s['n_images']} | {lat(s)} | "
                         f"{fmt(s.get('latency_s_p50'), digits=1)}s | {fmt(s.get('latency_s_min'), digits=1)}s / "
                         f"{fmt(s.get('latency_s_max'), digits=1)}s |")

    lines += ["", "## 실행 기록 (모든 실행, 예전 시드 포함)", "",
              "| 작업 | 모델 | 실행 | 사진 수 | 정답 버전 | CSV |", "|---|---|---|---|---|---|"]
    for (task, m), s in sorted(latest_runs().items()):
        tv = s.get("truth_version") or "(기록 없음)"
        mark = " ✅" if tv == version else ""
        lines.append(f"| {task} | `{m}` | {s['run']} | {s['n_images']} | {tv}{mark} | {s['csv']} |")

    out = RESULTS_DIR / "summary.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out} (지금 시드 기준 {len(current)}개 실행, 정답 버전 {version})")


if __name__ == "__main__":
    main()
