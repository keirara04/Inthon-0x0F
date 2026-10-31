#!/usr/bin/env python3
"""작업 B 평가: 카메라 프레임 → 호실 번호·층 표지 → 랜드마크 노드 매칭.

정답은 파일 이름에서 읽는다:
  room_<번호>_<조건>.jpg → "<번호>호" · sign_<층>_<조건>.jpg → "<층>" · none_<아무거나>.jpg → none

랜드마크 목록은 truth/landmarks.json ([{node_id, kind, ocr_text}])을 쓰고, 없으면 truth/<층>.json에서 만든다
(room 노드 → room_no, 층마다 엘리베이터 홀 하나 → floor_sign).

  python ai/eval/run_checkpoint_eval.py --model google/gemini-2.5-flash
  python ai/eval/run_checkpoint_eval.py --model google/gemini-2.5-flash --all-floors
"""

from __future__ import annotations

import argparse
import json
import re
import zlib
from pathlib import Path

from common import (DATA_DIR, RESULTS_DIR, TRUTH_DIR, call_vision, fmt, list_images, load_image, load_prompt,
                    load_schema, mean, model_tag, normalize_floor, normalize_room, normalize_text, print_table,
                    run_stamp, schema_errors, to_data_url, write_csv, write_summary_json)

THRESHOLDS = [round(0.5 + 0.05 * i, 2) for i in range(10)]  # 0.50 ~ 0.95


# ---------------------------------------------------------------- 랜드마크와 정답

def load_landmarks() -> list[dict]:
    path = TRUTH_DIR / "landmarks.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    landmarks = []
    for graph_path in sorted(TRUTH_DIR.glob("*.json")):
        g = json.loads(graph_path.read_text(encoding="utf-8"))
        if "nodes" not in g:
            continue
        floor = g.get("floor") or graph_path.stem
        for n in g["nodes"]:
            if n["type"] == "room" and n.get("label"):
                landmarks.append({"node_id": n["id"], "kind": "room_no", "ocr_text": n["label"]})
        anchor = next((n for t in ("elevator_hall", "stairs", "entrance") for n in g["nodes"] if n["type"] == t), None)
        if anchor:
            landmarks.append({"node_id": anchor["id"], "kind": "floor_sign", "ocr_text": floor})
    return landmarks


def floor_of(node_id: str | None) -> str | None:
    return node_id.split("-", 1)[0] if node_id else None


def truth_from_name(path: Path, landmarks: list[dict]) -> dict:
    stem = path.stem
    if m := re.match(r"room_([^_]+)", stem):
        no = normalize_room(m.group(1))
        nodes = [l["node_id"] for l in landmarks if l["kind"] == "room_no" and normalize_room(l["ocr_text"]) == no]
        return {"kind": "room_no", "text": f"{no}호", "node_id": nodes[0] if len(nodes) == 1 else None}
    if m := re.match(r"sign_([^_]+)", stem):
        fl = normalize_floor(m.group(1))
        nodes = [l["node_id"] for l in landmarks if l["kind"] == "floor_sign" and normalize_floor(l["ocr_text"]) == fl]
        return {"kind": "floor_sign", "text": fl, "node_id": nodes[0] if len(nodes) == 1 else None}
    if stem.startswith("none_"):
        return {"kind": "none", "text": None, "node_id": None}
    raise ValueError(f"파일 이름 규칙에 맞지 않음: {path.name}")


def expected_for(truth: dict, landmarks: list[dict], path: Path) -> str:
    """표지 사진은 정답 노드를 예상 노드로 준다 (정상 안내 상황). none 사진은 파일 이름으로 고정된 임의 노드."""
    if truth["node_id"]:
        return truth["node_id"]
    return landmarks[zlib.crc32(path.name.encode()) % len(landmarks)]["node_id"]


def user_message(expected: str, landmarks: list[dict]) -> str:
    return (f"expected_node_id: {expected}\n"
            f"landmarks: {json.dumps(landmarks, ensure_ascii=False)}")


# ---------------------------------------------------------------- main

def run_model(model: str, images: list[Path], args, system: str, schema: dict, landmarks: list[dict], stamp: str) -> dict:
    rows = []
    for img_path in images:
        truth = truth_from_name(img_path, landmarks)
        if truth["kind"] != "none" and truth["node_id"] is None:
            print(f"  ⚠️ {img_path.name}: 랜드마크 목록에서 정답 노드를 못 찾음 → 건너뜀")
            continue
        expected = expected_for(truth, landmarks, img_path)
        given = landmarks if args.all_floors else [l for l in landmarks if floor_of(l["node_id"]) == floor_of(expected)]

        res = call_vision(model, system, user_message(expected, given),
                          to_data_url(load_image(img_path), args.max_side), schema, "checkpoint",
                          reasoning=args.reasoning)
        d = res["data"] or {}
        pred_node = d.get("matched_node_id")
        conf = float(d.get("confidence") or 0)
        row = {
            "image": img_path.name, "truth_kind": truth["kind"], "truth_text": truth["text"],
            "truth_node": truth["node_id"], "expected_node": expected,
            "pred_kind": d.get("kind"), "pred_text": d.get("text"), "pred_node": pred_node,
            "pred_match": d.get("match"), "confidence": conf,
            "json_valid": res["data"] is not None and not schema_errors(schema, res["data"]),
            "latency_s": round(res["latency_s"], 2) if res["latency_s"] else None,
            "cost_usd": res["cost_usd"], "error": res["error"],
        }
        row["match_consistent"] = d.get("match") == (pred_node is not None and pred_node == expected)
        row["text_ok"] = (truth["kind"] != "none"
                          and normalize_text(d.get("text"), truth["kind"]) == normalize_text(truth["text"], truth["kind"]))
        row["node_ok"] = pred_node == truth["node_id"]
        row["exact"] = truth["kind"] != "none" and row["text_ok"] and row["node_ok"]
        row["wrong_node"] = pred_node is not None and pred_node != truth["node_id"]
        row["returned_none"] = d.get("kind") == "none"
        rows.append(row)
        print(f"  {img_path.name}: {d.get('kind')} '{d.get('text')}' → {pred_node} (conf {conf:.2f}) "
              f"{'✅' if row['exact'] or (truth['kind'] == 'none' and row['returned_none']) else '❌'} "
              f"{row['latency_s']}s {res['error'] or ''}")

    signs = [r for r in rows if r["truth_kind"] != "none"]
    nones = [r for r in rows if r["truth_kind"] == "none"]
    sweep = []
    for t in THRESHOLDS:
        accepted = lambda r: r["pred_node"] is not None and r["confidence"] >= t
        sweep.append({
            "threshold": t,
            "exact_rate": sum(r["exact"] and accepted(r) for r in signs) / len(signs) if signs else None,
            "confident_wrong": sum(r["wrong_node"] and accepted(r) for r in rows),
            "none_rate": sum(not accepted(r) for r in nones) / len(nones) if nones else None,
        })
    safe = [s for s in sweep if s["confident_wrong"] == 0]
    recommended = safe[0]["threshold"] if safe else None

    csv_path = RESULTS_DIR / f"checkpoint_{model_tag(model, args.reasoning)}_{stamp}.csv"
    write_csv(csv_path, rows)
    write_csv(csv_path.with_name(csv_path.stem + "_thresholds.csv"), sweep)
    summary = {
        "task": "checkpoint", "model": model + (f" (reasoning={args.reasoning})" if args.reasoning else ""), "run": stamp, "n_images": len(rows),
        "n_sign": len(signs), "n_none": len(nones), "all_floors": args.all_floors,
        "json_valid": mean([float(r["json_valid"]) for r in rows]),
        "exact_rate_raw": mean([float(r["exact"]) for r in signs]),
        "confident_wrong_raw": sum(r["wrong_node"] for r in rows),
        "none_rate_raw": mean([float(r["returned_none"]) for r in nones]),
        "recommended_threshold": recommended,
        "at_recommended": next((s for s in sweep if s["threshold"] == recommended), None),
        "thresholds": sweep,
        "latency_s_mean": mean([r["latency_s"] for r in rows]),
        "latency_s_max": max((r["latency_s"] for r in rows if r["latency_s"]), default=None),
        "cost_usd_total": sum(r["cost_usd"] for r in rows if r["cost_usd"]) or None,
        "csv": csv_path.name,
    }
    write_summary_json(csv_path.with_suffix(".summary.json"), summary)

    print(f"\n  threshold별 (표지 {len(signs)}장, none {len(nones)}장)")
    print_table(["threshold", "exact_rate", "confident_wrong", "none_rate"],
                [[s["threshold"], fmt(s["exact_rate"], True), s["confident_wrong"], fmt(s["none_rate"], True)]
                 for s in sweep])
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="체크포인트 OCR 평가")
    ap.add_argument("--model", action="append", required=True, help="OpenRouter 모델 id (여러 번 지정해 비교)")
    ap.add_argument("--limit", type=int, help="앞에서 N장만")
    ap.add_argument("--max-side", type=int, default=768, help="전송 이미지 긴 변 px")
    ap.add_argument("--all-floors", action="store_true", help="예상 층만이 아니라 모든 층의 랜드마크를 준다 (더 어려움)")
    ap.add_argument("--reasoning", choices=["minimal", "low", "medium", "high"],
                    help="OpenRouter reasoning effort (지정 안 하면 모델 기본값)")
    args = ap.parse_args()

    images = list_images(DATA_DIR / "checkpoint")[: args.limit]
    if not images:
        raise SystemExit(f"{DATA_DIR / 'checkpoint'}에 사진이 없습니다")
    landmarks = load_landmarks()
    if not landmarks:
        raise SystemExit("랜드마크가 없습니다: truth/landmarks.json 또는 truth/<층>.json을 넣으세요")
    system, schema, stamp = load_prompt("checkpoint_ocr"), load_schema("checkpoint"), run_stamp()

    summaries = []
    for model in args.model:
        print(f"\n===== {model} ({len(images)}장, 랜드마크 {len(landmarks)}개) =====")
        summaries.append(run_model(model, images, args, system, schema, landmarks, stamp))

    print("\n목표: exact_rate ≥85% · confident_wrong 0 · none_rate 100% · latency ≤3s")
    print_table(
        ["model", "n", "json_valid", "exact(raw)", "conf_wrong(raw)", "none(raw)", "추천 threshold",
         "exact@추천", "latency avg/max"],
        [[s["model"], s["n_images"], fmt(s["json_valid"], True), fmt(s["exact_rate_raw"], True),
          s["confident_wrong_raw"], fmt(s["none_rate_raw"], True), s["recommended_threshold"] or "없음",
          fmt((s["at_recommended"] or {}).get("exact_rate"), True),
          f"{fmt(s['latency_s_mean'], digits=1)}/{fmt(s['latency_s_max'], digits=1)}s"] for s in summaries])


if __name__ == "__main__":
    main()
