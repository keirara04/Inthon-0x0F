"""backend/app/Services/CheckpointMatcher.php + GraphImporter 랜드마크 저장 규칙의 Python 이식.

평가 숫자가 prod와 같도록 PHP와 한 줄씩 맞춘다. PHP 쪽을 바꾸면 여기도 같이 바꿀 것.
(PHP 정규식의 \\d, \\D는 /u만 있고 UCP가 없어 ASCII 숫자만 뜻하므로 여기서는 [0-9]로 쓴다.)
"""

from __future__ import annotations

import re

LINE_BREAK = re.compile(r"\r\n|[\n\v\f\r\x85  ]")  # PCRE \R


def canonical(text: str) -> str | None:
    """CheckpointMatcher::canonical. 카메라 쪽과 랜드마크 저장(GraphImporter)이 같이 쓴다.

    '405호' → '405', '401A호'/'401 A' → '401A', 'B101호' → 'B101'(지하 호실), '4층'/'4F' → '4F',
    '지하1층'/'B1' → 'B1'(층은 B + 1~2자리만), '401A 강의실' → '401A', 그 밖은 None (엘리베이터 표시등 '6'도 None).
    정확한 형태 먼저, 그다음 긴 글자 안의 호실 번호나 층 표지.
    """
    t = re.sub(r"\s+", "", text).upper()
    if m := re.fullmatch(r"(?:지하([0-9]{1,2})층?|B([0-9]{1,2})(?:층|F)?)", t):
        return "B" + (m.group(1) if m.group(1) not in (None, "", "0") else (m.group(2) or ""))  # PHP: $m[1] ?: $m[2]
    if m := re.fullmatch(r"([0-9]{1,2})(?:층|F)", t):
        return f"{m.group(1)}F"
    if m := re.fullmatch(r"(B?[0-9]{2,4}[A-Z]?)(?:호실?)?", t):
        return m.group(1)
    if m := re.search(r"(?<![0-9A-Z])(B?[0-9]{3,4}[A-Z]?)(?![0-9A-Z])", t):
        return m.group(1)
    if m := re.search(r"(?<![0-9])([0-9]{1,2})(?:층|F)(?![A-Z])", t):
        return f"{m.group(1)}F"
    return None


def landmarks_from_graphs(graphs: list[dict]) -> list[dict]:
    """GraphImporter::importFloor와 같은 형태: room → room_no(canonical(라벨), 안 되면 라벨 그대로), 엘리베이터 홀·계단 → floor_sign(층 라벨)."""
    out = []
    for g in graphs:
        for n in g["nodes"]:
            if n["type"] == "room":
                out.append({"node_id": n["id"], "floor": g["floor"], "label": n["label"], "kind": "room_no",
                            "ocr_text": canonical(n["label"]) or n["label"]})
            elif n["type"] in ("elevator_hall", "stairs"):
                out.append({"node_id": n["id"], "floor": g["floor"], "label": n["label"], "kind": "floor_sign",
                            "ocr_text": g["floor"]})
    return out


def match(texts: list[str], expected_node: str, landmarks: list[dict]) -> dict:
    """CheckpointMatcher::match. status: matched | mismatch | unknown."""
    lines = [line for t in (texts or [""]) for line in LINE_BREAK.split(t)]
    read = list(dict.fromkeys(c for c in map(canonical, lines) if c))
    expected_floor = next((l["floor"] for l in landmarks if l["node_id"] == expected_node), None)

    hits = [l for l in landmarks if l["ocr_text"] in read]
    hits.sort(key=lambda h: (h["floor"] != expected_floor, h["kind"] != "room_no"))  # 안정 정렬 = PHP sortBy
    node = next((h for h in hits if h["node_id"] == expected_node), hits[0] if hits else None)

    return {
        "status": "unknown" if node is None else "matched" if node["node_id"] == expected_node else "mismatch",
        "read": read,
        "node": node["node_id"] if node else None,
    }


if __name__ == "__main__":
    # backend/tests/Feature/VisionTest.php 의 기대값을 그대로 옮긴 자체 검사
    cases = [("405호", "405"), ("4 층", "4F"), ("지하1층", "B1"), ("엘리베이터", None), ("405 강의실", "405"),
             ("4층 엘리베이터", "4F"), ("401A호", "401A"), ("401 A", "401A"), ("401A 강의실", "401A"),
             ("B101호", "B101"), ("B1", "B1"), ("B1F", "B1"), ("지하 1층", "B1"), ("6", None)]
    bad = 0
    for text, want in cases:
        got = canonical(text)
        bad += got != want
        print(f"{'OK ' if got == want else 'BAD'} canonical({text!r}) = {got!r} (기대 {want!r})")
    floor4 = {"floor": "4F", "nodes": [{"id": "4F-elev-A", "type": "elevator_hall", "label": "중앙 엘리베이터 홀"},
                                       {"id": "4F-401", "type": "room", "label": "401호"}, {"id": "4F-405", "type": "room", "label": "405호"}]}
    floor3 = {"floor": "3F", "nodes": [{"id": "3F-301A", "type": "room", "label": "301A호"}, {"id": "3F-301B", "type": "room", "label": "301B호"}]}
    lm = landmarks_from_graphs([floor4, floor3])
    flows = [(["405호"], "4F-405", "matched", "4F-405"), (["401 호"], "4F-405", "mismatch", "4F-401"), ([], "4F-405", "unknown", None),
             (["4층"], "4F-elev-A", "matched", "4F-elev-A"), (["301A"], "3F-301A", "matched", "3F-301A"),
             (["301B호"], "3F-301A", "mismatch", "3F-301B"), (["301"], "3F-301A", "unknown", None),
             (["405\n강의실"], "4F-405", "matched", "4F-405")]
    for texts, expected, want_status, want_node in flows:
        r = match(texts, expected, lm)
        ok = r["status"] == want_status and r["node"] == want_node
        bad += not ok
        print(f"{'OK ' if ok else 'BAD'} match({texts!r}, {expected}) = {r['status']} {r['node']} (기대 {want_status} {want_node})")
    print("불일치", bad, "건")
