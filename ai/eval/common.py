"""평가 스크립트 공통: OpenRouter 클라이언트, 이미지 인코딩, 시간 측정, 스키마 검사, 정규화, CSV 저장."""

from __future__ import annotations

import base64
import csv
import io
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import requests
from jsonschema import Draft202012Validator
from PIL import Image, ImageOps

AI_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = AI_DIR.parent
# 프롬프트·스키마 원본은 백엔드 하나 (VisionClient가 같은 파일을 읽는다)
PROMPTS_DIR = REPO_ROOT / "backend" / "resources" / "prompts"
SCHEMA_DIR = REPO_ROOT / "backend" / "resources" / "schemas"
# 정답 = 백엔드 시드 그래프 (명성 검수 데이터, <건물>-<층>.json)
TRUTH_DIR = REPO_ROOT / "backend" / "database" / "seeders" / "data"
DATA_DIR = AI_DIR / "eval" / "data"
RESULTS_DIR = AI_DIR / "eval" / "results"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# Windows 콘솔에서 한글·이모지 출력이 깨지지 않게
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


# ---------------------------------------------------------------- 설정

def load_env(name: str, default: str | None = None) -> str | None:
    """환경변수 → ai/.env → backend/.env 순서로 찾는다."""
    if os.environ.get(name):
        return os.environ[name]
    for env_file in (AI_DIR / ".env", REPO_ROOT / "backend" / ".env"):
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            m = re.match(rf"\s*{name}\s*=\s*(.*)", line)
            if m and m.group(1).strip().strip("\"'"):
                return m.group(1).strip().strip("\"'")
    return default


def load_api_key(name: str = "OPENROUTER_API_KEY") -> str:
    key = load_env(name)
    if not key:
        sys.exit(f"{name}가 없습니다. 환경변수나 ai/.env에 넣으세요 (커밋 금지).")
    return key


def load_prompt(name: str) -> str:
    """backend/resources/prompts/<name>.md 전체 (VisionClient처럼 그대로 보낸다)."""
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def load_schema(name: str) -> dict:
    return json.loads((SCHEMA_DIR / f"{name}.json").read_text(encoding="utf-8"))


def load_truth(building: str, floor: str) -> dict | None:
    path = TRUTH_DIR / f"{building}-{floor}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def load_truth_floors(building: str) -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(TRUTH_DIR.glob(f"{building}-*.json"))]


def api_schema(schema: dict) -> dict:
    """OpenRouter에 보낼 때는 $schema/$id 메타 키를 뺀다 (일부 provider가 거부함)."""
    return {k: v for k, v in schema.items() if k not in ("$schema", "$id")}


def schema_errors(schema: dict, obj) -> list[str]:
    v = Draft202012Validator(schema)
    return [f"{'/'.join(map(str, e.path)) or '<root>'}: {e.message}" for e in v.iter_errors(obj)]


# ---------------------------------------------------------------- 이미지

def list_images(folder: Path) -> list[Path]:
    return sorted(p for p in folder.iterdir() if p.suffix.lower() in IMAGE_EXTS) if folder.exists() else []


def load_image(path: Path) -> Image.Image:
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")  # 폰 사진 회전 보정


def image_data_url(path: Path, img: Image.Image, max_side: int) -> str:
    """max_side=0이면 파일을 그대로 보낸다 (현재 prod VisionClient와 같음). 아니면 긴 변을 줄여 JPEG로."""
    if max_side == 0:
        mime = "image/png" if path.suffix.lower() == ".png" else "image/webp" if path.suffix.lower() == ".webp" else "image/jpeg"
        return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()
    return to_data_url(img, max_side)


def to_data_url(img: Image.Image, max_side: int, quality: int = 85) -> str:
    img = img.copy()
    img.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------- OpenRouter

def extract_json(text: str):
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise
        return json.loads(m.group(0))


def call_vision(model: str, system: str, user_text: str, data_url: str, schema: dict, schema_name: str,
                timeout: int = 120, reasoning: str | None = None) -> dict:
    """structured output으로 호출한다. provider가 json_schema를 거부하면 json_object로 한 번 더 시도.

    reasoning: OpenRouter reasoning effort (minimal/low/medium/high). None이면 모델 기본값.
    model이 'lablup:<id>'이면 Lablup(Anthropic Messages 형식)으로 보낸다.
    반환: {data, raw, latency_s, usage, cost_usd, format, error}
    """
    if model.startswith("lablup:"):
        return call_lablup(model.split(":", 1)[1], system, user_text, data_url, schema, timeout)
    key = load_api_key()
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": [
            {"type": "text", "text": user_text},
            {"type": "image_url", "image_url": {"url": data_url}},
        ]},
    ]
    formats = [
        ("json_schema", {"type": "json_schema",
                         "json_schema": {"name": schema_name, "strict": True, "schema": api_schema(schema)}}),
        ("json_object", {"type": "json_object"}),
    ]
    result = {"data": None, "raw": "", "latency_s": None, "usage": {}, "cost_usd": None, "format": None, "error": None}
    for fmt, response_format in formats:
        body = {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "response_format": response_format,
            "usage": {"include": True},  # 응답에 cost 포함
        }
        if reasoning:
            body["reasoning"] = {"effort": reasoning}
        if fmt == "json_schema":
            body["provider"] = {"require_parameters": True}  # structured output 지원 provider로만 라우팅
        t0 = time.perf_counter()
        try:
            res = requests.post(OPENROUTER_URL, json=body, timeout=timeout, headers={
                "Authorization": f"Bearer {key}",
                "X-Title": "gilgyeol-ai-eval",
            })
        except requests.RequestException as e:
            result.update(error=f"network: {e}", latency_s=time.perf_counter() - t0)
            return result
        latency = time.perf_counter() - t0
        if res.status_code >= 400:
            result.update(error=f"HTTP {res.status_code}: {res.text[:300]}", latency_s=latency)
            if fmt == "json_schema" and res.status_code in (400, 404, 422):
                continue  # structured output 미지원일 수 있음 → json_object로 재시도
            return result
        payload = res.json()
        if "choices" not in payload:
            result.update(error=f"no choices: {json.dumps(payload, ensure_ascii=False)[:300]}", latency_s=latency)
            return result
        raw = payload["choices"][0]["message"].get("content") or ""
        usage = payload.get("usage") or {}
        result.update(raw=raw, latency_s=latency, usage=usage, cost_usd=usage.get("cost"), format=fmt, error=None)
        try:
            result["data"] = extract_json(raw)
        except json.JSONDecodeError as e:
            result["error"] = f"json parse: {e}"
        return result
    return result


def call_lablup(model: str, system: str, user_text: str, data_url: str, schema: dict, timeout: int = 120) -> dict:
    """Lablup은 structured output이 없어서 스키마를 프롬프트에 넣고, JSON 파싱에 실패하면 한 번 다시 요청한다."""
    key = load_api_key("LABLUP_API_KEY")
    base = load_env("LABLUP_BASE_URL", "https://api.console.lablup.ai/anthropic")
    media_type, b64 = re.match(r"data:([^;]+);base64,(.*)", data_url, re.S).groups()
    messages = [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
        {"type": "text", "text": f"{user_text}\n\n다음 JSON 스키마에 맞는 JSON 객체 하나만 출력하라:\n"
                                 f"{json.dumps(api_schema(schema), ensure_ascii=False)}"},
    ]}]
    result = {"data": None, "raw": "", "latency_s": 0.0, "usage": {}, "cost_usd": None, "format": "prompt_json",
              "error": None}
    for attempt in range(2):
        t0 = time.perf_counter()
        try:
            res = requests.post(f"{base}/v1/messages", timeout=timeout, headers={
                "Authorization": f"Bearer {key}", "anthropic-version": "2023-06-01",
            }, json={"model": model, "system": system, "messages": messages, "temperature": 0,
                     "max_tokens": 8000})  # 모델이 먼저 thinking을 하므로 넉넉하게
        except requests.RequestException as e:
            result.update(error=f"network: {e}")
            return result
        result["latency_s"] += time.perf_counter() - t0
        if res.status_code >= 400:
            result.update(error=f"HTTP {res.status_code}: {res.text[:300]}")
            return result
        payload = res.json()
        raw = "".join(c.get("text", "") for c in payload.get("content", []) if c.get("type") == "text")
        result.update(raw=raw, usage=payload.get("usage") or {}, error=None)
        try:
            result["data"] = extract_json(raw)
            return result
        except json.JSONDecodeError as e:
            result["error"] = f"json parse: {e}"
            messages = messages + [{"role": "assistant", "content": raw or "(빈 응답)"},
                                   {"role": "user", "content": "JSON 객체 하나만 출력하라. 설명·마크다운 없이."}]
    return result


# ---------------------------------------------------------------- 정규화

ROOM_NO_RE = re.compile(r"[A-Z]?\d{2,4}(?:-\d{1,2})?[A-Z]?")


def normalize_room(label: str | None) -> str:
    """'405호', '405 호', '405' → '405'. 번호가 없는 방(행정실)은 공백만 뺀 이름."""
    if not label:
        return ""
    s = re.sub(r"\s+", "", str(label)).upper()
    m = ROOM_NO_RE.search(s)
    return m.group(0) if m else s


# ---------------------------------------------------------------- 결과 저장

def run_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def model_tag(model: str, reasoning: str | None = None) -> str:
    return re.sub(r"[^A-Za-z0-9.-]+", "_", model) + (f"_r-{reasoning}" if reasoning else "")


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        return
    fields = list(dict.fromkeys(k for r in rows for k in r))
    with path.open("w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig: 엑셀에서 한글 안 깨짐
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)


def write_summary_json(path: Path, summary: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")


def mean(values) -> float | None:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def fmt(v, pct: bool = False, digits: int = 2) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "✅" if v else "❌"
    return f"{v * 100:.0f}%" if pct else f"{v:.{digits}f}"


def print_table(headers: list[str], rows: list[list]) -> None:
    widths = [max(len(str(h)), *(len(str(r[i])) for r in rows)) for i, h in enumerate(headers)] if rows else [len(h) for h in headers]
    line = lambda cells: "| " + " | ".join(str(c).ljust(w) for c, w in zip(cells, widths)) + " |"
    print(line(headers))
    print("|" + "|".join("-" * (w + 2) for w in widths) + "|")
    for r in rows:
        print(line(r))
