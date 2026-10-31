#!/usr/bin/env python3
"""작업 A 평가: 피난안내도 사진 → 층 그래프 JSON.

data/evac/evac_<층>_<조건>.jpg 마다 prod와 같은 프롬프트·스키마(backend/resources/*/evac-map)로 모델을 호출하고,
스키마를 검사한 뒤 시드 그래프(backend/database/seeders/data/<건물>-<층>.json)와 비교한다.

  python ai/eval/run_evac_eval.py --model google/gemini-3.8-flash --reasoning low --overlay
  python ai/eval/run_evac_eval.py --model google/gemini-3.8-flash --reasoning low --max-side 1280   # prod 업로드 크기
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

from common import (DATA_DIR, RESULTS_DIR, call_vision, fmt, image_data_url, list_images, load_image, load_prompt,
                    load_schema, load_truth, mean, model_tag, normalize_room, print_table, run_stamp, schema_errors,
                    write_csv, write_summary_json)

NODE_TYPES = {"room", "junction", "stairs", "elevator_hall", "entrance", "exit", "landmark"}
VERTICAL_TYPES = ("stairs", "elevator_hall", "exit")
ID_RE = re.compile(r"^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$")


def user_message(building: str, floor: str) -> str:
    return f"건물: {building}, 층: {floor}"  # EvacMapParser::parse와 같은 문장


def floor_from_name(path: Path) -> str | None:
    m = re.match(r"evac_([^_]+)_", path.stem + "_")
    return m.group(1).upper() if m else None


# ---------------------------------------------------------------- 후처리 (백엔드도 같은 규칙으로 정리)

OUTLINE_TYPES = ("room", "stairs", "elevator_hall")


def clean_outline(points) -> list[dict] | None:
    """EvacMapParser::outline: 0~1로 자르고, 연달아 같은 점·끝에 반복한 첫 점을 빼고, 3~12점만."""
    if not isinstance(points, list):
        return None
    out: list[dict] = []
    for p in points:
        try:
            pt = {"x": min(1.0, max(0.0, float(p["x"]))), "y": min(1.0, max(0.0, float(p["y"])))}
        except (KeyError, TypeError, ValueError):
            continue
        if not out or pt != out[-1]:
            out.append(pt)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out[:12] if len(out) >= 3 else None


def read_floor(value) -> str | None:
    """EvacMapParser::readFloor: '4F'·'B1'·'4층'·'지하1층' → '4F'·'B1', 못 읽으면 None."""
    v = re.sub(" ", "", value if isinstance(value, str) else "").upper()
    if re.fullmatch(r"B\d+|\d+F", v):
        return v
    if m := re.fullmatch(r"지하(\d+)층", v):
        return f"B{m.group(1)}"
    return f"{m.group(1)}F" if (m := re.fullmatch(r"(\d+)층", v)) else None


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
        outline = clean_outline(n.get("outline")) if n["type"] in OUTLINE_TYPES else None
        if n.get("outline") and outline is None:
            issues.append(f"outline dropped: {nid}")
        nodes.append({**n, "x": x, "y": y, "outline": outline})

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


def bbox(outline: list[dict]) -> tuple[float, float, float, float]:
    xs, ys = [p["x"] for p in outline], [p["y"] for p in outline]
    return min(xs), min(ys), max(xs), max(ys)


def bbox_iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def fit_axis(src: list[float], dst: list[float]) -> tuple[float, float] | None:
    """dst ≈ a·src + b (최소제곱). 점이 한 줄에 몰려 있으면 None."""
    n = len(src)
    ms, md = sum(src) / n, sum(dst) / n
    var = sum((s - ms) ** 2 for s in src)
    if var < 1e-6:
        return None
    a = sum((s - ms) * (d - md) for s, d in zip(src, dst)) / var
    return a, md - a * ms


def outline_iou(pred: dict, truth: dict) -> float | None:
    """같은 번호 방끼리 윤곽 bbox IoU 평균.

    정답 좌표는 펴진 도면 기준이고 예측은 사진 기준이라 좌표계가 다르다.
    같은 번호 방의 중심점으로 x·y 축별 배율·이동을 맞춘 뒤 비교한다 (방 위치·크기 비율이 맞는지 보는 지표).
    """
    def rooms(g):
        out = {}
        for n in g["nodes"]:
            if n["type"] == "room" and n.get("outline"):
                out.setdefault(normalize_room(n.get("label") or n["id"].split("-", 1)[-1]), bbox(n["outline"]))
        return out
    p, t = rooms(pred), rooms(truth)
    common = sorted(set(p) & set(t))
    if len(common) < 3:
        return None
    center = lambda b, i: (b[i] + b[i + 2]) / 2
    fx = fit_axis([center(p[k], 0) for k in common], [center(t[k], 0) for k in common])
    fy = fit_axis([center(p[k], 1) for k in common], [center(t[k], 1) for k in common])
    if not fx or not fy:
        return None
    tf = lambda b: (fx[0] * b[0] + fx[1], fy[0] * b[1] + fy[1], fx[0] * b[2] + fx[1], fy[0] * b[3] + fy[1])
    return sum(bbox_iou(tf(p[k]), t[k]) for k in common) / len(common)


def current_ok(pred: dict, truth: dict) -> bool | None:
    """현위치가 정답 현위치와 같은 종류의 노드(예: 엘리베이터 홀)이거나, 예측 그래프 안에서 그 위치와
    가장 가까운 시설(junction 아닌 노드)이 그 종류인가.

    정답(펴진 도면)과 예측(사진)의 좌표계가 달라 정답과의 거리는 쓰지 않고, 예측 안에서만 거리를 잰다.
    """
    t_cur = node_by_id(truth, truth.get("current_node_id"))
    if t_cur is None:
        return None
    p_cur = node_by_id(pred, pred.get("current_node_id"))
    if p_cur is None:
        return False
    if p_cur["type"] == t_cur["type"]:
        return True
    if p_cur["type"] != "junction":
        return False
    others = [n for n in pred["nodes"] if n["type"] != "junction"]
    near = min(others, key=lambda n: (n["x"] - p_cur["x"]) ** 2 + (n["y"] - p_cur["y"]) ** 2, default=None)
    return near is not None and near["type"] == t_cur["type"]


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
    types = {n["id"]: n["type"] for n in pred["nodes"]}
    corridor = [float(e["heading_deg"]) for e in pred["edges"]
                if types[e["from"]] == "junction" and types[e["to"]] == "junction" and e.get("heading_deg") is not None]
    off_axis = lambda h: min(h % 90, 90 - h % 90)
    m["corridor_axis_ok"] = sum(off_axis(h) <= 15 for h in corridor) / len(corridor) if corridor else None
    shaped = [n for n in pred["nodes"] if n["type"] in OUTLINE_TYPES]
    m["outline_coverage"] = sum(bool(n.get("outline")) for n in shaped) / len(shaped) if shaped else None
    m["floor_read"] = read_floor(pred.get("floor"))

    if truth is None:
        return m

    m["floor_ok"] = m["floor_read"] == truth.get("floor")
    m["n_elevators"] = sum(n["type"] == "elevator_hall" for n in pred["nodes"])
    m["elevator_count_ok"] = m["n_elevators"] == sum(n["type"] == "elevator_hall" for n in truth["nodes"])
    iou = outline_iou(pred, truth)
    m["outline_iou"] = round(iou, 3) if iou is not None else None

    t_rooms, p_rooms = room_set(truth), room_set(pred)
    hit = t_rooms & p_rooms
    m["room_recall"] = len(hit) / len(t_rooms) if t_rooms else None
    m["room_precision"] = len(hit) / len(p_rooms) if p_rooms else None
    m["rooms_missed"] = " ".join(sorted(t_rooms - p_rooms))
    m["rooms_extra"] = " ".join(sorted(p_rooms - t_rooms))

    m["current_node_ok"] = current_ok(pred, truth)

    # 타입별 개수로 비교: 사진 구도가 정답 이미지와 달라 좌표 매칭은 믿기 어렵다
    t_cnt = Counter(n["type"] for n in truth["nodes"] if n["type"] in VERTICAL_TYPES)
    p_cnt = Counter(n["type"] for n in pred["nodes"] if n["type"] in VERTICAL_TYPES)
    total = sum(t_cnt.values())
    m["vertical_found"] = sum(min(p_cnt[t], c) for t, c in t_cnt.items()) / total if total else None

    # ref: 층끼리 같은 계단·엘리베이터를 잇는 id. 정답과 (type, ref) 집합이 같아야 층 연결이 맞는다
    refs = lambda g: {(n["type"], n.get("ref")) for n in g["nodes"] if n["type"] in ("stairs", "elevator_hall")}
    p_refs, t_refs = refs(pred), refs(truth)
    m["ref_missing"] = sum(r is None for _, r in p_refs)
    m["ref_match"] = p_refs == t_refs
    m["pred_refs"] = " ".join(sorted(f"{t[:5]}:{r}" for t, r in p_refs))
    m["truth_refs"] = " ".join(sorted(f"{t[:5]}:{r}" for t, r in t_refs))
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
    for n in g["nodes"]:
        if n.get("outline"):
            draw.polygon([(q["x"] * W, q["y"] * H) for q in n["outline"]], fill=colors[n["type"]] + (40,),
                          outline=colors[n["type"]] + (220,))
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
    tag = model_tag(model, args.reasoning) + f"_px{args.max_side or 'raw'}"
    raw_dir = RESULTS_DIR / "raw" / f"evac_{tag}_{stamp}"
    for img_path in images:
        floor = floor_from_name(img_path)
        truth = load_truth(args.building, floor) if floor else None
        img = load_image(img_path)
        res = call_vision(model, system, user_message(args.building, floor), image_data_url(img_path, img, args.max_side),
                          schema, "evac-map",
                          reasoning=args.reasoning)

        row = {"image": img_path.name, "floor": floor, "has_truth": truth is not None,
               "latency_s": round(res["latency_s"], 2) if res["latency_s"] else None,
               "cost_usd": res["cost_usd"], "format": res["format"], "error": res["error"],
               "completion_tokens": res["usage"].get("completion_tokens") or res["usage"].get("output_tokens"),
               "reasoning_tokens": (res["usage"].get("completion_tokens_details") or {}).get("reasoning_tokens")}
        if res["data"] is not None:
            errs = schema_errors(schema, res["data"])
            graph = res["data"]
            raw_dir.mkdir(parents=True, exist_ok=True)
            row["json_valid"] = not errs
            row["schema_errors"] = " | ".join(errs[:5])
            (raw_dir / f"{img_path.stem}.json").write_text(json.dumps(graph, ensure_ascii=False, indent=2),
                                                           encoding="utf-8")
            pred, issues = clean_graph(graph)
            row["cleanup_issues"] = len(issues)
            row.update(score(pred, clean_graph(truth)[0] if truth else None))
            if args.overlay:
                draw_overlay(img, pred, raw_dir / f"{img_path.stem}_overlay.png")
        else:
            row["json_valid"] = False
        rows.append(row)
        print(f"  {img_path.name}: valid={row.get('json_valid')} recall={fmt(row.get('room_recall'), True)} "
              f"cur={row.get('current_node_ok')} elev={row.get('n_elevators')} iou={row.get('outline_iou')} "
              f"{row['latency_s']}s {row['error'] or ''}")

    csv_path = RESULTS_DIR / f"evac_{tag}_{stamp}.csv"
    write_csv(csv_path, rows)
    truth_rows = [r for r in rows if r["has_truth"]]
    rate = lambda key, rs: mean([float(r[key]) for r in rs if r.get(key) is not None])
    summary = {
        "task": "evac", "model": model + (f" (reasoning={args.reasoning})" if args.reasoning else "") + f" {args.max_side or 'raw'}px", "run": stamp, "n_images": len(rows), "n_with_truth": len(truth_rows),
        "json_valid": rate("json_valid", rows),
        "room_recall": rate("room_recall", truth_rows),
        "room_precision": rate("room_precision", truth_rows),
        "current_node_ok": rate("current_node_ok", truth_rows),
        "vertical_found": rate("vertical_found", truth_rows),
        "ref_match": rate("ref_match", truth_rows),
        "floor_ok": rate("floor_ok", truth_rows),
        "elevator_count_ok": rate("elevator_count_ok", truth_rows),
        "outline_coverage": rate("outline_coverage", rows),
        "outline_iou": rate("outline_iou", truth_rows),
        "connected": rate("connected", rows),
        "corridor_axis_ok": rate("corridor_axis_ok", rows),
        "completion_tokens_mean": mean([r["completion_tokens"] for r in rows]),
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
    ap.add_argument("--pattern", default="*", help="파일 이름 패턴 (예: evac_4F_*)")
    ap.add_argument("--building", default="우정정보관", help="건물 힌트")
    ap.add_argument("--max-side", type=int, default=2048,
                    help="전송 이미지 긴 변 px. prod 업로드는 1280px 이하(2MB 제한), 0이면 원본 그대로")
    ap.add_argument("--overlay", action="store_true", help="results/raw/에 그래프를 겹친 PNG 저장")
    ap.add_argument("--reasoning", choices=["minimal", "low", "medium", "high"],
                    help="OpenRouter reasoning effort (지정 안 하면 모델 기본값)")
    args = ap.parse_args()

    images = [p for p in list_images(DATA_DIR / "evac") if p.match(args.pattern)][: args.limit]
    if not images:
        raise SystemExit(f"{DATA_DIR / 'evac'}에 사진이 없습니다 (evac_<층>_<조건>.jpg)")
    system, schema, stamp = load_prompt("evac-map"), load_schema("evac-map"), run_stamp()

    summaries = []
    for model in args.model:
        print(f"\n===== {model} ({len(images)}장) =====")
        summaries.append(run_model(model, images, args, system, schema, stamp))

    print("\n목표: json_valid 100% · room_recall ≥80% · room_precision ≥90% · current_node_ok ≥90% · "
          "vertical_found ≥90% · connected 100% · latency ≤10s")
    print_table(
        ["model", "n", "json_valid", "room_recall", "room_prec", "current_ok", "vertical", "connected",
         "ref_match", "floor", "elev_cnt", "outline cov/iou", "corridor_axis", "out_tokens", "latency avg/max", "cost $"],
        [[s["model"], s["n_images"], fmt(s["json_valid"], True), fmt(s["room_recall"], True),
          fmt(s["room_precision"], True), fmt(s["current_node_ok"], True), fmt(s["vertical_found"], True),
          fmt(s["connected"], True), fmt(s["ref_match"], True), fmt(s["floor_ok"], True),
          fmt(s["elevator_count_ok"], True), f"{fmt(s['outline_coverage'], True)}/{fmt(s['outline_iou'], digits=2)}",
          fmt(s["corridor_axis_ok"], True), fmt(s["completion_tokens_mean"], digits=0),
          f"{fmt(s['latency_s_mean'], digits=1)}/{fmt(s['latency_s_max'], digits=1)}s",
          fmt(s["cost_usd_total"], digits=4)] for s in summaries])


if __name__ == "__main__":
    main()
