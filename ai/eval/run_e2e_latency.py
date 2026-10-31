#!/usr/bin/env python3
"""배포된 API에 앱과 같은 방식으로 사진을 보내 사용자가 체감하는 전체 시간(업로드 + 서버 + AI + 응답)을 잰다.

앱(frontend/src/lib/gilgyeol/api.ts, CheckpointScanner.tsx)과 같은 조건:
  - 사진을 긴 변 1280px JPEG(품질 0.7)로 줄여 multipart로 보낸다
  - 체크포인트: POST /api/checkpoint (image, expected_node)
  - 피난안내도: POST /api/evac-map/parse (image, building, floor)

서버 쪽 rate limit(체크포인트 60/분, 안내도 10/분) 안에서 한 장씩 순서대로 보낸다.
비용은 배포 서버의 API 키로 나간다.

  python ai/eval/run_e2e_latency.py --task checkpoint
  python ai/eval/run_e2e_latency.py --task evac --pattern "evac_4F_*"
"""

from __future__ import annotations

import argparse
import io
import re
import statistics
import time
from pathlib import Path

import requests

from common import DATA_DIR, RESULTS_DIR, fmt, list_images, load_image, mean, print_table, run_stamp, write_csv, \
    write_summary_json

DEFAULT_API = "https://inthon-api.hakeemiridza.com"


def app_jpeg(path: Path, max_side: int = 1280, quality: int = 70) -> bytes:
    """앱의 downscale()과 같게: 긴 변 max_side 이하로 줄이고 JPEG 품질 0.7."""
    img = load_image(path).convert("RGB")
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def deployed_nodes(api: str) -> set[str]:
    """배포 DB에 있는 노드 id. expected_node가 DB에 없으면 422가 나므로 미리 확인한다."""
    ids: set[str] = set()
    for q in "1234567890":  # /api/search는 q가 있어야 결과를 준다 (호수 숫자로 검색)
        try:
            ids |= {n["id"] for n in requests.get(f"{api}/api/search", params={"q": q}, timeout=15).json().get("data", [])}
        except (requests.RequestException, ValueError):
            pass
    return ids


def expected_for(path: Path, default: str, known: set[str]) -> str:
    """room_405_* → 4F-405, room_102_* → 1F-102. 배포 DB에 없는 노드거나 문패 사진이 아니면 default.
    응답 시간은 어떤 노드를 기대하든 같다 (AI 호출은 같고 매칭만 달라짐)."""
    m = re.match(r"room_(\d)(\d{2}[A-Za-z]?)", path.stem)
    node = f"{m.group(1)}F-{m.group(1)}{m.group(2).upper()}" if m else default
    return node if node in known else default


def main() -> None:
    ap = argparse.ArgumentParser(description="배포 API 전체 응답 시간")
    ap.add_argument("--task", choices=["checkpoint", "evac"], required=True)
    ap.add_argument("--api", default=DEFAULT_API)
    ap.add_argument("--pattern", default="*")
    ap.add_argument("--exclude", default="*poster*")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--building", default="우정정보관")
    ap.add_argument("--expected", default="4F-405", help="체크포인트 expected_node 기본값")
    ap.add_argument("--max-side", type=int, default=1280)
    args = ap.parse_args()

    folder = "checkpoint" if args.task == "checkpoint" else "evac"
    images = [p for p in list_images(DATA_DIR / folder)
              if p.match(args.pattern) and not (args.exclude and p.match(args.exclude))][: args.limit]
    if not images:
        raise SystemExit(f"{DATA_DIR / folder}에 사진이 없습니다")

    known = deployed_nodes(args.api) if args.task == "checkpoint" else set()
    if args.task == "checkpoint":
        print(f"배포 DB 노드 {len(known)}개: {sorted(known)}")
    rows = []
    gap = 1.2 if args.task == "checkpoint" else 6.5  # rate limit 여유
    for i, path in enumerate(images):
        body = app_jpeg(path, args.max_side)
        files = {"image": (path.stem + ".jpg", body, "image/jpeg")}
        if args.task == "checkpoint":
            url, data = f"{args.api}/api/checkpoint", {"expected_node": expected_for(path, args.expected, known)}
        else:
            m = re.match(r"evac_([^_]+)_", path.stem + "_")
            url, data = f"{args.api}/api/evac-map/parse", {"building": args.building, "floor": m.group(1).upper() if m else "1F"}
        t0 = time.perf_counter()
        try:
            res = requests.post(url, files=files, data=data, headers={"Accept": "application/json"}, timeout=120)
            elapsed, code = time.perf_counter() - t0, res.status_code
            js = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
        except requests.RequestException as e:
            elapsed, code, js = time.perf_counter() - t0, None, {"message": str(e)}
        d = js.get("data") or {}
        row = {"image": path.name, "upload_kb": round(len(body) / 1024), "http": code, "seconds": round(elapsed, 2),
               **({"expected_node": data["expected_node"], "status": d.get("status"), "read": " ".join(d.get("read") or [])}
                  if args.task == "checkpoint" else
                  {"floor": data["floor"], "n_nodes": len(d.get("nodes") or []), "floor_source": d.get("floor_source")}),
               "error": None if code == 200 else (js.get("message") or str(code))}
        rows.append(row)
        print(f"  {path.name}: {row['seconds']}s http={code} {row.get('status') or row.get('n_nodes')} {row['error'] or ''}")
        if i < len(images) - 1:
            time.sleep(gap)

    ok = [r["seconds"] for r in rows if r["http"] == 200]
    stamp = run_stamp()
    csv_path = RESULTS_DIR / f"e2e_{args.task}_px{args.max_side}_{stamp}.csv"
    write_csv(csv_path, rows)
    summary = {"task": f"e2e_{args.task}", "model": f"deployed {args.api} {args.max_side}px", "run": stamp,
               "n_images": len(rows), "n_ok": len(ok), "latency_s_mean": mean(ok),
               "latency_s_p50": statistics.median(ok) if ok else None, "latency_s_max": max(ok, default=None),
               "latency_s_min": min(ok, default=None), "csv": csv_path.name}
    write_summary_json(csv_path.with_suffix(".summary.json"), summary)
    print_table(["작업", "성공/전체", "평균", "p50", "최소", "최대"],
                [[args.task, f"{len(ok)}/{len(rows)}", fmt(summary["latency_s_mean"], digits=1),
                  fmt(summary["latency_s_p50"], digits=1), fmt(summary["latency_s_min"], digits=1),
                  fmt(summary["latency_s_max"], digits=1)]])


if __name__ == "__main__":
    main()
