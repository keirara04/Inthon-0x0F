#!/usr/bin/env python3
"""results/*.summary.json 중 (작업, 모델)마다 가장 최근 실행을 골라 results/summary.md 표를 만든다.

측정한 값만 들어간다. 실행하지 않은 칸은 '-'로 남는다.

  python ai/eval/make_summary.py
"""

from __future__ import annotations

import json

from common import RESULTS_DIR, fmt


def latest_runs() -> dict[tuple[str, str], dict]:
    latest: dict[tuple[str, str], dict] = {}
    for path in sorted(RESULTS_DIR.glob("*.summary.json")):
        s = json.loads(path.read_text(encoding="utf-8"))
        key = (s["task"], s["model"])
        if key not in latest or s["run"] > latest[key]["run"]:
            latest[key] = s
    return latest


def main() -> None:
    runs = latest_runs()
    models = sorted({m for _, m in runs})
    lat = lambda s: f"{fmt(s.get('latency_s_mean'), digits=1)}s" if s else "-"

    lines = ["# 길결 AI 평가 결과", "",
             "각 (작업, 모델)의 가장 최근 실행 기준. 측정한 값만 기록한다. `-`는 아직 측정하지 않은 항목.", "",
             "## 발표용 요약", "",
             "| 모델 | json_valid | room_recall | current_node_ok | 안내도 응답 | 체크포인트 exact_rate | confident_wrong | threshold | 체크포인트 응답 | 장면 top-3 |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for m in models:
        e, c, s = runs.get(("evac", m)), runs.get(("checkpoint", m)), runs.get(("scene", m))
        at = (c or {}).get("at_recommended") or {}
        lines.append("| " + " | ".join([
            f"`{m}`",
            fmt(e["json_valid"], True) if e else "-",
            fmt(e["room_recall"], True) if e else "-",
            fmt(e["current_node_ok"], True) if e else "-",
            lat(e),
            fmt(at.get("exact_rate"), True) if c else "-",
            str(at.get("confident_wrong", "-")) if c else "-",
            str(c.get("recommended_threshold") or "없음") if c else "-",
            lat(c),
            fmt(s["top3_acc"], True) if s else "-",
        ]) + " |")

    lines += ["", "## 실행 기록", "", "| 작업 | 모델 | 실행 | 사진 수 | CSV |", "|---|---|---|---|---|"]
    for (task, m), s in sorted(runs.items()):
        lines.append(f"| {task} | `{m}` | {s['run']} | {s['n_images']} | {s['csv']} |")

    out = RESULTS_DIR / "summary.md"
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{out} ({len(runs)}개 실행)")


if __name__ == "__main__":
    main()
