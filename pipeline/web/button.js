const form = document.getElementById("convert-form");
const input = document.getElementById("photo");
const button = document.getElementById("convert");
const status = document.getElementById("status");
const error = document.getElementById("error");
const original = document.getElementById("original");
const vector = document.getElementById("vector");
const results = document.getElementById("results");
let selectedFile = null;
let imageUrl = null;
let resultUrls = [];
let running = false;

function clearResults() {
  results.hidden = true;
  vector.hidden = true;
  vector.removeAttribute("src");
  document.getElementById("vector-empty").hidden = false;
  for (const url of resultUrls) URL.revokeObjectURL(url);
  resultUrls = [];
  for (const id of ["download-svg", "download-json", "download-overlay"]) document.getElementById(id).removeAttribute("href");
}

function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function fileUrl(content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  resultUrls.push(url);
  return url;
}

input.addEventListener("change", () => {
  clearResults();
  error.hidden = true;
  selectedFile = null;
  button.disabled = true;
  original.hidden = true;
  original.removeAttribute("src");
  document.getElementById("original-empty").hidden = false;
  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = null;
  const file = input.files[0];
  if (!file) { status.textContent = "Choose a photo to begin."; return; }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showError("Choose a JPG, PNG, or WebP image.");
    status.textContent = "This image format isn’t supported.";
    return;
  }
  if (file.size > 6 * 1024 * 1024 || !file.size) {
    showError("Choose a nonempty image smaller than 6 MB.");
    status.textContent = "Choose a different image.";
    return;
  }
  selectedFile = file;
  imageUrl = URL.createObjectURL(file);
  original.src = imageUrl;
  original.hidden = false;
  document.getElementById("original-empty").hidden = true;
  button.disabled = false;
  status.textContent = "Photo ready. Click Convert to start automatic extraction.";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedFile || running) return;
  running = true;
  clearResults();
  error.hidden = true;
  input.disabled = true;
  button.disabled = true;
  button.textContent = "Converting…";
  form.setAttribute("aria-busy", "true");
  status.textContent = "Detecting the map, correcting perspective, and extracting geometry…";
  try {
    const response = await fetch("/api/vectorize", {
      method: "POST",
      headers: { "Content-Type": selectedFile.type },
      body: selectedFile,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Conversion failed. Please try again.");
    if (!data.plan || typeof data.svg !== "string" || typeof data.overlay_svg !== "string") throw new Error("The server returned an incomplete result.");
    const svgUrl = fileUrl(data.svg, "image/svg+xml");
    vector.src = svgUrl;
    vector.hidden = false;
    document.getElementById("vector-empty").hidden = true;
    document.getElementById("download-svg").href = svgUrl;
    document.getElementById("download-json").href = fileUrl(JSON.stringify(data.plan, null, 2), "application/json");
    document.getElementById("download-overlay").href = fileUrl(data.overlay_svg, "image/svg+xml");
    document.getElementById("summary").textContent = `${data.plan.spaces.length} spaces · ${data.plan.walls.length} wall polylines · ${data.plan.markings.length} markings`;
    const list = document.getElementById("warnings");
    list.replaceChildren();
    for (const message of data.plan.warnings || []) {
      const item = document.createElement("li");
      item.textContent = message;
      list.append(item);
    }
    results.hidden = false;
    status.textContent = "Conversion complete. Review the vector, then download SVG and JSON.";
  } catch (failure) {
    showError(failure.message || "Cannot reach the local conversion server.");
    status.textContent = "Conversion didn’t complete. No extracted result was substituted.";
  } finally {
    running = false;
    input.disabled = false;
    button.disabled = !selectedFile;
    button.textContent = "Convert to SVG + JSON ↗";
    form.removeAttribute("aria-busy");
  }
});
