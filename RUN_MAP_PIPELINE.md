# Run the map extraction workflow

This guide covers the standalone Python work in `pipeline/`. You do not need to run Next.js, Laravel, Docker, or MySQL.

The current conversion flow is:

```text
Upload floor-plan photo
  → API identifies the drawing corners
  → Python corrects perspective
  → API returns proposed geometry as JSON
  → Python validates the geometry
  → Python generates vector SVG, geometry JSON, and a photo overlay
```

The API produces JSON, not SVG. The earlier SVG-first experiment was undone. Recognition uses the configured external API; perspective correction, validation, and rendering run locally. This workflow does not implement surroundings-photo localization, route guidance, 3D visualization, or continuous tracking.

Before export, Python also regularizes the layout: named rooms become right-angled rectangles, neighboring edges align, overlapping room proposals are clipped, and unassigned interior areas become low-confidence halls. The same cleaned polygons are used in SVG and JSON. This keeps room proportions; it does not force all rooms to equal-sided squares. Exterior boundaries are needed to guarantee interior coverage. Inferred halls and changed geometry must be reviewed against the photo. Cleanup metadata is recorded in `layout`; raw model geometry remains in `trace.json`.

## 1. Get the shared code

**Handoff status when this guide was written:** the author's local checkout was on `main`, with `pipeline/` untracked. The new pipeline must be committed and pushed to a shared feature branch before another person can clone it. This guide does not publish those changes.

Once the author shares the branch name, replace `YOUR_SHARED_BRANCH` below:

```bash
git clone --branch YOUR_SHARED_BRANCH https://github.com/keirara04/Inthon-0x0F.git
cd Inthon-0x0F
```

If you already have the correct checkout, start from its repository root. Confirm it contains `pipeline/start.sh`, `pipeline/server.py`, and `pipeline/requirements.txt`.

## 2. Install Python dependencies

Use Python 3.10 or newer and a Bash shell. These commands target macOS/Linux; on Windows, use WSL. Development verification used Python 3.14.

```bash
python3 --version
python3 -m venv pipeline/.venv
source pipeline/.venv/bin/activate
python3 -m pip install -r pipeline/requirements.txt
```

Dependencies are Pillow for image processing and certifi for HTTPS certificate roots. Activate the virtual environment again whenever you open a new terminal:

```bash
source pipeline/.venv/bin/activate
```

## 3. Start the conversion button

You need a Lablup API key with access to the configured model. From the repository root, with the virtual environment active:

```bash
bash pipeline/start.sh
```

At `Lablup API key (hidden):`, paste your API key and press Enter. No characters appear while pasting; this is expected. The prompt wants the API key, not your computer or Lablup account password. The launcher keeps it in the server process environment and does not save it to a file. If `OPENAI_API_KEY` is already set, the launcher uses that value without prompting.

Expected startup output includes:

```text
Map conversion button: http://127.0.0.1:8765
Image API: https://api.console.lablup.ai/v1 (chat_completions)
Vision model: DeepSeek-V4.1-Flash-B300
Extraction mode: detailed (no application output-token cap; provider defaults apply)
Conversion wait: no application timeout; provider/network timeouts may still apply.
```

Open [the local conversion page](http://127.0.0.1:8765/). Keep the terminal running. Choose a floor-plan photo and click **Convert to SVG + JSON** once.

Supported inputs: JPG, PNG, or WebP, up to 6 MB and 20 million pixels. Start with one floor and readable room labels. The pipeline makes two sequential API requests without an application-level request timeout or output-token cap. The browser no longer aborts conversion after 3.5 minutes. Provider defaults, model limits, and network/browser timeouts can still end a request. One conversion runs at a time. There are no automatic paid retries.

Extraction requests the full visible floor: rooms, halls, stairs, elevators, bathrooms, separating walls, exit doors, and the exterior perimeter. Elevator spaces use `kind: elevator`; exit-door markers are rendered as outlined rectangles with visible Exit door text labels; ordinary interior-door markers are omitted. The simplified prompt and its five-place selection have been removed. Old `MAP_EXTRACTION_MODE` settings are ignored. Image requests omit `max_tokens` and `max_output_tokens`, letting the provider choose its defaults; this does not promise unlimited generation, disable reasoning, or guarantee a successful run.

After success, review the vector against the photo and download:

| Download | Contents |
| --- | --- |
| `vector.svg` | Vector shapes and labels without an embedded photo |
| `plan.json` | Spaces, wall polylines, markings, source coordinates, and perspective transforms |
| `overlay.svg` | Vector geometry over the corrected photo |

The button keeps downloads in browser memory. Save them before refreshing or choosing another image. All results require review; pixel coordinates are not calibrated physical distances, and evacuation arrows are not verified walkable routes.

Stop the server with **Ctrl+C**. After changing Python code or configuration, stop and restart it, then refresh the page.

## 4. API configuration

The defaults already match the supplied hackathon connection snippet:

| Setting | Default |
| --- | --- |
| `OPENAI_BASE_URL` | `https://api.console.lablup.ai/v1` |
| `OPENAI_API_FORMAT` | `chat_completions` |
| `OPENAI_VISION_MODEL` | `DeepSeek-V4.1-Flash-B300` |
| `OPENAI_API_KEY` | Your Lablup key, entered at startup |
| `MAP_THINKING_CONTROL` | `auto`; sends no unverified thinking extension to Lablup |

Despite the `OPENAI_` variable names, this configuration uses the Lablup OpenAI-compatible gateway. Use the endpoint, model, and key from the same provider. Nothing needs to be renamed in the code.

If your shell has stale overrides, set these explicitly before launching:

```bash
export OPENAI_BASE_URL="https://api.console.lablup.ai/v1"
export OPENAI_API_FORMAT="chat_completions"
export OPENAI_VISION_MODEL="DeepSeek-V4.1-Flash-B300"
export MAP_THINKING_CONTROL="off"
bash pipeline/start.sh
```

If the wrong key is already exported, run `unset OPENAI_API_KEY` before launching to get the hidden prompt again. Do not commit credentials or put them in browser code. This Python tool does not read a `.env` file automatically.

For a different local port:

```bash
bash pipeline/start.sh --port 8766
```

Then open [the alternate local page](http://127.0.0.1:8766/). The server binds only to this computer's loopback interface; another person should run their own copy.

## 5. Edit the extraction prompt

Edit `DEFAULT_EXTRACTION_PROMPT` near the top of [`pipeline/vectorize.py`](pipeline/vectorize.py). It preserves the detailed instructions and your earlier edits. This controls geometry extraction after perspective correction. The `prompt` inside `detect_frame()` in the same file controls the separate map-cropping request.

Automatic crops include a 10% margin on each side of the detected drawing, bounded by the uploaded photo. `FRAME_PADDING_FRACTION` in the same file controls this margin. Cropping requests include complete outer walls, stairs, landings, exit thresholds, and service-room projections. Enclosed unnumbered rooms stay separate as `Unlabeled room`; only open circulation becomes Hall. The JSON `rectification` object records `detected_source_corners`, the padded `source_corners`, and `padding_fraction`. Existing reviewed traces keep their original frame and coordinates. Run a new conversion from the original photo to recover details excluded by an earlier crop.

The request appends `GEOMETRY_FORMAT_RULES` and `EXTRACTION_COVERAGE_RULES` and sends `PLAN_SCHEMA`. Changing prose does not change the accepted JSON structure. The geometry rules are:

- Space polygons: 3–80 distinct ordered vertices, without repeating the closing vertex.
- Walls: 2–80 ordered points. Omit bathroom-internal dividers and fixtures; keep each bathroom as one enclosing labeled area.
- Exit-door markings only: exactly one center point. Do not copy red evacuation lines, arrows, red dots, equipment, or location markers.
- Space kinds: `room`, `corridor`, `stairs`, `bathroom`, or `elevator`. Halls use `kind: corridor`. Bathroom areas with visible toilet cubicles use `kind: bathroom`; elevators use `kind: elevator` and an Elevator label.
- Exterior building outlines: separate `outlines` polygons with 3–160 vertices, following visible recesses and stair projections. Empty or missing outlines produce a warning that perimeter coverage is unverified.
- Coordinates: percentages from 0 to 100, with the origin at the top left.

Restart the Python server after saving prompt edits. There is currently no prompt editor on the conversion page.

Simplified mode has been removed. Start with `bash pipeline/start.sh`; no extraction-mode variable is needed.

## 6. Optional: save all artifacts through the CLI

The CLI needs the key in its own shell environment. A key entered into `start.sh` is available to that server process, not to a separate terminal.

In Bash, enter it without showing or storing it in shell history:

```bash
read -r -s -p "Lablup API key (hidden): " OPENAI_API_KEY
printf '\n'
export OPENAI_API_KEY
python3 -m pipeline.vectorize "/absolute/path/to/map-photo.jpg" \
  --output pipeline/output/my-map
```

This writes `rectified.png`, `vector.svg`, `overlay.svg`, `plan.json`, and editable `trace.json`. Choose a new output directory for another run, or explicitly pass `--overwrite`. Output and virtual-environment directories are ignored by Git.

To regenerate reviewed geometry without another API call, use the same original photo and an exported trace:

```bash
python3 -m pipeline.vectorize "/absolute/path/to/map-photo.jpg" \
  --trace pipeline/output/my-map/trace.json \
  --output pipeline/output/my-map-reviewed
```

Trace files are bound to the original photo by SHA-256. The original developer's private photo is not included in the repository; another person should supply their own image.

## 7. Verify the installation without an API key

Run the local tests:

```bash
python3 -m unittest discover -s pipeline/tests -v
```

The latest local verification passed 50 tests, including crop-margin pixel retention, frame bounds, geometric coverage, overlap, exterior clipping, wall constraints, and right-angle checks. API responses in these tests are mocked; passing tests does not prove that the remote model will extract a particular photo correctly.

For an offline smoke test of the separate diagram-to-graph workflow:

```bash
python3 -m pipeline pipeline/examples/map.png \
  --diagram pipeline/examples/diagram.json \
  --output pipeline/output/offline-example \
  --require-connected
```

This uses a hand-authored fixture, not live image recognition. It exports a diagram and graph for five recognizable places. Use a new output directory if it already exists. This graph workflow is separate from the photo button's vector `plan.json` output.

## 8. Troubleshooting

| Symptom | Meaning / action |
| --- | --- |
| `No module named PIL` or `certifi` | Activate the virtual environment and install `pipeline/requirements.txt`. |
| Key prompt appears blank while pasting | Expected hidden input. Paste the key and press Enter. |
| HTTP 401 / rejected key | Confirm the key belongs to Lablup and has not expired; restart with the correct key. |
| HTTP 403 | The key may lack access to this model. Check the provider's Connect settings. |
| HTTP 429 | Check the page message: a local conversion may already be running, or the provider may report a rate/quota limit. |
| HTTP 502 | Read the page and terminal error. The provider may return an upstream gateway error; local network errors can also map to 502. This alone is not a model refusal. |
| Timeout / HTTP 504 | No local conversion deadline is set, but the provider or network can still time out. A failed run does not export a replacement sample. |
| Output-token limit | The provider ended generation before completing JSON. The app sends no output-token cap; provider defaults and model/context limits still apply. |
| `Invalid number of shape vertices` | The API returned geometry but Python rejected a point count. Updated messages name the shape, kind, actual count, and expected count. Check the prompt rules; an icon outline is not a single center point. |
| `Address already in use` | Stop the old server or choose another port with `--port`. |
| Python edits seem ignored | Restart the running Python server; refreshing the browser alone does not reload Python modules. |
| Certificate verification fails | Update dependencies in the active virtual environment; check custom proxy/CA settings. Certificate verification remains enabled. |

Recognition can vary between requests. A successful API response can still fail Python validation. Fully automatic end-to-end extraction on arbitrary photos remains a prototype; inspect every successful output against its source image.

For implementation details, see [`pipeline/README.md`](pipeline/README.md).
