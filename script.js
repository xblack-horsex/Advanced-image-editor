const image = document.getElementById("image");
const originalImage = document.getElementById("originalImage");
const upload = document.getElementById("upload");
const editor = document.getElementById("editor");
const cropBox = document.getElementById("cropBox");
const cropOverlay = document.getElementById("cropOverlay");

const sliders = { brightness, contrast, saturate };

let originalSrc = null;
let compressedBlob = null;
let originalSize = 0;
let compareMode = false;

/* History stores BOTH image and state */
let undoStack = [];
let redoStack = [];

let cropping = false;
let startX = 0, startY = 0;
let cropRect = null;

let state = defaultState();

/* DEFAULT */
function defaultState() {
  return {
    brightness: 100,
    contrast: 100,
    saturate: 100,
    rotation: 0,
    flipX: 1,
    flipY: 1
  };
}

/* LOAD IMAGE */
upload.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  originalSrc = URL.createObjectURL(file);
  image.src = originalSrc;
  originalImage.src = originalSrc;

  undoStack = [];
  redoStack = [];
  resetState();
});

/* SAVE HISTORY */
function saveHistory() {
  undoStack.push({
    state: JSON.parse(JSON.stringify(state)),
    src: image.src
  });
  redoStack = [];
}

/* UPDATE IMAGE */
function updateImage() {
  image.style.filter = `
    brightness(${state.brightness}%)
    contrast(${state.contrast}%)
    saturate(${state.saturate}%)
  `;
  image.style.transform = `
    rotate(${state.rotation}deg)
    scaleX(${state.flipX})
    scaleY(${state.flipY})
  `;
}

/* SLIDERS */
Object.keys(sliders).forEach(k => {
  sliders[k].addEventListener("input", () => {
    saveHistory();
    state[k] = Number(sliders[k].value);
    updateImage();
  });
});

/* PRESETS */
function applyPreset(type) {
  saveHistory();
  const presets = {
    grayscale: { brightness:100, contrast:100, saturate:0 },
    sepia: { brightness:105, contrast:110, saturate:80 },
    vintage: { brightness:110, contrast:120, saturate:90 },
    cool: { brightness:100, contrast:105, saturate:120 },
    warm: { brightness:110, contrast:100, saturate:130 }
  };
  Object.assign(state, presets[type]);
  syncSliders();
  updateImage();
}

/* TRANSFORMS */
function rotate(d){ saveHistory(); state.rotation += d; updateImage(); }
function flipX(){ saveHistory(); state.flipX *= -1; updateImage(); }
function flipY(){ saveHistory(); state.flipY *= -1; updateImage(); }

/* RESET */
function resetState() {
  state = defaultState();
  syncSliders();
  updateImage();
}
function resetAll() {
  if (!originalSrc) return;
  saveHistory();
  image.src = originalSrc;
  resetState();
}

/* SYNC */
function syncSliders() {
  Object.keys(sliders).forEach(k => sliders[k].value = state[k]);
}

/* UNDO / REDO */
function undo() {
  if (!undoStack.length) return;
  redoStack.push({ state, src: image.src });
  const last = undoStack.pop();
  state = last.state;
  image.src = last.src;
  syncSliders();
  updateImage();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push({ state, src: image.src });
  const next = redoStack.pop();
  state = next.state;
  image.src = next.src;
  syncSliders();
  updateImage();
}

/* COMPARE */
function toggleCompare() {
  compareMode = !compareMode;
  document.querySelector(".preview-box.before")
    .classList.toggle("show", compareMode);
}

/* ===== CROP ===== */
function startCrop() {
  if (!image.src) return;
  cropping = true;
  cropOverlay.style.display = "block";
  cropBox.style.display = "block";
}

editor.addEventListener("mousedown", e => {
  if (!cropping) return;

  const r = editor.getBoundingClientRect();
  startX = e.clientX - r.left;
  startY = e.clientY - r.top;

  cropBox.style.left = startX + "px";
  cropBox.style.top = startY + "px";
  cropBox.style.width = "0";
  cropBox.style.height = "0";

  editor.onmousemove = ev => {
    const x = Math.max(0, Math.min(ev.clientX - r.left, r.width));
    const y = Math.max(0, Math.min(ev.clientY - r.top, r.height));
    cropBox.style.left = Math.min(startX, x) + "px";
    cropBox.style.top = Math.min(startY, y) + "px";
    cropBox.style.width = Math.abs(x - startX) + "px";
    cropBox.style.height = Math.abs(y - startY) + "px";
    cropRect = cropBox.getBoundingClientRect();
  };
});
editor.addEventListener("mouseup", () => editor.onmousemove = null);

function applyCrop() {
  if (!cropping || !cropRect) return;
  saveHistory();

  const imgRect = image.getBoundingClientRect();
  const sx = (cropRect.left - imgRect.left) * image.naturalWidth / imgRect.width;
  const sy = (cropRect.top - imgRect.top) * image.naturalHeight / imgRect.height;
  const sw = cropRect.width * image.naturalWidth / imgRect.width;
  const sh = cropRect.height * image.naturalHeight / imgRect.height;

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  image.src = canvas.toDataURL();
  cropping = false;
  cropBox.style.display = "none";
  cropOverlay.style.display = "none";
}

/* ===== COMPRESS ===== */
function compressImage() {
  fetch(image.src).then(r => r.blob()).then(b => {
    originalSize = b.size;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image,0,0);

    canvas.toBlob(blob => {
      compressedBlob = blob;
      const reduction = (((originalSize - blob.size)/originalSize)*100).toFixed(2);
      document.getElementById("compressInfo").innerText =
        `Original: ${(originalSize/1024).toFixed(2)} KB\n` +
        `Compressed: ${(blob.size/1024).toFixed(2)} KB\n` +
        `Reduced: ${reduction}%`;
      document.getElementById("compressModal").classList.remove("hidden");
    }, "image/jpeg", 0.92);
  });
}

function downloadCompressed() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(compressedBlob);
  a.download = "compressed.jpg";
  a.click();
  closeModal();
}
function closeModal() {
  document.getElementById("compressModal").classList.add("hidden");
}

/* DOWNLOAD */
function downloadImage() {
  const a = document.createElement("a");
  a.href = image.src;
  a.download = "edited-image.png";
  a.click();
}
