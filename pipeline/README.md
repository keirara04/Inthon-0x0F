# Map → diagram → JSON

A standalone Python workflow. It does not run Next.js, Laravel, MySQL, photo localization, or route guidance.

1. Decode and orient a single-floor map image.
2. Ask the vision model to identify up to five readable places and walkable corridor polylines.
3. Validate the intermediate diagram, convert bends and intersections into junctions, split shared corridors, and export the final spatial graph JSON.
4. Render the same geometry as a diagram and source-map overlay for review.

The editable intermediate is `diagram.json`. `diagram.svg` is its visual representation. The graph is built deterministically from the intermediate geometry, so it does not need another model call to reinterpret the drawing.

## Setup

From the repository root:

```sh
python3 -m venv pipeline/.venv
source pipeline/.venv/bin/activate
python -m pip install -r pipeline/requirements.txt
```

Requires Python 3.10+ and Pillow. No Node dependencies are needed.

## Extract an actual map

Set `OPENAI_API_KEY` to your **Lablup hackathon key** in your shell, then run:

```sh
python -m pipeline /absolute/path/to/map.png --output pipeline/output/my-map
```

The key is read only from the process environment; it is never written into output files. Defaults match the hackathon Connect snippet: base URL `https://api.console.lablup.ai/v1`, Chat Completions format, model `DeepSeek-V4.1-Flash-B300`. Override the exact model ID with `OPENAI_VISION_MODEL` or `--model`. The variable name `OPENAI_API_KEY` means an OpenAI-compatible API key here; use your Lablup key, not a separate OpenAI key. The oriented map preview is sent to the configured gateway. Image input and JSON output must be supported by that gateway/model.

Input formats: PNG, JPG, WebP; at most 6 MB and 20 million pixels. EXIF orientation is applied, transparency is composited on white, and the analysis preview is resized to at most 2048 pixels per side. Final graph coordinates refer to the **full-resolution oriented source image**, not the resized preview.

The pipeline fails explicitly if the key is missing, the model refuses, the image is unreadable, the provider fails, or the intermediate structure is invalid. It never substitutes sample places for an uploaded map.

## Outputs

| File | Purpose |
| --- | --- |
| `diagram.json` | Editable places and corridor polylines, with image hash and extraction provenance |
| `diagram.svg` | Standalone schematic of recognizable places and corridor junctions |
| `overlay.svg` | The graph drawn over an embedded copy of the oriented map preview |
| `graph.json` | Nodes and bidirectional edges, pixel geometry, connected components, and review warnings |

Open the SVGs in a browser or image editor. Existing output files are protected; use a different output directory or explicitly pass `--overwrite`.

## Review and regenerate JSON without another API call

Edit the `diagram` object inside the exported `diagram.json`, checking labels, doorway positions, corridor bends, and connections against `overlay.svg`. Then regenerate:

```sh
python -m pipeline /absolute/path/to/map.png \
  --diagram pipeline/output/my-map/diagram.json \
  --output pipeline/output/my-map-reviewed \
  --require-connected
```

The exported intermediate is bound to its source image by SHA-256 and dimensions. Using it with a different image fails. Hand-authored raw diagram objects are also accepted explicitly via `--diagram`, as in the example below.

Exit codes: `0` means artifacts were exported; `1` means invalid input or extraction failure; `2` means artifacts were exported but `--require-connected` detected disconnected components. Connectivity is not proof that corridors are correct. Every export has `review_required: true`; geometry and labels still need checking against the map. No wall detector or real-world distance calibration is claimed.

## Run the included example without an API key

```sh
python -m pipeline pipeline/examples/map.png \
  --diagram pipeline/examples/diagram.json \
  --output pipeline/output/example \
  --require-connected
```

This is a **hand-authored diagram fixture**, not a live image-extraction result. It tests the deterministic diagram → graph → artifacts stages: five recognizable places become eight nodes and seven edges in one connected component. `extraction.method` records `provided_diagram` instead of `vision`.

To test actual extraction on the example, omit `--diagram` and provide the API key:

```sh
python -m pipeline pipeline/examples/map.png --output pipeline/output/live-example
```

Live recognition has not been tested in this workspace because no API key is configured. Automated provider tests use mocked Chat Completions and Responses API results.

## Intermediate data contract

See `diagram.schema.json`. Coordinates in the intermediate are percentages, `0..100`, measured from the top-left of the oriented image. A corridor follows its source place → ordered `via` points → target place. Add a bend point wherever the walkable path changes direction.

```json
{
  "floor": "Floor 1",
  "places": [
    {"id": "reception", "name": "Reception", "x": 10, "y": 50, "description": "Reception sign"},
    {"id": "library", "name": "Library", "x": 80, "y": 70, "description": "Library doorway"}
  ],
  "corridors": [
    {"from": "reception", "to": "library", "via": [{"x": 80, "y": 50}]}
  ],
  "warnings": []
}
```

The final `graph.json` contains:

- `source`: filename, SHA-256, oriented source dimensions.
- `coordinate_system`: pixels, top-left origin, x right, y down.
- `nodes`: IDs, names, `place`/`junction` kind, descriptions, x/y.
- `edges`: stable IDs, endpoint IDs, `length_pixels`, originating corridor IDs, and `bidirectional: true`.
- `validation`: structural validity, connectivity, and connected component node IDs.
- `extraction`, `review_required`, and `warnings`: provenance and review status.

All bends, T junctions, proper crossings, and overlapping corridor endpoints are split into graph nodes. Shared edges are deduplicated. Parallel nearby corridors are not snapped together. On a single floor, crossing polylines are interpreted as a walkable junction; if two passages do not connect, the intermediate must not draw them crossing. Pixel lengths are image geometry, not meters.

## Tests

```sh
python -m unittest discover -s pipeline/tests -v
```

Tests cover the example conversion, topology at crossings and shared segments, disconnected components, named places on corridors, unique IDs, malformed diagrams, SVG escaping, output roundtrips, source binding, corrupt images, EXIF rotation, CLI exit codes, missing configuration, and provider success/failure parsing.

## Photographed evacuation plans: vector geometry, not just a routing graph

For photos like a wall-mounted evacuation sign, use the vector workflow:

```sh
python3 -m pipeline.vectorize /absolute/path/to/photo.jpeg \
  --output pipeline/output/my-vector-plan
```

With `OPENAI_API_KEY` configured, this runs two image-analysis stages: locate the floor-plan drawing (excluding the sign header/legend), then rectify the image and extract room/corridor/stair polygons, visible wall polylines, and separate markings. Floor-plan extraction is not limited to the five-place routing demo. It can preserve up to 80 spaces.

Outputs:

| File | Contents |
| --- | --- |
| `rectified.png` | Perspective-corrected drawing crop for inspection |
| `vector.svg` | Pure vector polygons, wall polylines, symbols, and text; no embedded photograph |
| `overlay.svg` | The same vectors over the rectified photo for comparison |
| `plan.json` | Layered geometry in rectified pixels, per-feature evidence quality, source-photo coordinates, transforms, and provenance |
| `trace.json` | Editable normalized annotations and source-bound frame/provenance |

SVG layers have IDs `spaces`, `walls`, `markings`, and `labels`. Room polygons are approximate areas; only the `walls` layer represents traced walls. Evacuation arrows remain `evacuation_route` annotations. They are not converted into walkable graph edges. Door symbols are preserved only where visibly supported, and ambiguous symbols can be omitted with warnings. Pixel dimensions are not physical measurements.

The editable geometry instructions are `DEFAULT_EXTRACTION_PROMPT` near the top of `vectorize.py`; restart the server after editing. `GEOMETRY_FORMAT_RULES` is appended separately to explain the required representation: space polygons have 3–80 vertices, walls/routes have 2–80 points, and exit/door/equipment/location symbols have exactly one center point. These limits also appear in the schema sent to the model. Vertex-count errors identify the layer, shape ID, kind, actual count and expected count. Model output can still vary and must pass validation on every run; the earlier generic error did not establish which shape failed.

The supplied `IMG_4965 Medium.jpeg` has an assisted trace in `examples/evacuation-photo.trace.json`. The original photo itself is not added to the repository. Reproduce its actual output with:

```sh
python3 -m pipeline.vectorize '/Users/myeongseong/Downloads/IMG_4965 Medium.jpeg' \
  --trace pipeline/examples/evacuation-photo.trace.json \
  --output pipeline/output/photo-4965
```

That trace contains rooms 201–210, two stair areas, two corridor areas, one unlabeled service block, approximate wall segments, exit symbols, and printed evacuation lines. It was created through visual inspection of the supplied photo, not by a successful local API extraction. `extraction.basis.method` records `assistant_photo_trace`; the local run records `provided_trace`. No you-are-here position is asserted from the ambiguous dot near the hydrant sign.

Edit the exported `trace.json`, then rerun with `--trace` and a new output directory to regenerate both formats without an API call. Trace files are SHA-256-bound to the original image. The frame stores four source-image pixel corners in top-left, top-right, bottom-right, bottom-left order, plus the chosen rectified canvas dimensions. Coordinates in its `plan` object are percentages of that rectified canvas. The final JSON stores `source_to_plan` and `plan_to_source` 3×3 homographies and `source_photo_points` for each shape.

No key is needed for a supplied trace. Automatic extraction on arbitrary photos still requires an API key and has not been live-tested in this workspace. Geometry, crop corners, and small details need review, especially with low-resolution angled photos.

## One-click automatic conversion

A minimal upload button and an HTTP endpoint are available without changing the Next.js frontend:

```sh
bash pipeline/start.sh
# Paste your Lablup key at the hidden prompt, then press Enter.
```

Open **http://127.0.0.1:8765**, choose a photo, and click **Convert to SVG + JSON**. The result shows the source photo and extracted vector, with downloads for `vector.svg`, `plan.json`, and the comparison overlay. `OPENAI_VISION_MODEL` selects the image model. The server must be started from an environment containing the key; exporting a key in another terminal does not update an already-running server.

The button performs this exact path:

```text
Choose image → POST /api/vectorize → detect map frame → rectify photo
             → extract vector geometry → validate → render SVG + JSON
```

The backend calls the same `convert_photo()` function used by the vector CLI. The HTTP endpoint never accepts a supplied trace or selects an example fixture. Model errors, unreadable images, and missing configuration produce errors instead of substituted sample output. Each upload gets a temporary directory that is removed when the request finishes. Download files are kept in browser memory until the page is closed or a new photo is chosen.

Image recognition uses two requests to the configured Lablup/OpenAI-compatible gateway; image processing and rendering run locally. The key stays on the Python server and is never sent to the browser. This is a localhost test harness, with one active conversion at a time and same-origin upload checks.

### Calling it from a button

The working implementation is in `web/button.js`. The essential request is:

```js
const response = await fetch('/api/vectorize', {
  method: 'POST',
  headers: { 'Content-Type': file.type },
  body: file,
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
// result.svg         — SVG source for preview/download
// result.plan        — JSON geometry object
// result.overlay_svg — vector overlay over the rectified photo
```

The page and API are served from the same origin. When integrating this button into Next.js or another frontend, forward `/api/vectorize` through that app’s server to this Python service; do not put the API key in browser code. The included Python server binds to `127.0.0.1` and checks its local Host/Origin. A server-side proxy should forward the raw image bytes to the local API without forwarding the browser's different Origin header.

Request body: raw PNG/JPG/WebP bytes, up to 6 MB; `Content-Type` must be an image MIME type (or `application/octet-stream`). Response: `{ plan, svg, overlay_svg, review_required }`. Errors return `{ error, code }` with an appropriate HTTP status. `503 NOT_CONFIGURED` means the server lacks an API key; `422 EXTRACTION_FAILED` means no valid geometry was obtained; `429 BUSY` means another conversion is in progress.

The automated test suite covers the upload service and request handler, including a complete two-stage extraction using mocked model responses, upload limits, origin checks, temporary-file cleanup, concurrent-request rejection, and error propagation. Successful live recognition is still unverified until an actual key is configured.


## Lablup configuration and HTTPS troubleshooting

The default configuration follows the hackathon snippet:

```text
OPENAI_BASE_URL=https://api.console.lablup.ai/v1
OPENAI_API_FORMAT=chat_completions
OPENAI_VISION_MODEL=DeepSeek-V4.1-Flash-B300
```

These values are already the code defaults. `bash pipeline/start.sh` prompts for the key privately when `OPENAI_API_KEY` is absent. The key is not written to a file. If you previously entered the Lablup key under `OPENAI_API_KEY`, that variable name remains valid; the important changes are the gateway URL, API format, and exact model ID. Stop the old Python process with Ctrl+C and restart after code/configuration changes. Existing environment overrides still take precedence over defaults.

For another gateway, set all three variables explicitly. Responses-format providers use `OPENAI_API_FORMAT=responses`; Chat Completions providers use `chat_completions`. Do not use a model name or key from one provider with another provider’s endpoint.

The Python.org macOS installation in this workspace lacked a default certificate bundle. Requests now add certifi’s trusted roots and keep certificate and hostname verification enabled. Install/update dependencies with `python3 -m pip install -r pipeline/requirements.txt`. Certificate failures, DNS failures, and request timeouts now have separate messages. An external, key-free HTTPS test reached an API authentication response successfully after the fix; no paid image extraction was performed by that test.

## DeepSeek reasoning exhausted the geometry response budget

An observed Lablup response reached the former 15,000-token limit, with 13,657 tokens reported as reasoning. The next geometry request now has a 32,768-token output ceiling and asks for compact JSON, minimal polygon vertices, and coordinates rounded to two decimal places. This is the **output budget**, separate from a model’s input/context window. `CLAUDE_CODE_MAX_CONTEXT_TOKENS` is a Claude Code setting; this Python converter does not read it.

Lablup requests retain the standard Chat Completions fields used before the output-limit failure. The gateway's support for extra thinking controls is unverified, so `auto` does not send them to Lablup. A subsequent upstream HTTP 502 occurred after template controls were introduced; its cause was not established. The unverified extension was removed from the defaults while keeping the larger output budget.

For a gateway confirmed to accept self-hosted chat-template arguments, `MAP_THINKING_CONTROL=template` explicitly adds:

```json
{"chat_template_kwargs":{"thinking_mode":"chat","enable_thinking":false}}
```

These fields follow the [DeepSeek model’s published chat template](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/blob/main/chat_template.jinja). Whether Lablup forwards these template arguments needs a live check. For DeepSeek’s official API host, the code instead uses `{"thinking":{"type":"disabled"}}`, following the [official thinking-mode API documentation](https://api-docs.deepseek.com/guides/thinking_mode/). It does not send DeepSeek-specific controls to unrelated models/hosts by default.

`MAP_THINKING_CONTROL` can explicitly select `auto` (default), `template`, `deepseek`, or `off`. `off` removes these controls while retaining the larger output budget. HTTP failures identify the extraction stage and display bounded JSON provider error messages with the request's key, bearer tokens, and image data redacted. HTML error bodies are omitted. The same extraction error appears in the server terminal. There are no automatic paid retries. The launcher does not change Claude Code settings.
