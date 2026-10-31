#!/usr/bin/env python3
"""작업 A 평가: 피난안내도 사진 → 층 그래프 JSON.

data/evac/evac_<층>_<조건>.jpg 마다 모델을 호출하고, 스키마를 검사한 뒤 truth/<층>.json과 비교한다.

  python ai/eval/run_evac_eval.py --model google/gemini-2.5-flash
  python ai/eval/run_evac_eval.py --model google/gemini-2.5-flash --model openai/gpt-4o --limit 3 --overlay
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from common import (DATA_DIR, RESULTS_DIR, TRUTH_DIR, call_vision, fmt, list_images, load_image, load_prompt,
                    load_schema, mean, model_tag, normalize_room, print_table, run_stamp, schema_errors, to_data_url,
                    write_csv, write_summary_json)

NODE_TYPES = {"room", "junction", "stairs", "elevator_hall", "entrance", "exit", "landmark"}
VERTICAL_TYPES = ("stairs", "elevator_hall", "exit")
ID_RE = re.compile(r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$")
CURRENT_DIST_OK = 0.08


def user_message(building: str | None, floor: str | None) -> str:
    return (f"건물 힌트: {building or '모름'}\n"
            f"층 힌트: {floor or '모름'}\n"
            "이 피난안내도를 층 그래프 JSON으로 변환하라.")


def floor_from_name(path: Path) -> str | None:
    m = re.match(r"evac_([^_]+)_", path.stem + "_")
    return m.group(1).upper() if m else None


# ---------------------------------------------------------------- 후처리 (백엔드도 같은 규칙으로 정리)

def clean_graph(g: dict) -> tuple[dict, list[str]]:
    """잘못된 노드·간선을 버린 사본과 이슈 목록. 지표는 이 사본으로 계산한다."""
    issues: list[str] = []
    nodes, ids = [], set()
    for n in g.get("nodes") or []:
        nid = n.get("id")
        if not nid or nid in ids or n.get("type") not in NODE_TYPES:
            issues.append(f"node dropped: {nid}")
            continue
        try:
            x, y = float(n["x"]), float(n["y"])
        except (KeyError, TypeError, ValueError):
            issues.append(f"node dropped (no xy): {nid}")
            continue
        if not (0 <= x <= 1 and 0 <= y <= 1):
            issues.append(f"node dropped (xy out of range): {nid}")
            continue
        if not ID_RE.match(nid):
            issues.append(f"bad id format: {nid}")
        ids.add(nid)
        nodes.append({**n, "x": x, "y": y})

    edges, pairs = [], set()
    for e in g.get("edges") or []:
        a, b = e.get("from"), e.get("to")
        if a not in ids or b not in ids:
            issues.append(f"edge dropped (unknown node): {a}->{b}")
            continue
        if a == b or frozenset((a, b)) in pairs:
            continue
        pairs.add(frozenset((a, b)))
        edges.append(e)

    cur = g.get("current_node_id")
    if cur and cur not in ids:
        issues.append(f"current_node_id not in nodes: {cur}")
        cur = None
    return {**g, "nodes": nodes, "edges": edges, "current_node_id": cur}, issues


def reachable(g: dict, start: str) -> set[str]:
    adj: dict[str, set[str]] = defaultdict(set)
    for e in g["edges"]:
        adj[e["from"]].add(e["to"])
        adj[e["to"]].add(e["from"])
    seen, stack = {start}, [start]
    while stack:
        for nb in adj[stack.pop()]:
            if nb not in seen:
                seen.add(nb)
                stack.append(nb)
    return seen


# ---------------------------------------------------------------- 지표

def room_set(g: dict) -> set[str]:
    return {normalize_room(n.get("label") or n["id"].split("-", 1)[-1]) for n in g["nodes"] if n["type"] == "room"} - {""}


def node_by_id(g: dict, nid: str | None) -> dict | None:
    return next((n for n in g["nodes"] if n["id"] == nid), None) if nid else None


def score(pred: dict, truth: dict | None) -> dict:
    m: dict = {}
    cur = pred.get("current_node_id")
    rooms = [n["id"] for n in pred["nodes"] if n["type"] == "room"]
    if cur:
        reach = reachable(pred, cur)
        m["connected"] = all(r in reach for r in rooms)
    else:
        m["connected"] = False
    m["n_nodes"], m["n_edges"], m["n_rooms"] = len(pred["nodes"]), len(pred["edges"]), len(rooms)

    if truth is None:
        return m

    t_rooms, p_rooms = room_set(truth), room_set(pred)
    hit = t_rooms & p_rooms
    m["room_recall"] = len(hit) / len(t_rooms) if t_rooms else None
    m["room_precision"] = len(hit) / len(p_rooms) if p_rooms else None
    m["rooms_missed"] = " ".join(sorted(t_rooms - p_rooms))
    m["rooms_extra"] = " ".join(sorted(p_rooms - t_rooms))

    t_cur, p_cur = node_by_id(truth, truth.get("current_node_id")), node_by_id(pred, cur)
    if t_cur is None:
        m["current_node_ok"] = None
    elif p_cur is None:
        m["current_node_ok"] = False
    else:
        same_label = bool(t_cur.get("label")) and normalize_room(t_cur["label"]) == normalize_room(p_cur.get("label"))
        dist = math.dist((t_cur["x"], t_cur["y"]), (p_cur["x"], p_cur["y"]))
        m["current_dist"] = round(dist, 3)
        m["current_node_ok"] = same_label or dist <= CURRENT_DIST_OK

    # 타입별 개수로 비교: 사진 구도가 정답 이미지와 달라 좌표 매칭은 믿기 어렵다
    t_cnt = Counter(n["type"] for n in truth["nodes"] if n["type"] in VERTICAL_TYPES)
    p_cnt = Counter(n["type"] for n in pred["nodes"] if n["type"] in VERTICAL_TYPES)
    total = sum(t_cnt.values())
    m["vertical_found"] = sum(min(p_cnt[t], c) for t, c in t_cnt.items()) / total if total else None
    return m


# ---------------------------------------------------------------- overlay (눈으로 확인용)

def draw_overlay(img, g: dict, out_path: Path) -> None:
    from PIL import Image, ImageDraw, ImageFont

    colors = {"room": (37, 99, 235), "junction": (120, 120, 120), "stairs": (234, 88, 12),
              "elevator_hall": (147, 51, 234), "entrance": (22, 163, 74), "exit": (220, 38, 38),
              "landmark": (13, 148, 136)}
    base = img.copy()
    base.thumbnail((1600, 1600))
    W, H = base.size
    canvas = Image.blend(base, Image.new("RGB", base.size, "white"), 0.45)
    draw = ImageDraw.Draw(canvas, "RGBA")
    r = max(5, W // 180)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", max(12, W // 70))
    except OSError:
        font = ImageFont.load_default()
    pos = {n["id"]: (n["x"] * W, n["y"] * H) for n in g["nodes"]}
    for e in g["edges"]:
        draw.line([pos[e["from"]], pos[e["to"]]], fill=(15, 23, 42, 200), width=max(2, r // 2))
    for n in g["nodes"]:
        x, y = pos[n["id"]]
        c = colors[n["type"]]
        if n["id"] == g.get("current_node_id"):
            draw.ellipse([x - r * 2.5, y - r * 2.5, x + r * 2.5, y + r * 2.5], outline=(239, 68, 68), width=4)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=c + (255,), outline="white")
        if n["type"] != "junction":
            draw.text((x + r + 3, y - r - 3), n.get("label") or n["id"], fill=c, font=font, stroke_width=2,
                      stroke_fill="white")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


# ---------------------------------------------------------------- main

def run_model(model: str, images: list[Path], args, system: str, schema: dict, stamp: str) -> dict:
    rows = []
    raw_dir = RESULTS_DIR / "raw" / f"evac_{model_tag(model, args.reasoning)}_{stamp}"
    for img_path in images:
        floor = floor_from_name(img_path)
        truth_path = TRUTH_DIR / f"{floor}.json"
        truth = json.loads(truth_path.read_text(encoding="utf-8")) if floor and truth_path.exists() else None
        img = load_image(img_path)
        res = call_vision(model, system, user_message(args.building, floor), to_data_url(img, args.max_side),
                          schema, "floor_graph",
                          reasoning=args.reasoning)

        row = {"image": img_path.name, "floor": floor, "has_truth": truth is not None,
               "latency_s": round(res["latency_s"], 2) if res["latency_s"] else None,
               "cost_usd": res["cost_usd"], "format": res["format"], "error": res["error"]}
        if res["data"] is not None:
            errs = schema_errors(schema, res["data"])
            row["json_valid"] = not errs
            row["schema_errors"] = " | ".join(errs[:5])
            raw_dir.mkdir(parents=True, exist_ok=True)
            (raw_dir / f"{img_path.stem}.json").write_text(json.dumps(res["data"], ensure_ascii=False, indent=2),
                                                           encoding="utf-8")
            pred, issues = clean_graph(res["data"])
            row["cleanup_issues"] = len(issues)
            row.update(score(pred, clean_graph(truth)[0] if truth else None))
            if args.overlay:
                draw_overlay(img, pred, raw_dir / f"{img_path.stem}_overlay.png")
        else:
            row["json_valid"] = False
        rows.append(row)
        print(f"  {img_path.name}: valid={row.get('json_valid')} recall={fmt(row.get('room_recall'), True)} "
              f"cur={row.get('current_node_ok')} {row['latency_s']}s {row['error'] or ''}")

    csv_path = RESULTS_DIR / f"evac_{model_tag(model, args.reasoning)}_{stamp}.csv"
    write_csv(csv_path, rows)
    truth_rows = [r for r in rows if r["has_truth"]]
    rate = lambda key, rs: mean([float(r[key]) for r in rs if r.get(key) is not None])
    summary = {
        "task": "evac", "model": model + (f" (reasoning={args.reasoning})" if args.reasoning else ""), "run": stamp, "n_images": len(rows), "n_with_truth": len(truth_rows),
        "json_valid": rate("json_valid", rows),
        "room_recall": rate("room_recall", truth_rows),
        "room_precision": rate("room_precision", truth_rows),
        "current_node_ok": rate("current_node_ok", truth_rows),
        "vertical_found": rate("vertical_found", truth_rows),
        "connected": rate("connected", rows),
        "latency_s_mean": mean([r["latency_s"] for r in rows]),
        "latency_s_max": max((r["latency_s"] for r in rows if r["latency_s"]), default=None),
        "cost_usd_total": sum(r["cost_usd"] for r in rows if r["cost_usd"]) or None,
        "csv": csv_path.name,
    }
    write_summary_json(csv_path.with_suffix(".summary.json"), summary)
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(description="피난안내도 → 층 그래프 평가")
    ap.add_argument("--model", action="append", required=True, help="OpenRouter 모델 id (여러 번 지정해 비교)")
    ap.add_argument("--limit", type=int, help="앞에서 N장만")
    ap.add_argument("--building", default="우정정보관", help="건물 힌트")
    ap.add_argument("--max-side", type=int, default=2048, help="전송 이미지 긴 변 px")
    ap.add_argument("--overlay", action="store_true", help="results/raw/에 그래프를 겹친 PNG 저장")
    ap.add_argument("--reasoning", choices=["minimal", "low", "medium", "high"],
                    help="OpenRouter reasoning effort (지정 안 하면 모델 기본값)")
    args = ap.parse_args()

    images = list_images(DATA_DIR / "evac")[: args.limit]
    if not images:
        raise SystemExit(f"{DATA_DIR / 'evac'}에 사진이 없습니다 (evac_<층>_<조건>.jpg)")
    system, schema, stamp = load_prompt("evac_map_to_graph"), load_schema("floor_graph"), run_stamp()

    summaries = []
    for model in args.model:
        print(f"\n===== {model} ({len(images)}장) =====")
        summaries.append(run_model(model, images, args, system, schema, stamp))

    print("\n목표: json_valid 100% · room_recall ≥80% · room_precision ≥90% · current_node_ok ≥90% · "
          "vertical_found ≥90% · connected 100% · latency ≤10s")
    print_table(
        ["model", "n", "json_valid", "room_recall", "room_prec", "current_ok", "vertical", "connected",
         "latency avg/max", "cost $"],
        [[s["model"], s["n_images"], fmt(s["json_valid"], True), fmt(s["room_recall"], True),
          fmt(s["room_precision"], True), fmt(s["current_node_ok"], True), fmt(s["vertical_found"], True),
          fmt(s["connected"], True), f"{fmt(s['latency_s_mean'], digits=1)}/{fmt(s['latency_s_max'], digits=1)}s",
          fmt(s["cost_usd_total"], digits=4)] for s in summaries])


if __name__ == "__main__":
    main()
