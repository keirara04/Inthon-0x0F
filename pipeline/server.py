"""A localhost upload button and JSON endpoint for automatic vector extraction.

Run from the repository root: python3 -m pipeline.server
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import tempfile
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from .map_pipeline import MAX_FILE_BYTES, PipelineError, api_connection, load_image, vision_model
from .vectorize import convert_photo


class ServiceError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code = status, code


def convert_upload(body, *, api_key=None, model=None):
    """Convert image bytes to a browser response; no trace or sample fallback."""
    if not body:
        raise ServiceError(400, "EMPTY_IMAGE", "Choose a map image first.")
    if len(body) > MAX_FILE_BYTES:
        raise ServiceError(413, "IMAGE_TOO_LARGE", "Choose a map image smaller than 6 MB.")
    key = os.environ.get("OPENAI_API_KEY", "") if api_key is None else api_key
    selected_model = model or vision_model()
    # Each request gets an isolated workspace, removed after response generation.
    with tempfile.TemporaryDirectory(prefix="map-vector-upload-") as tmp:
        photo = Path(tmp) / "uploaded-map.image"
        photo.write_bytes(body)
        try:
            load_image(photo)
        except PipelineError as error:
            raise ServiceError(400, "INVALID_IMAGE", str(error)) from error
        if not key.strip():
            raise ServiceError(503, "NOT_CONFIGURED", "The Python server needs your Lablup API key. Restart it with: bash pipeline/start.sh")
        try:
            plan, artifacts = convert_photo(photo, key, selected_model)
        except PipelineError as error:
            cause = error.__cause__
            provider_error = isinstance(cause, urllib.error.HTTPError)
            timed_out = isinstance(cause, (TimeoutError, socket.timeout))
            status = 504 if timed_out else 502 if provider_error or isinstance(cause, urllib.error.URLError) else 422
            raise ServiceError(status, "EXTRACTION_FAILED", str(error)) from error
    return {
        "plan": plan,
        "svg": artifacts["vector.svg"].decode("utf-8"),
        "overlay_svg": artifacts["overlay.svg"].decode("utf-8"),
        "review_required": True,
    }


def validate_request_headers(headers, host):
    """Reject cross-origin requests, DNS rebinding, and unbounded upload bodies."""
    if headers.get("Host") not in {f"127.0.0.1:{host[1]}", f"localhost:{host[1]}"}:
        raise ServiceError(403, "INVALID_HOST", "Use this server’s localhost URL.")
    origin = headers.get("Origin")
    if origin and origin not in {f"http://127.0.0.1:{host[1]}", f"http://localhost:{host[1]}"}:
        raise ServiceError(403, "INVALID_ORIGIN", "Upload from the local conversion page.")
    if headers.get("Transfer-Encoding"):
        raise ServiceError(400, "INVALID_BODY", "Send an image with a Content-Length header.")
    lengths = headers.get_all("Content-Length", [])
    if not lengths:
        raise ServiceError(411, "LENGTH_REQUIRED", "An image Content-Length is required.")
    if len(lengths) != 1 or not lengths[0].isascii() or not lengths[0].isdigit():
        raise ServiceError(400, "INVALID_LENGTH", "Invalid image length.")
    length = int(lengths[0])
    if length < 1:
        raise ServiceError(400, "EMPTY_IMAGE", "Choose a map image first.")
    if length > MAX_FILE_BYTES:
        raise ServiceError(413, "IMAGE_TOO_LARGE", "Choose a map image smaller than 6 MB.")
    mime = headers.get("Content-Type", "").split(";", 1)[0].strip()
    if mime not in {"image/jpeg", "image/png", "image/webp", "application/octet-stream"}:
        raise ServiceError(415, "INVALID_FORMAT", "Use a JPG, PNG, or WebP image.")
    return length


class ConversionServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, *, converter=convert_upload):
        self.conversion_slot = threading.BoundedSemaphore(1)
        self.converter = converter
        super().__init__(address, Handler)


class Handler(BaseHTTPRequestHandler):
    server_version = "MapConverter/1.0"

    def _reply(self, status, content, mime="application/json; charset=utf-8"):
        payload = content if isinstance(content, bytes) else json.dumps(content, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        assets = {"/": ("button.html", "text/html; charset=utf-8"), "/button.js": ("button.js", "text/javascript; charset=utf-8"), "/button.css": ("button.css", "text/css; charset=utf-8")}
        asset = assets.get(urlsplit(self.path).path)
        if asset:
            self._reply(200, (Path(__file__).parent / "web" / asset[0]).read_bytes(), asset[1])
        else:
            self._reply(404, {"error": "Page not found."})

    def do_POST(self):
        if urlsplit(self.path).path != "/api/vectorize":
            self._reply(404, {"error": "Endpoint not found."}); return
        acquired = False
        try:
            length = validate_request_headers(self.headers, self.server.server_address)
            acquired = self.server.conversion_slot.acquire(blocking=False)
            if not acquired:
                raise ServiceError(429, "BUSY", "A map is already being converted. Wait for it to finish, then try again.")
            self.connection.settimeout(15)
            body = self.rfile.read(length)
            if len(body) != length:
                raise ServiceError(400, "INCOMPLETE_IMAGE", "The upload was interrupted. Please try again.")
            result = self.server.converter(body)
            self._reply(200, result)
        except ServiceError as error:
            self.close_connection = True
            if error.code == "EXTRACTION_FAILED":
                self.log_message("Conversion error: %s", str(error))
            self._reply(error.status, {"error": str(error), "code": error.code})
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        except (TimeoutError, socket.timeout):
            self.close_connection = True
            self._reply(408, {"error": "Image upload timed out. Please try again.", "code": "UPLOAD_TIMEOUT"})
        except Exception:
            self.close_connection = True
            self._reply(500, {"error": "Conversion failed unexpectedly. Please try again.", "code": "INTERNAL_ERROR"})
        finally:
            if acquired:
                self.server.conversion_slot.release()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Local upload → automatic SVG + JSON conversion button")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("port must be between 1 and 65535")
    try:
        base_url, api_format = api_connection()
    except PipelineError as error:
        parser.error(str(error))
    server = ConversionServer(("127.0.0.1", args.port))
    print(f"Map conversion button: http://127.0.0.1:{args.port}", flush=True)
    print(f"Image API: {base_url} ({api_format})", flush=True)
    print(f"Vision model: {vision_model()}", flush=True)
    if not os.environ.get("OPENAI_API_KEY", "").strip():
        print("API key is missing. Use bash pipeline/start.sh to enter your Lablup key privately.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
