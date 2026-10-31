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
```

Open [the local conversion page](http://127.0.0.1:8765/). Keep the terminal running. Choose a floor-plan photo and click **Convert to SVG + JSON** once.

Supported inputs: JPG, PNG, or WebP, up to 6 MB and 20 million pixels. Start with one floor and readable room labels. The pipeline makes two sequential API requests, each with a 90-second network timeout; conversion can take time. One conversion runs at a time. There are no automatic paid retries.

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

Edit `DEFAULT_EXTRACTION_PROMPT` near the top of [`pipeline/vectorize.py`](pipeline/vectorize.py). This controls geometry extraction after perspective correction. The `prompt` inside `detect_frame()` in the same file controls the separate map-cropping request.

`GEOMETRY_FORMAT_RULES` is appended to the geometry prompt, and `PLAN_SCHEMA` is sent separately to the API. Changing prose does not change the accepted JSON structure. The current rules include:

- Space polygons: 3–80 distinct ordered vertices, without repeating the closing vertex.
- Walls and evacuation routes: 2–80 ordered points.
- Exit, door, fire-equipment, and you-are-here symbols: exactly one center point.
- Space kinds: `room`, `corridor`, or `stairs`. Elevators can use `kind: room` with an elevator label; halls use `kind: corridor`.
- Coordinates: percentages from 0 to 100, with the origin at the top left.

Restart the Python server after saving prompt edits. There is currently no prompt editor on the conversion page.

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

The latest local verification passed 39 tests. API responses in these tests are mocked; passing tests does not prove that the remote model will extract a particular photo correctly.

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
| Timeout / HTTP 504 | The model or connection did not respond within the allowed time. A failed run does not export a replacement sample. |
| Output-token limit | The model ended before completing JSON. Geometry requests currently allow 32,768 output tokens, including any reasoning the provider counts against that budget. |
| `Invalid number of shape vertices` | The API returned geometry but Python rejected a point count. Updated messages name the shape, kind, actual count, and expected count. Check the prompt rules; an icon outline is not a single center point. |
| `Address already in use` | Stop the old server or choose another port with `--port`. |
| Python edits seem ignored | Restart the running Python server; refreshing the browser alone does not reload Python modules. |
| Certificate verification fails | Update dependencies in the active virtual environment; check custom proxy/CA settings. Certificate verification remains enabled. |

Recognition can vary between requests. A successful API response can still fail Python validation. Fully automatic end-to-end extraction on arbitrary photos remains a prototype; inspect every successful output against its source image.

For implementation details, see [`pipeline/README.md`](pipeline/README.md).
