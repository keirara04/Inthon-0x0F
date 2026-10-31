#!/usr/bin/env python3
"""작업 C 평가: 표지가 안 보이는 프레임 → 후보 노드 상위 3개.

정답은 파일 이름에서: scene_<node_id>_<n>.jpg (예: scene_1F-elev-A_01.jpg → 1F-elev-A)
층 그래프는 시드 그래프(backend/database/seeders/data/<건물>-<층>.json), 랜드마크 설명은 data/scene/descriptions.json ({"<node_id>": "엘리베이터 2대, 자판기"}).
사용자가 있는 층은 이전 체크포인트로 안다고 보고, 그 층의 노드만 준다.

  python ai/eval/run_scene_eval.py --model google/gemini-2.5-flash
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from common import (DATA_DIR, RESULTS_DIR, call_vision, fmt, list_images, load_image, load_prompt,
                    load_schema, load_truth, mean, model_tag, print_table, run_stamp, schema_errors, to_data_url, write_csv,
                    write_summary_json)


def truth_node(path: Path) -> str:
    m = re.match(r"scene_(.+)_\d+$", path.stem)
    if not m:
        raise ValueError(f"파일 이름 규칙에 맞지 않음: {path.name} (scene_<node_id>_<n>.jpg)")
    return m.group(1)


def load_floor(building: str, floor: str) -> dict:
    graph = load_truth(building, floor)
    if graph is None:
        raise SystemExit(f"시드 그래프가 없습니다: {building}-{floor}.json")
    return graph


def user_message(graph: dict, descriptions: dict[str, str]) -> str:
    nodes = [{"id": n["id"], "type": n["type"], "label": n.get("label", "")} for n in graph["nodes"]]
    ids = {n["id"] for n in nodes}
    desc = [{"node_id": k, "description": v} for k, v in descriptions.items() if k in ids]
    return (f"nodes: {json.dumps(nodes, ensure_ascii=False)}\n"
            f"landmark_descriptions: {json.dumps(desc, ensure_ascii=False)}")


def run_model(model: str, images: list[Path], args, system: str, schema: dict, descriptions: dict, stamp: str) -> dict:
    rows, floors = [], {}
    for img_path in images:
        truth = truth_node(img_path)
        floor = truth.split("-", 1)[0]
        graph = floors.setdefault(floor, load_floor(args.building, floor))
        res = call_vision(model, system, user_message(graph, descriptions),
                          to_data_url(load_image(img_path), args.max_side), schema, "scene",
                          reasoning=args.reasoning)
        cands = sorted((res["data"] or {}).get("candidates") or [], key=lambda c: -float(c.get("score") or 0))[:3]
        ids = [c.get("node_id") for c in cands]
        row = {
            "image": img_path.name, "truth_node": truth,
            "top1": ids[0] if ids else None, "top3": " ".join(map(str, ids)),
            "scores": " ".join(f"{float(c.get('score') or 0):.2f}" for c in cands),
            "reason_top1": cands[0].get("reason") if cands else None,
            "top1_ok": bool(ids) and ids[0] == truth, "top3_ok": truth in ids,
            "json_valid": res["data"] is not None and not schema_errors(schema, res["data"]),
            "latency_s": round(res["latency_s"], 2) if res["latency_s"] else None,
            "cost_usd": res["cost_usd"], "error": res["error"],
        }
        rows.append(row)
        print(f"  {img_path.name}: {ids} {'✅' if row['top3_ok'] else '❌'} {row['latency_s']}s {res['error'] or ''}")

    csv_path = RESULTS_DIR / f"scene_{model_tag(model, args.reasoning)}_{stamp}.csv"
    write_csv(csv_path, rows)
    summary = {
        "task": "scene", "model": model + (f" (reasoning={args.reasoning})" if args.reasoning else ""), "run": stamp, "n_images": len(rows),
        "json_valid": mean([float(r["json_valid"]) for r in rows]),
        "top1_acc": mean([float(r["top1_ok"]) for r in rows]),
        "top3_acc": mean([float(r["top3_ok"]) for r in rows]),
        "latency_s_mean": mean([r["latency_s"] for r in rows]),
        "latency_s_max": max((r["latency_s"] for r in rows if r["latency_s"]), default=None),
        "cost_usd_total": sum(r["cost_usd"] for r in rows if r["cost_usd"]) or None,
        "csv": csv_path.name,
    }
    write_summary_json(csv_path.with_suffix(".summary.json"), summary)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="장면 인식 백업 평가")
    ap.add_argument("--model", action="append", required=True, help="OpenRouter 모델 id (여러 번 지정해 비교)")
    ap.add_argument("--limit", type=int, help="앞에서 N장만")
    ap.add_argument("--pattern", default="*", help="파일 이름 패턴 (예: evac_4F_*)")
    ap.add_argument("--building", default="우정정보관", help="시드 그래프 건물 이름")
    ap.add_argument("--max-side", type=int, default=768, help="전송 이미지 긴 변 px")
    ap.add_argument("--reasoning", choices=["minimal", "low", "medium", "high"],
                    help="OpenRouter reasoning effort (지정 안 하면 모델 기본값)")
    args = ap.parse_args()

    images = [p for p in list_images(DATA_DIR / "scene") if p.match(args.pattern)][: args.limit]
    if not images:
        raise SystemExit(f"{DATA_DIR / 'scene'}에 사진이 없습니다 (scene_<node_id>_<n>.jpg)")
    desc_path = DATA_DIR / "scene" / "descriptions.json"
    descriptions = json.loads(desc_path.read_text(encoding="utf-8")) if desc_path.exists() else {}
    if not descriptions:
        print(f"⚠️ {desc_path}가 없어 랜드마크 설명 없이 평가합니다")
    system, schema, stamp = load_prompt("scene"), load_schema("scene"), run_stamp()

    summaries = []
    for model in args.model:
        print(f"\n===== {model} ({len(images)}장) =====")
        summaries.append(run_model(model, images, args, system, schema, descriptions, stamp))

    print("\n목표: top-3 ≥70%")
    print_table(["model", "n", "json_valid", "top-1", "top-3", "latency avg/max"],
                [[s["model"], s["n_images"], fmt(s["json_valid"], True), fmt(s["top1_acc"], True),
                  fmt(s["top3_acc"], True), f"{fmt(s['latency_s_mean'], digits=1)}/{fmt(s['latency_s_max'], digits=1)}s"]
                 for s in summaries])


if __name__ == "__main__":
    main()
