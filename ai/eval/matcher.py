"""backend/app/Services/CheckpointMatcher.php + GraphImporter 랜드마크 저장 규칙의 Python 이식.

평가 숫자가 prod와 같도록 PHP와 한 줄씩 맞춘다. PHP 쪽을 바꾸면 여기도 같이 바꿀 것.
(PHP 정규식의 \\d, \\D는 /u만 있고 UCP가 없어 ASCII 숫자만 뜻하므로 여기서는 [0-9]로 쓴다.)
"""

from __future__ import annotations

import re

LINE_BREAK = re.compile(r"\r\n|[\n\v\f\r\x85  ]")  # PCRE \R


def canonical(text: str) -> str | None:
    """'405호' → '405', '4층'/'4F' → '4F', '지하1층'/'B1' → 'B1', '405 강의실' → '405', 그 밖은 None.

    정확한 형태 먼저, 그다음 긴 글자 안의 3~4자리 호실 번호나 층 표지.
    """
    t = re.sub(r"\s+", "", text).upper()
    if m := re.fullmatch(r"(?:지하|B)([0-9]+)(?:층|F)?", t):
        return f"B{m.group(1)}"
    if m := re.fullmatch(r"([0-9]{1,2})(?:층|F)", t):
        return f"{m.group(1)}F"
    if m := re.fullmatch(r"([0-9]{2,4})(?:호실?)?", t):
        return m.group(1)
    if m := re.search(r"(?<![0-9])([0-9]{3,4})(?![0-9])", t):
        return m.group(1)
    if m := re.search(r"(?<![0-9])([0-9]{1,2})(?:층|F)(?![A-Z])", t):
        return f"{m.group(1)}F"
    return None


def landmarks_from_graphs(graphs: list[dict]) -> list[dict]:
    """GraphImporter::importFloor와 같은 형태: room → room_no(라벨의 숫자만), 엘리베이터 홀·계단 → floor_sign(층 라벨)."""
    out = []
    for g in graphs:
        for n in g["nodes"]:
            if n["type"] == "room":
                out.append({"node_id": n["id"], "floor": g["floor"], "label": n["label"], "kind": "room_no",
                            "ocr_text": re.sub(r"[^0-9]", "", n["label"]) or n["label"]})
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
    # PHP 주석의 예시 + 경계 사례
    for text, want in [("405호", "405"), ("4층", "4F"), ("4F", "4F"), ("지하1층", "B1"), ("B1", "B1"),
                       ("405 강의실", "405"), ("405호실", "405"), ("4층 강의실", "4F"), ("EXIT", None),
                       ("401A", "401"), ("119", "119"), ("2F", "2F")]:
        got = canonical(text)
        print(f"{'OK ' if got == want else 'BAD'} canonical({text!r}) = {got!r} (기대 {want!r})")
    lm = landmarks_from_graphs([{"floor": "4F", "nodes": [
        {"id": "4F-401A", "type": "room", "label": "401A호"}, {"id": "4F-401B", "type": "room", "label": "401B호"},
        {"id": "4F-elev-1", "type": "elevator_hall", "label": "엘리베이터"}]}])
    print("401B 문패, 예상 401A →", match(["401B"], "4F-401A", lm))
    print("405\\n강의실, 예상 401A →", match(["405\n강의실"], "4F-401A", lm))
