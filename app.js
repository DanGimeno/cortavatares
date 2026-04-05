/**
 * Cortavatares – app.js
 * Upload an image → overlay a configurable grid → cut avatars → edit & download
 */

'use strict';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const uploadZone      = document.getElementById('upload-zone');
const fileInput       = document.getElementById('file-input');
const gridSection     = document.getElementById('grid-section');
const avatarsSection  = document.getElementById('avatars-section');
const editorSection   = document.getElementById('editor-section');
const sourceCanvas    = document.getElementById('source-canvas');
const gridOverlay     = document.getElementById('grid-overlay');
const avatarsGrid     = document.getElementById('avatars-grid');
const avatarCount     = document.getElementById('avatar-count');
const editorCanvas    = document.getElementById('editor-canvas');
const colsInput       = document.getElementById('cols-input');
const rowsInput       = document.getElementById('rows-input');
const cutBtn          = document.getElementById('cut-btn');
const resetBtn        = document.getElementById('reset-btn');
const flipHBtn        = document.getElementById('flip-h-btn');
const flipVBtn        = document.getElementById('flip-v-btn');
const resetEditsBtn   = document.getElementById('reset-edits-btn');
const downloadBtn     = document.getElementById('download-btn');
const downloadAllBtn  = document.getElementById('download-all-btn');
const toast           = document.getElementById('toast');

// ─── Sliders ─────────────────────────────────────────────────────────────────
const sliders = {
  brightness:  { el: document.getElementById('sl-brightness'),  val: document.getElementById('val-brightness'),  suffix: '%' },
  contrast:    { el: document.getElementById('sl-contrast'),    val: document.getElementById('val-contrast'),    suffix: '%' },
  saturation:  { el: document.getElementById('sl-saturation'),  val: document.getElementById('val-saturation'),  suffix: '%' },
  hue:         { el: document.getElementById('sl-hue'),         val: document.getElementById('val-hue'),         suffix: '°' },
  rotation:    { el: document.getElementById('sl-rotation'),    val: document.getElementById('val-rotation'),    suffix: '°' },
  opacity:     { el: document.getElementById('sl-opacity'),     val: document.getElementById('val-opacity'),     suffix: '%' },
};

// ─── State ───────────────────────────────────────────────────────────────────
let sourceImage   = null;   // HTMLImageElement of uploaded image
let avatarImages  = [];     // Array of ImageData (raw pixels for each avatar)
let selectedIndex = -1;     // Which avatar is being edited
let flipH = false;
let flipV = false;

// ─── Toast helper ────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ─── Upload zone events ──────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') fileInput.click();
});

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));

uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

// ─── Load & display source image ─────────────────────────────────────────────
function loadFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      renderSourceCanvas();
      gridSection.style.display = 'block';
      avatarsSection.style.display = 'none';
      editorSection.style.display = 'none';
      avatarImages = [];
      avatarsGrid.innerHTML = '';
      showToast('✅ Imagen cargada');
      gridSection.scrollIntoView({ behavior: 'smooth' });
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function renderSourceCanvas() {
  // Fit image to a maximum display size while preserving aspect ratio
  const MAX_W = Math.min(window.innerWidth - 80, 900);
  const scale = Math.min(1, MAX_W / sourceImage.naturalWidth);
  const dispW = Math.round(sourceImage.naturalWidth  * scale);
  const dispH = Math.round(sourceImage.naturalHeight * scale);

  sourceCanvas.width  = dispW;
  sourceCanvas.height = dispH;
  const ctx = sourceCanvas.getContext('2d');
  ctx.drawImage(sourceImage, 0, 0, dispW, dispH);

  renderGrid();
}

// ─── Grid overlay ────────────────────────────────────────────────────────────
function renderGrid() {
  const W = sourceCanvas.width;
  const H = sourceCanvas.height;
  const cols = Math.max(1, parseInt(colsInput.value, 10) || 1);
  const rows = Math.max(1, parseInt(rowsInput.value, 10) || 1);

  gridOverlay.width  = W;
  gridOverlay.height = H;
  const ctx = gridOverlay.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = 3;

  const cellW = W / cols;
  const cellH = H / rows;

  for (let c = 1; c < cols; c++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(c * cellW), 0);
    ctx.lineTo(Math.round(c * cellW), H);
    ctx.stroke();
  }
  for (let r = 1; r < rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(r * cellH));
    ctx.lineTo(W, Math.round(r * cellH));
    ctx.stroke();
  }
}

colsInput.addEventListener('input', renderGrid);
rowsInput.addEventListener('input', renderGrid);

// ─── Cut avatars ─────────────────────────────────────────────────────────────
cutBtn.addEventListener('click', () => {
  const cols = Math.max(1, parseInt(colsInput.value, 10) || 1);
  const rows = Math.max(1, parseInt(rowsInput.value, 10) || 1);

  // Work at full image resolution for quality
  const fullW = sourceImage.naturalWidth;
  const fullH = sourceImage.naturalHeight;

  const offscreen = document.createElement('canvas');
  offscreen.width  = fullW;
  offscreen.height = fullH;
  const offCtx = offscreen.getContext('2d');
  offCtx.drawImage(sourceImage, 0, 0, fullW, fullH);

  const cellW = fullW / cols;
  const cellH = fullH / rows;

  avatarImages = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round(c * cellW);
      const y = Math.round(r * cellH);
      const w = Math.round((c + 1) * cellW) - x;
      const h = Math.round((r + 1) * cellH) - y;
      const imgData = offCtx.getImageData(x, y, w, h);
      avatarImages.push({ imgData, row: r, col: c });
    }
  }

  renderAvatarsGrid();
  avatarsSection.style.display = 'block';
  editorSection.style.display  = 'none';
  selectedIndex = -1;
  showToast(`✂️ ${avatarImages.length} avatares recortados`);
  avatarsSection.scrollIntoView({ behavior: 'smooth' });
});

// ─── Render thumbnails ────────────────────────────────────────────────────────
function renderAvatarsGrid() {
  avatarsGrid.innerHTML = '';
  avatarCount.textContent = `(${avatarImages.length})`;

  avatarImages.forEach((av, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'avatar-thumb';
    wrapper.title = `Avatar ${i + 1} (fila ${av.row + 1}, col ${av.col + 1})`;

    const c = document.createElement('canvas');
    const THUMB = 120;
    const aspect = av.imgData.width / av.imgData.height;
    if (aspect >= 1) {
      c.width  = THUMB;
      c.height = Math.round(THUMB / aspect);
    } else {
      c.height = THUMB;
      c.width  = Math.round(THUMB * aspect);
    }
    // Draw thumbnail
    const tmp = document.createElement('canvas');
    tmp.width  = av.imgData.width;
    tmp.height = av.imgData.height;
    tmp.getContext('2d').putImageData(av.imgData, 0, 0);
    c.getContext('2d').drawImage(tmp, 0, 0, c.width, c.height);

    const badge = document.createElement('span');
    badge.className = 'avatar-index';
    badge.textContent = i + 1;

    wrapper.appendChild(c);
    wrapper.appendChild(badge);
    wrapper.addEventListener('click', () => selectAvatar(i));
    avatarsGrid.appendChild(wrapper);
  });
}

// ─── Select avatar for editing ───────────────────────────────────────────────
function selectAvatar(index) {
  selectedIndex = index;

  // Highlight selected
  document.querySelectorAll('.avatar-thumb').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });

  // Reset editor state
  resetEditorState();
  renderEditorCanvas();

  editorSection.style.display = 'block';
  editorSection.scrollIntoView({ behavior: 'smooth' });
}

// ─── Reset editor controls ────────────────────────────────────────────────────
function resetEditorState() {
  flipH = false;
  flipV = false;
  sliders.brightness.el.value = 100;
  sliders.contrast.el.value   = 100;
  sliders.saturation.el.value = 100;
  sliders.hue.el.value        = 0;
  sliders.rotation.el.value   = 0;
  sliders.opacity.el.value    = 100;
  updateSliderLabels();
}

function updateSliderLabels() {
  Object.entries(sliders).forEach(([key, s]) => {
    s.val.textContent = s.el.value + s.suffix;
  });
}

// ─── Editor canvas ────────────────────────────────────────────────────────────
function renderEditorCanvas() {
  if (selectedIndex < 0 || !avatarImages[selectedIndex]) return;

  const av    = avatarImages[selectedIndex];
  const imgW  = av.imgData.width;
  const imgH  = av.imgData.height;
  const rot   = parseFloat(sliders.rotation.el.value) * Math.PI / 180;
  const bri   = parseInt(sliders.brightness.el.value,  10);
  const con   = parseInt(sliders.contrast.el.value,    10);
  const sat   = parseInt(sliders.saturation.el.value,  10);
  const hue   = parseInt(sliders.hue.el.value,         10);
  const opa   = parseInt(sliders.opacity.el.value,     10);

  // Compute canvas size after rotation
  const cosR = Math.abs(Math.cos(rot));
  const sinR = Math.abs(Math.sin(rot));
  const rotW = Math.round(imgW * cosR + imgH * sinR);
  const rotH = Math.round(imgW * sinR + imgH * cosR);

  // Cap display size
  const MAX_DISPLAY = 380;
  const scale = Math.min(1, MAX_DISPLAY / Math.max(rotW, rotH));
  const dispW = Math.round(rotW * scale);
  const dispH = Math.round(rotH * scale);

  editorCanvas.width  = dispW;
  editorCanvas.height = dispH;

  const ctx = editorCanvas.getContext('2d');
  ctx.clearRect(0, 0, dispW, dispH);

  // Build CSS filter string
  const filter = [
    `brightness(${bri}%)`,
    `contrast(${con}%)`,
    `saturate(${sat}%)`,
    `hue-rotate(${hue}deg)`,
    `opacity(${opa}%)`,
  ].join(' ');
  ctx.filter = filter;

  // Draw original image data to a temp canvas
  const src = document.createElement('canvas');
  src.width  = imgW;
  src.height = imgH;
  src.getContext('2d').putImageData(av.imgData, 0, 0);

  // Apply transforms
  ctx.save();
  ctx.translate(dispW / 2, dispH / 2);
  ctx.rotate(rot);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
  ctx.restore();
}

// ─── Slider events ────────────────────────────────────────────────────────────
Object.entries(sliders).forEach(([, s]) => {
  s.el.addEventListener('input', () => {
    updateSliderLabels();
    renderEditorCanvas();
  });
});

// ─── Flip buttons ────────────────────────────────────────────────────────────
flipHBtn.addEventListener('click', () => { flipH = !flipH; renderEditorCanvas(); });
flipVBtn.addEventListener('click', () => { flipV = !flipV; renderEditorCanvas(); });

// ─── Reset edits ────────────────────────────────────────────────────────────
resetEditsBtn.addEventListener('click', () => {
  resetEditorState();
  renderEditorCanvas();
});

// ─── Download single avatar ───────────────────────────────────────────────────
downloadBtn.addEventListener('click', () => {
  if (selectedIndex < 0) return;
  const link = document.createElement('a');
  link.download = `avatar_${selectedIndex + 1}.png`;
  link.href = editorCanvas.toDataURL('image/png');
  link.click();
  showToast('⬇ Avatar descargado');
});

// ─── Download all avatars ─────────────────────────────────────────────────────
// Browsers may block simultaneous programmatic downloads; a brief staggered
// delay between each anchor click keeps them from being swallowed by the popup
// blocker while still completing the batch without user intervention.
const DOWNLOAD_STAGGER_MS = 200; // ms between each sequential download trigger

downloadAllBtn.addEventListener('click', async () => {
  if (!avatarImages.length) return;

  showToast(`⏳ Descargando ${avatarImages.length} avatares… (acepta si el navegador lo solicita)`);

  for (let i = 0; i < avatarImages.length; i++) {
    // Stagger downloads so the browser does not suppress them as a popup burst
    await new Promise((res) => setTimeout(res, DOWNLOAD_STAGGER_MS));
    const tmpCanvas = buildAvatarCanvas(i);
    const link = document.createElement('a');
    link.download = `avatar_${i + 1}.png`;
    link.href = tmpCanvas.toDataURL('image/png');
    link.click();
  }

  showToast(`✅ ${avatarImages.length} avatares descargados`);
});

/** Build a canvas for avatar at index with default (no edits) settings */
function buildAvatarCanvas(index) {
  const av = avatarImages[index];
  const c  = document.createElement('canvas');
  c.width  = av.imgData.width;
  c.height = av.imgData.height;
  c.getContext('2d').putImageData(av.imgData, 0, 0);
  return c;
}

// ─── Reset / new image ───────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  fileInput.value  = '';
  sourceImage      = null;
  avatarImages     = [];
  selectedIndex    = -1;
  avatarsGrid.innerHTML = '';
  gridSection.style.display    = 'none';
  avatarsSection.style.display = 'none';
  editorSection.style.display  = 'none';
  document.getElementById('upload-section').scrollIntoView({ behavior: 'smooth' });
  showToast('🔄 Listo para nueva imagen');
});
