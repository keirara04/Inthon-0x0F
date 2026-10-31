#!/usr/bin/env python3
"""작업 B 평가: 카메라 프레임 → 표지 글자 읽기(AI) → 랜드마크 매칭(코드, CheckpointMatcher와 같은 규칙).

prod와 같은 구성:
  AI: backend/resources/prompts/checkpoint.md + schemas/checkpoint.json → {text, kind}
  매칭: matcher.py (CheckpointMatcher.php 이식), 랜드마크는 시드 그래프에서 GraphImporter 규칙으로 만든다.

정답은 파일 이름에서 읽는다:
  room_<번호>_<조건>.jpg → 그 호실 · sign_<층>_<조건>.jpg → 그 층 표지 · none_<아무거나>.jpg → 표지 없음
포스터 함정(*poster*)은 기본으로 뺀다: 촬영 건물에 포스터가 없다. 넣으려면 --exclude "".

AI 호출은 사진당 한 번이고, 매칭은 여러 '예상 노드'로 돌려 본다:
  정상: 예상 노드 = 실제 위치 → matched 여야 함
  길 잘못 듦: 예상 노드 = 다른 위치 → mismatch 여야 함. matched가 나오면 false_match (가장 나쁜 실패)

  python ai/eval/run_checkpoint_eval.py --model google/gemini-3.8-flash --reasoning low
  python ai/eval/run_checkpoint_eval.py --model google/gemini-3.8-flash --reasoning low --max-side 0   # prod처럼 원본 전송
"""

from __future__ import annotations

import argparse
import re
import statistics
from pathlib import Path

from common import (DATA_DIR, RESULTS_DIR, call_vision, fmt, image_data_url, list_images, load_image, load_prompt,
                    load_schema, load_truth_floors, mean, model_tag, print_table, run_stamp, schema_errors,
                    write_csv, write_summary_json)
from matcher import canonical, landmarks_from_graphs, match

PROD_USER_TEXT = "이 사진을 읽어줘."  # VisionController는 userText 없이 호출 → VisionClient 기본값


# ---------------------------------------------------------------- 정답

def room_key(label: str) -> str:
    """'401A호' → '401A' (정답 노드 찾기용. 매칭 규칙과는 별개)."""
    return re.sub(r"\s+|호실?$", "", label).upper()


def truth_from_name(path: Path, landmarks: list[dict]) -> dict:
    stem = path.stem
    if m := re.match(r"room_([^_]+)", stem):
        key = m.group(1).upper()
        nodes = [l for l in landmarks if l["kind"] == "room_no" and room_key(l["label"]) == key]
        return {"kind": "room_no", "text": f"{key}호", "node": nodes[0]["node_id"] if len(nodes) == 1 else None,
                "floor": nodes[0]["floor"] if len(nodes) == 1 else None}
    if m := re.match(r"sign_([^_]+)", stem):
        fl = canonical(m.group(1))
        nodes = [l for l in landmarks if l["kind"] == "floor_sign" and l["ocr_text"] == fl]
        return {"kind": "floor_sign", "text": fl, "node": nodes[0]["node_id"] if nodes else None, "floor": fl}
    if stem.startswith("none_"):
        return {"kind": "none", "text": None, "node": None, "floor": None}
    raise ValueError(f"파일 이름 규칙에 맞지 않음: {path.name}")


def add_photo_rooms(landmarks: list[dict], images: list[Path]) -> list[str]:
    """시드에 없는 호실을 사진 파일 이름에서 랜드마크로 보탠다 (시드가 임시본일 때만, --rooms-from-photos).

    층은 호실 번호 앞자리('401A' → 4F). 추가한 호실 목록을 돌려준다.
    """
    have = {room_key(l["label"]) for l in landmarks if l["kind"] == "room_no"}
    added = []
    for p in images:
        m = re.match(r"room_([0-9]{3,4}[A-Za-z]?)(?:_|$)", p.stem)
        if not m or (key := m.group(1).upper()) in have:
            continue
        have.add(key)
        added.append(key)
        floor = re.match(r"([0-9]+?)[0-9]{2}[A-Z]?$", key).group(1) + "F"
        landmarks.append({"node_id": f"photo-{key}", "floor": floor, "label": f"{key}호", "kind": "room_no",
                          "ocr_text": canonical(key)})
    return added


def wrong_expectations(truth: dict, landmarks: list[dict]) -> list[str]:
    """사용자가 실제로는 truth 위치에 있는데 앱은 다른 곳을 예상하는 경우들.

    호실 사진: 라벨이 다른 모든 호실 · 층 표지 사진: 다른 층의 모든 노드 (같은 층 안에서는 층 표지로 노드를 못 가린다).
    """
    if truth["kind"] == "room_no":
        return [l["node_id"] for l in landmarks if l["kind"] == "room_no" and room_key(l["label"]) != room_key(truth["text"])]
    if truth["kind"] == "floor_sign":
        return list(dict.fromkeys(l["node_id"] for l in landmarks if l["floor"] != truth["floor"]))
    return []


# ---------------------------------------------------------------- main

def run_model(model: str, images: list[Path], args, system: str, schema: dict, landmarks: list[dict], stamp: str) -> dict:
    rows = []
    tag = model_tag(model, args.reasoning) + f"_px{args.max_side or 'raw'}"
    all_nodes = list(dict.fromkeys(l["node_id"] for l in landmarks))
    for img_path in images:
        truth = truth_from_name(img_path, landmarks)
        if truth["kind"] != "none" and truth["node"] is None:
            print(f"  ⚠️ {img_path.name}: 시드 그래프에서 정답 노드를 못 찾음 → 건너뜀")
            continue
        res = call_vision(model, system, PROD_USER_TEXT, image_data_url(img_path, load_image(img_path), args.max_side),
                          schema, "checkpoint", reasoning=args.reasoning)
        d = res["data"] or {}
        texts = [d["text"]] if isinstance(d.get("text"), str) else []

        row = {"image": img_path.name, "truth_kind": truth["kind"], "truth_text": truth["text"], "truth_node": truth["node"],
               "pred_kind": d.get("kind"), "pred_text": d.get("text"),
               "json_valid": res["data"] is not None and not schema_errors(schema, res["data"]),
               "latency_s": round(res["latency_s"], 2) if res["latency_s"] else None,
               "cost_usd": res["cost_usd"], "error": res["error"]}
        if truth["kind"] == "none":
            # 어떤 노드를 예상하든 unknown 이어야 한다
            outcomes = [match(texts, n, landmarks)["status"] for n in all_nodes]
            row["read_ok"] = not texts or canonical(texts[0]) is None
            row["status_expected_truth"] = None
            row["false_match"] = sum(s == "matched" for s in outcomes)
            row["n_wrong_checks"] = len(outcomes)
            row["mismatch_detected"] = None
        else:
            r = match(texts, truth["node"], landmarks)
            wrong_ids = wrong_expectations(truth, landmarks)
            wrong = [match(texts, n, landmarks) for n in wrong_ids]
            row["read_canonical"] = " ".join(r["read"])
            row["read_ok"] = canonical(truth["text"]) in r["read"]
            row["status_expected_truth"] = r["status"]
            row["false_match"] = sum(w["status"] == "matched" for w in wrong)
            row["n_wrong_checks"] = len(wrong)
            row["mismatch_detected"] = sum(w["status"] == "mismatch" for w in wrong) / len(wrong) if wrong else None
            if row["false_match"]:
                row["false_match_examples"] = " ".join(
                    n for n, w in zip(wrong_ids, wrong) if w["status"] == "matched")[:200]
        rows.append(row)
        print(f"  {img_path.name}: {d.get('kind')} {d.get('text')!r} → {row['status_expected_truth'] or '-'} "
              f"false_match={row['false_match']} {row['latency_s']}s {res['error'] or ''}")

    signs = [r for r in rows if r["truth_kind"] != "none"]
    nones = [r for r in rows if r["truth_kind"] == "none"]
    lat = [r["latency_s"] for r in rows if r["latency_s"]]
    csv_path = RESULTS_DIR / f"checkpoint_{tag}_{stamp}.csv"
    write_csv(csv_path, rows)
    summary = {
        "task": "checkpoint", "run": stamp, "n_images": len(rows), "n_sign": len(signs), "n_none": len(nones),
        "model": model + (f" (reasoning={args.reasoning})" if args.reasoning else "") + f" {args.max_side or 'raw'}px",
        "json_valid": mean([float(r["json_valid"]) for r in rows]),
        "read_rate": mean([float(r["read_ok"]) for r in signs]),
        "matched_rate": mean([float(r["status_expected_truth"] == "matched") for r in signs]),
        "mismatch_detected": mean([r["mismatch_detected"] for r in signs]),
        "false_match": sum(r["false_match"] for r in rows),
        "false_match_checks": sum(r["n_wrong_checks"] for r in rows),
        "none_rate": mean([float(r["read_ok"]) for r in nones]),
        "latency_s_mean": mean(lat), "latency_s_p50": statistics.median(lat) if lat else None,
        "latency_s_max": max(lat, default=None),
        "cost_usd_total": sum(r["cost_usd"] for r in rows if r["cost_usd"]) or None,
        "rooms_from_photos": args.rooms_from_photos,
        "csv": csv_path.name,
    }
    write_summary_json(csv_path.with_suffix(".summary.json"), summary)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="체크포인트 OCR 평가 (AI 읽기 + CheckpointMatcher 규칙)")
    ap.add_argument("--model", action="append", required=True, help="OpenRouter 모델 id (여러 번 지정해 비교)")
    ap.add_argument("--limit", type=int, help="앞에서 N장만")
    ap.add_argument("--pattern", default="*", help="파일 이름 패턴 (예: room_*)")
    ap.add_argument("--exclude", default="*poster*", help='뺄 파일 이름 패턴 (기본: 포스터 함정. ""이면 안 뺌)')
    ap.add_argument("--building", default="우정정보관", help="시드 그래프 건물 이름")
    ap.add_argument("--max-side", type=int, default=768, help="전송 이미지 긴 변 px. 0이면 원본 그대로 (현재 prod)")
    ap.add_argument("--reasoning", choices=["minimal", "low", "medium", "high"],
                    help="OpenRouter reasoning effort (prod는 low)")
    ap.add_argument("--rooms-from-photos", action="store_true",
                    help="시드에 없는 호실을 사진 이름에서 랜드마크로 보탬 (시드가 임시본일 때만)")
    args = ap.parse_args()

    images = [p for p in list_images(DATA_DIR / "checkpoint") if p.match(args.pattern)
              and not (args.exclude and p.match(args.exclude))][: args.limit]
    if not images:
        raise SystemExit(f"{DATA_DIR / 'checkpoint'}에 사진이 없습니다 (room_*/sign_*/none_*)")
    landmarks = landmarks_from_graphs(load_truth_floors(args.building))
    if not landmarks:
        raise SystemExit("시드 그래프가 없습니다: backend/database/seeders/data/<건물>-<층>.json")
    if args.rooms_from_photos and (added := add_photo_rooms(landmarks, images)):
        print(f"⚠️ 시드에 없는 호실을 사진 이름에서 보탬: {' '.join(added)}")
    system, schema, stamp = load_prompt("checkpoint"), load_schema("checkpoint"), run_stamp()

    summaries = []
    for i, model in enumerate(args.model):
        print(f"\n===== {model} ({len(images)}장, 랜드마크 {len(landmarks)}개, {args.max_side or '원본'}px) =====")
        repeat = args.model[:i].count(model)  # 같은 모델을 여러 번 돌리면 파일이 덮이지 않게 번호를 붙인다
        summaries.append(run_model(model, images, args, system, schema, landmarks, stamp + (f"_{repeat + 1}" if repeat else "")))

    print("\n목표: matched ≥85% · false_match 0 · none 100% · latency ≤3s")
    print_table(
        ["model", "n", "json_valid", "read", "matched", "mismatch 감지", "false_match", "none", "latency avg/p50/max"],
        [[s["model"], s["n_images"], fmt(s["json_valid"], True), fmt(s["read_rate"], True), fmt(s["matched_rate"], True),
          fmt(s["mismatch_detected"], True), f"{s['false_match']}/{s['false_match_checks']}", fmt(s["none_rate"], True),
          f"{fmt(s['latency_s_mean'], digits=1)}/{fmt(s['latency_s_p50'], digits=1)}/{fmt(s['latency_s_max'], digits=1)}s"]
         for s in summaries])


if __name__ == "__main__":
    main()
