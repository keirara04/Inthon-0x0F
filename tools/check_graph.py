#!/usr/bin/env python3
"""Checks hand-built floor graph JSON (업무분담.md format) before it goes into the seeder.

Usage (repo root, Python 3.9+, no installs):
    python3 tools/check_graph.py                                  # backend/database/seeders/data/*.json
    python3 tools/check_graph.py my/1F.json my/4F.json            # specific files

Exit 0 = OK to seed (warnings are allowed), 1 = fix the ❌ errors first.
Mirrors what GraphImporter / RouteService do, so a pass here means the demo route works after seeding.
"""
import glob
import json
import re
import sys
from collections import defaultdict, deque

NODE_TYPES = {"room", "junction", "stairs", "elevator_hall", "entrance", "exit", "landmark"}
FLOOR_RE = re.compile(r"^(B\d+|\d+F)$")
# The frontend start screen and the demo route depend on these ids.
REQUIRED_IDS = {"1F-entrance", "1F-elev-A", "1F-stairs-W", "4F-405"}
DEMO_ROUTE = ("1F-entrance", "4F-405")

errors, warnings = [], []


def err(where, msg):
    errors.append(f"❌ {where}: {msg}")


def warn(where, msg):
    warnings.append(f"⚠️  {where}: {msg}")


def level(floor):
    m = re.match(r"^B(\d+)$", floor)
    return -int(m.group(1)) if m else int(floor[:-1])


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_floor(path, g):
    """Validates one floor file. Returns (floor, nodes by id, walk edges) or None if unusable."""
    if not isinstance(g, dict):
        err(path, "최상위가 JSON 객체가 아님")
        return None
    for key in ("building", "floor", "nodes", "edges"):
        if key not in g:
            err(path, f"'{key}' 없음")
    if errors and any(e.startswith(f"❌ {path}") for e in errors):
        return None

    floor = g["floor"]
    if not isinstance(floor, str) or not FLOOR_RE.match(floor):
        err(path, f"floor '{floor}' 형식이 틀림 (1F, 4F, B1 처럼)")
        return None
    where = f"{path} [{floor}]"

    nodes = {}
    for i, n in enumerate(g["nodes"]):
        at = f"{where} nodes[{i}]"
        if not isinstance(n, dict):
            err(at, "객체가 아님")
            continue
        nid = n.get("id")
        if not isinstance(nid, str) or not nid:
            err(at, "id 없음")
            continue
        at = f"{where} 노드 '{nid}'"
        if not nid.startswith(f"{floor}-"):
            err(at, f"id는 '{floor}-'로 시작해야 함")
        if nid in nodes:
            err(at, "id 중복")
        if n.get("type") not in NODE_TYPES:
            err(at, f"type '{n.get('type')}' 틀림 ({', '.join(sorted(NODE_TYPES))})")
        if not isinstance(n.get("label"), str):
            err(at, "label 없음")
        elif not n["label"].strip() and n.get("type") != "junction":  # corridor junctions don't need a name
            err(at, "label 없음 (교차점 junction만 비워도 됨)")
        for axis in ("x", "y"):
            v = n.get(axis)
            if not is_num(v) or not 0 <= v <= 1:
                err(at, f"{axis}={v!r}: 0~1 사이 숫자여야 함 (안내도 이미지 기준 비율)")
        if n.get("type") in ("stairs", "elevator_hall") and not n.get("ref"):
            err(at, "계단·엘리베이터 홀에는 ref 필수 (예: \"elev-1\", \"stairs-1\"). 없으면 층끼리 안 이어짐")
        if n.get("type") == "room" and not re.search(r"\d", n.get("label", "")):
            warn(at, f"방 label '{n.get('label')}'에 숫자가 없음. 카메라 체크포인트(호실 번호)로 확인 불가")
        nodes[nid] = n

    edges = []
    for i, e in enumerate(g["edges"]):
        at = f"{where} edges[{i}]"
        if not isinstance(e, dict):
            err(at, "객체가 아님")
            continue
        a, b = e.get("from"), e.get("to")
        at = f"{where} 간선 {a}→{b}"
        for end in (a, b):
            if end not in nodes:
                err(at, f"'{end}' 노드가 이 층에 없음")
        if a == b:
            err(at, "자기 자신으로 가는 간선")
        if e.get("type", "walk") != "walk":
            err(at, "층 안 간선 type은 walk만 (층 사이 간선은 백엔드가 ref로 자동 생성)")
        length = e.get("length_m")
        if not is_num(length) or length <= 0:
            err(at, f"length_m={length!r}: 0보다 큰 숫자 (미터, 걸음 수×0.7)")
        h = e.get("heading_deg")
        if h is None:
            warn(at, "heading_deg 없음. 이 구간은 진동 방향 안내 불가")
        elif not is_num(h) or not 0 <= h <= 360:
            err(at, f"heading_deg={h!r}: 0~360 (북쪽 0°, 시계 방향)")
        if a in nodes and b in nodes:
            edges.append((a, b))

    # Every node on the floor should be reachable from the others.
    adj = defaultdict(set)
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    if nodes:
        start = g.get("current_node_id") if g.get("current_node_id") in nodes else next(iter(nodes))
        seen = bfs(adj, start)
        cut = sorted(set(nodes) - seen)
        if cut:
            err(where, f"'{start}'에서 갈 수 없는 노드: {', '.join(cut)} (간선 빠짐)")

    if g.get("current_node_id") is not None and g.get("current_node_id") not in nodes:
        warn(where, f"current_node_id '{g['current_node_id']}'가 노드에 없음")

    return floor, nodes, edges, g.get("elevators", []), g["building"]


def bfs(adj, start):
    seen, q = {start}, deque([start])
    while q:
        for nxt in adj[q.popleft()]:
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    return seen


def check_building(floors):
    """Cross-floor checks: elevators, stairs, required ids, and the demo route."""
    all_nodes = {nid: (fl, n) for fl, nodes, *_ in floors for nid, n in nodes.items()}
    adj = defaultdict(set)
    for _, _, edges, *_ in floors:
        for a, b in edges:
            adj[a].add(b)
            adj[b].add(a)

    elevators = {}
    for fl, _, _, els, _ in floors:
        for el in els:
            at = f"elevators '{el.get('id')}' ({fl} 파일)"
            if not isinstance(el.get("id"), str) or not isinstance(el.get("name"), str):
                err(at, "id, name 필요")
                continue
            sf = el.get("served_floors")
            if not isinstance(sf, list) or not all(isinstance(f, str) and FLOOR_RE.match(f) for f in sf):
                err(at, "served_floors는 [\"1F\", \"4F\"] 같은 층 라벨 목록")
                continue
            elevators[el["id"]] = set(sf)

    by_ref = defaultdict(list)
    for nid, (fl, n) in all_nodes.items():
        if n.get("ref"):
            by_ref[n["ref"]].append((nid, fl, n.get("type")))

    for ref, group in by_ref.items():
        types = {t for _, _, t in group}
        if len(types) > 1:
            err(f"ref '{ref}'", f"계단과 엘리베이터가 같은 ref를 씀: {group}")
        if "elevator_hall" in types:
            if ref not in elevators:
                err(f"ref '{ref}'", "elevators 목록에 이 id가 없음 (served_floors를 알 수 없어 층 연결 안 됨)")
                continue
            for nid, fl, _ in group:
                if fl not in elevators[ref]:
                    warn(f"ref '{ref}'", f"{nid}가 있는 {fl}은 served_floors에 없음. 이 층에서는 안 탐")
            on = [(nid, fl) for nid, fl, _ in group if fl in elevators[ref]]
            for a, _ in on:
                for b, _ in on:
                    if a != b:
                        adj[a].add(b)
        elif "stairs" in types:
            for a, fa, _ in group:
                for b, fb, _ in group:
                    if a != b and abs(level(fa) - level(fb)) == 1:
                        adj[a].add(b)
        if len(group) == 1:
            warn(f"ref '{ref}'", f"한 층({group[0][1]})에만 있음. 다른 층과 안 이어짐")

    loaded = {fl for fl, *_ in floors}
    for rid in sorted(REQUIRED_IDS):
        if rid.split("-")[0] in loaded and rid not in all_nodes:
            err("필수 id", f"'{rid}' 없음 (프론트 시작 화면·데모 경로가 이 id를 씀)")

    a, b = DEMO_ROUTE
    if a in all_nodes and b in all_nodes:
        if b in bfs(adj, a):
            print(f"✅ 데모 경로 {a} → {b} 연결됨")
        else:
            err("데모 경로", f"{a} → {b} 갈 수 없음. 엘리베이터 served_floors에 1F·4F가 둘 다 있는지, ref가 같은지 확인")


def main(paths):
    if not paths:
        paths = sorted(glob.glob("backend/database/seeders/data/*.json"))
    if not paths:
        print("검사할 JSON이 없음")
        return 1
    floors, seen_floors = [], {}
    for p in paths:
        try:
            with open(p, encoding="utf-8") as f:
                g = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            err(p, f"JSON을 읽을 수 없음: {e}")
            continue
        r = check_floor(p, g)
        if r:
            if r[0] in seen_floors:
                err(p, f"{r[0]}이 {seen_floors[r[0]]}에도 있음 (층마다 파일 1개)")
            seen_floors[r[0]] = p
            floors.append(r)
            print(f"📄 {p}: {r[0]} · 노드 {len(r[1])} · 간선 {len(r[2])}")
    if floors:
        check_building(floors)
    for line in warnings + errors:
        print(line)
    print(f"\n{'❌ 오류 ' + str(len(errors)) + '개, 고친 뒤 다시 실행' if errors else '✅ 시드해도 됨'} · 경고 {len(warnings)}개")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
