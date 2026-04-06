'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface AvatarData {
  imgData: ImageData;
  row: number;
  col: number;
}

interface AvatarEdits {
  brightness: number; contrast: number; saturation: number;
  hue: number; rotation: number; opacity: number;
  blur: number; scale: number; borderRadius: number;
  grayscale: number; sepia: number; invert: number;
  flipH: boolean; flipV: boolean;
  makeSquare: boolean; padColor: string; padTransparent: boolean;
}

const DEFAULT_EDITS: AvatarEdits = {
  brightness: 100, contrast: 100, saturation: 100,
  hue: 0, rotation: 0, opacity: 100,
  blur: 0, scale: 100, borderRadius: 0,
  grayscale: 0, sepia: 0, invert: 0,
  flipH: false, flipV: false,
  makeSquare: false, padColor: '#ffffff', padTransparent: false,
};

function imageDataToUrl(imgData: ImageData): string {
  const c = document.createElement('canvas');
  c.width = imgData.width;
  c.height = imgData.height;
  c.getContext('2d')!.putImageData(imgData, 0, 0);
  return c.toDataURL('image/png');
}

export default function Home() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridOverlayRef = useRef<HTMLCanvasElement>(null);
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const gridSectionRef = useRef<HTMLElement>(null);
  const avatarsSectionRef = useRef<HTMLElement>(null);
  const editorSectionRef = useRef<HTMLElement>(null);
  const uploadSectionRef = useRef<HTMLElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const avatarImagesRef = useRef<AvatarData[]>([]);
  const selectedIndexRef = useRef(-1);

  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(3);
  const [showGrid, setShowGrid] = useState(false);
  const [showAvatars, setShowAvatars] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [avatarCount, setAvatarCount] = useState(0);
  const [avatarThumbs, setAvatarThumbs] = useState<{ url: string; row: number; col: number }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dragOver, setDragOver] = useState(false);

  // Margins (percentage of image dimensions)
  const [marginTop, setMarginTop] = useState(0);
  const [marginRight, setMarginRight] = useState(0);
  const [marginBottom, setMarginBottom] = useState(0);
  const [marginLeft, setMarginLeft] = useState(0);

  // Gap between cells (% of inner area)
  const [gapH, setGapH] = useState(0);
  const [gapV, setGapV] = useState(0);

  // Custom line positions (% of inner area, between margins)
  // null = use uniform distribution; array = custom positions
  const [customColLines, setCustomColLines] = useState<number[] | null>(null);
  const [customRowLines, setCustomRowLines] = useState<number[] | null>(null);

  // Dragging state
  const draggingRef = useRef<{
    type: 'col' | 'row' | 'margin-top' | 'margin-bottom' | 'margin-left' | 'margin-right';
    index: number;
  } | null>(null);

  // Margin/gap presets
  interface Preset {
    name: string;
    marginTop: number; marginRight: number; marginBottom: number; marginLeft: number;
    gapH: number; gapV: number;
    cols: number; rows: number;
  }
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState('');

  // Load presets from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cortavatares-presets');
      if (saved) setPresets(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const preset: Preset = { name, marginTop, marginRight, marginBottom, marginLeft, gapH, gapV, cols, rows };
    const updated = [...presets.filter(p => p.name !== name), preset];
    setPresets(updated);
    localStorage.setItem('cortavatares-presets', JSON.stringify(updated));
    setPresetName('');
    showToast(`Preset "${name}" guardado`);
  };

  const loadPreset = (preset: Preset) => {
    setMarginTop(preset.marginTop);
    setMarginRight(preset.marginRight);
    setMarginBottom(preset.marginBottom);
    setMarginLeft(preset.marginLeft);
    setGapH(preset.gapH);
    setGapV(preset.gapV);
    setCols(preset.cols);
    setRows(preset.rows);
    showToast(`Preset "${preset.name}" cargado`);
  };

  const deletePreset = (name: string) => {
    const updated = presets.filter(p => p.name !== name);
    setPresets(updated);
    localStorage.setItem('cortavatares-presets', JSON.stringify(updated));
  };

  // Current editor state
  const [edits, setEdits] = useState<AvatarEdits>({ ...DEFAULT_EDITS });
  // Per-avatar saved edits
  const allEditsRef = useRef<Map<number, AvatarEdits>>(new Map());

  // Convenience destructure
  const { brightness, contrast, saturation, hue, rotation, opacity, blur, scale, borderRadius, grayscale, sepia, invert, flipH, flipV, makeSquare, padColor, padTransparent } = edits;

  // Helper to update a single edit field
  const setEdit = <K extends keyof AvatarEdits>(key: K, val: AvatarEdits[K]) => {
    setEdits(prev => {
      const next = { ...prev, [key]: val };
      // Auto-save to allEdits for current avatar
      if (selectedIndexRef.current >= 0) {
        allEditsRef.current.set(selectedIndexRef.current, next);
      }
      return next;
    });
  };

  const showToast = useCallback((msg: string) => {
    const el = toastRef.current;
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => el.classList.remove('show'), 2400);
  }, []);

  // Compute line positions as % of inner area (0-100)
  const getColLinePositions = useCallback(() => {
    const c = Math.max(1, cols);
    if (customColLines && customColLines.length === c - 1) return customColLines;
    return Array.from({ length: c - 1 }, (_, i) => ((i + 1) / c) * 100);
  }, [cols, customColLines]);

  const getRowLinePositions = useCallback(() => {
    const r = Math.max(1, rows);
    if (customRowLines && customRowLines.length === r - 1) return customRowLines;
    return Array.from({ length: r - 1 }, (_, i) => ((i + 1) / r) * 100);
  }, [rows, customRowLines]);

  const renderGrid = useCallback(() => {
    const sc = sourceCanvasRef.current;
    const go = gridOverlayRef.current;
    if (!sc || !go) return;

    const W = sc.width;
    const H = sc.height;

    const mL = Math.round(W * marginLeft / 100);
    const mR = Math.round(W * marginRight / 100);
    const mT = Math.round(H * marginTop / 100);
    const mB = Math.round(H * marginBottom / 100);
    const innerW = W - mL - mR;
    const innerH = H - mT - mB;

    go.width = W;
    go.height = H;
    const ctx = go.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    // Dim the margin areas
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (mT > 0) ctx.fillRect(0, 0, W, mT);
    if (mB > 0) ctx.fillRect(0, H - mB, W, mB);
    if (mL > 0) ctx.fillRect(0, mT, mL, innerH);
    if (mR > 0) ctx.fillRect(W - mR, mT, mR, innerH);

    // Inner area border (margin handles)
    ctx.setLineDash([]);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,100,50,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mL, mT, innerW, innerH);

    // Grid lines inside the inner area
    const colLines = getColLinePositions();
    const rowLines = getRowLinePositions();

    // Gap in display pixels
    const gapHpx = innerW * gapH / 100;
    const gapVpx = innerH * gapV / 100;

    // Draw gap zones (dimmed strips around each grid line)
    if (gapHpx > 0) {
      ctx.fillStyle = 'rgba(255,100,50,0.15)';
      for (const pct of colLines) {
        const x = Math.round(mL + innerW * pct / 100);
        ctx.fillRect(x - gapHpx / 2, mT, gapHpx, innerH);
      }
    }
    if (gapVpx > 0) {
      ctx.fillStyle = 'rgba(255,100,50,0.15)';
      for (const pct of rowLines) {
        const y = Math.round(mT + innerH * pct / 100);
        ctx.fillRect(mL, y - gapVpx / 2, innerW, gapVpx);
      }
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3;

    for (const pct of colLines) {
      const x = Math.round(mL + innerW * pct / 100);
      ctx.beginPath();
      ctx.moveTo(x, mT);
      ctx.lineTo(x, mT + innerH);
      ctx.stroke();
    }
    for (const pct of rowLines) {
      const y = Math.round(mT + innerH * pct / 100);
      ctx.beginPath();
      ctx.moveTo(mL, y);
      ctx.lineTo(mL + innerW, y);
      ctx.stroke();
    }
  }, [cols, rows, marginTop, marginRight, marginBottom, marginLeft, customColLines, customRowLines, getColLinePositions, getRowLinePositions, gapH, gapV]);

  const renderSourceCanvas = useCallback(() => {
    const img = sourceImageRef.current;
    const sc = sourceCanvasRef.current;
    if (!img || !sc) return;

    const MAX_W = Math.min(window.innerWidth - 80, 900);
    const scale = Math.min(1, MAX_W / img.naturalWidth);
    const dispW = Math.round(img.naturalWidth * scale);
    const dispH = Math.round(img.naturalHeight * scale);

    sc.width = dispW;
    sc.height = dispH;
    const ctx = sc.getContext('2d')!;
    ctx.drawImage(img, 0, 0, dispW, dispH);

    renderGrid();
  }, [renderGrid]);

  const renderEditorCanvas = useCallback(() => {
    const idx = selectedIndexRef.current;
    const avatars = avatarImagesRef.current;
    if (idx < 0 || !avatars[idx]) return;

    const ec = editorCanvasRef.current;
    if (!ec) return;

    const av = avatars[idx];
    const imgW = av.imgData.width;
    const imgH = av.imgData.height;
    const rot = rotation * Math.PI / 180;
    const fH = flipH;
    const fV = flipV;
    const sc = scale / 100;

    const scaledW = Math.round(imgW * sc);
    const scaledH = Math.round(imgH * sc);

    const cosR = Math.abs(Math.cos(rot));
    const sinR = Math.abs(Math.sin(rot));
    const rotW = Math.round(scaledW * cosR + scaledH * sinR);
    const rotH = Math.round(scaledW * sinR + scaledH * cosR);

    const MAX_DISPLAY = 500;
    const displayScale = Math.min(1, MAX_DISPLAY / Math.max(rotW, rotH));
    const dispW = Math.round(rotW * displayScale);
    const dispH = Math.round(rotH * displayScale);

    // Apply square padding if enabled
    let canvasW = dispW;
    let canvasH = dispH;
    let offsetX = 0;
    let offsetY = 0;

    if (makeSquare && dispW !== dispH) {
      const side = Math.max(dispW, dispH);
      canvasW = side;
      canvasH = side;
      offsetX = Math.round((side - dispW) / 2);
      offsetY = Math.round((side - dispH) / 2);
    }

    ec.width = canvasW;
    ec.height = canvasH;

    const ctx = ec.getContext('2d')!;

    // Fill background for square padding
    if (makeSquare && (offsetX > 0 || offsetY > 0)) {
      if (!padTransparent) {
        ctx.fillStyle = padColor;
        ctx.fillRect(0, 0, canvasW, canvasH);
      } else {
        ctx.clearRect(0, 0, canvasW, canvasH);
      }
    } else {
      ctx.clearRect(0, 0, canvasW, canvasH);
    }

    // Apply border radius clipping
    if (borderRadius > 0) {
      const r = (borderRadius / 100) * Math.min(canvasW, canvasH) / 2;
      ctx.beginPath();
      ctx.roundRect(0, 0, canvasW, canvasH, r);
      ctx.clip();
    }

    ctx.filter = [
      `brightness(${brightness}%)`,
      `contrast(${contrast}%)`,
      `saturate(${saturation}%)`,
      `hue-rotate(${hue}deg)`,
      `opacity(${opacity}%)`,
      blur > 0 ? `blur(${blur}px)` : '',
      grayscale > 0 ? `grayscale(${grayscale}%)` : '',
      sepia > 0 ? `sepia(${sepia}%)` : '',
      invert > 0 ? `invert(${invert}%)` : '',
    ].filter(Boolean).join(' ');

    const src = document.createElement('canvas');
    src.width = imgW;
    src.height = imgH;
    src.getContext('2d')!.putImageData(av.imgData, 0, 0);

    const drawW = scaledW * displayScale;
    const drawH = scaledH * displayScale;

    ctx.save();
    ctx.translate(offsetX + dispW / 2, offsetY + dispH / 2);
    ctx.rotate(rot);
    ctx.scale(fH ? -1 : 1, fV ? -1 : 1);
    ctx.drawImage(src, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, selectedIndex]);

  useEffect(() => {
    renderEditorCanvas();
  }, [renderEditorCanvas]);

  // Re-render editor after the canvas element mounts when showEditor flips to true
  useEffect(() => {
    if (showEditor) {
      const t = setTimeout(() => renderEditorCanvas(), 20);
      return () => clearTimeout(t);
    }
  }, [showEditor, renderEditorCanvas]);

  useEffect(() => {
    if (showGrid) renderGrid();
  }, [showGrid, renderGrid]);

  // Reset custom lines when grid dimensions change
  useEffect(() => {
    setCustomColLines(null);
    setCustomRowLines(null);
  }, [cols, rows]);

  // Drag interaction on overlay canvas
  const handleOverlayMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const go = gridOverlayRef.current;
    const sc = sourceCanvasRef.current;
    if (!go || !sc) return;

    const rect = go.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const W = sc.width;
    const H = sc.height;

    const mL = W * marginLeft / 100;
    const mR = W * marginRight / 100;
    const mT = H * marginTop / 100;
    const mB = H * marginBottom / 100;
    const innerW = W - mL - mR;
    const innerH = H - mT - mB;

    const HIT = 8; // hit zone in px

    // Check margin borders first
    // Top margin line
    if (Math.abs(y - mT) < HIT && x >= mL && x <= W - mR) {
      draggingRef.current = { type: 'margin-top', index: 0 };
      return;
    }
    // Bottom margin line
    if (Math.abs(y - (H - mB)) < HIT && x >= mL && x <= W - mR) {
      draggingRef.current = { type: 'margin-bottom', index: 0 };
      return;
    }
    // Left margin line
    if (Math.abs(x - mL) < HIT && y >= mT && y <= H - mB) {
      draggingRef.current = { type: 'margin-left', index: 0 };
      return;
    }
    // Right margin line
    if (Math.abs(x - (W - mR)) < HIT && y >= mT && y <= H - mB) {
      draggingRef.current = { type: 'margin-right', index: 0 };
      return;
    }

    // Check grid column lines
    const colLines = getColLinePositions();
    for (let i = 0; i < colLines.length; i++) {
      const lx = mL + innerW * colLines[i] / 100;
      if (Math.abs(x - lx) < HIT && y >= mT && y <= H - mB) {
        // Initialize custom lines from current uniform if needed
        if (!customColLines) setCustomColLines([...colLines]);
        draggingRef.current = { type: 'col', index: i };
        return;
      }
    }

    // Check grid row lines
    const rowLines = getRowLinePositions();
    for (let i = 0; i < rowLines.length; i++) {
      const ly = mT + innerH * rowLines[i] / 100;
      if (Math.abs(y - ly) < HIT && x >= mL && x <= W - mR) {
        if (!customRowLines) setCustomRowLines([...rowLines]);
        draggingRef.current = { type: 'row', index: i };
        return;
      }
    }
  }, [marginLeft, marginRight, marginTop, marginBottom, getColLinePositions, getRowLinePositions, customColLines, customRowLines]);

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const drag = draggingRef.current;
    const go = gridOverlayRef.current;
    const sc = sourceCanvasRef.current;
    if (!drag || !go || !sc) return;

    const rect = go.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const W = sc.width;
    const H = sc.height;

    const MIN_GAP = 1; // minimum % gap between lines

    if (drag.type === 'margin-top') {
      const pct = Math.max(0, Math.min(45, (y / H) * 100));
      setMarginTop(parseFloat(pct.toFixed(1)));
    } else if (drag.type === 'margin-bottom') {
      const pct = Math.max(0, Math.min(45, ((H - y) / H) * 100));
      setMarginBottom(parseFloat(pct.toFixed(1)));
    } else if (drag.type === 'margin-left') {
      const pct = Math.max(0, Math.min(45, (x / W) * 100));
      setMarginLeft(parseFloat(pct.toFixed(1)));
    } else if (drag.type === 'margin-right') {
      const pct = Math.max(0, Math.min(45, ((W - x) / W) * 100));
      setMarginRight(parseFloat(pct.toFixed(1)));
    } else if (drag.type === 'col') {
      const mL = W * marginLeft / 100;
      const mR = W * marginRight / 100;
      const innerW = W - mL - mR;
      if (innerW <= 0) return;
      const pct = ((x - mL) / innerW) * 100;
      setCustomColLines(prev => {
        const lines = prev ? [...prev] : getColLinePositions();
        const lower = drag.index > 0 ? lines[drag.index - 1] + MIN_GAP : MIN_GAP;
        const upper = drag.index < lines.length - 1 ? lines[drag.index + 1] - MIN_GAP : 100 - MIN_GAP;
        lines[drag.index] = Math.max(lower, Math.min(upper, parseFloat(pct.toFixed(1))));
        return lines;
      });
    } else if (drag.type === 'row') {
      const mT = H * marginTop / 100;
      const mB = H * marginBottom / 100;
      const innerH = H - mT - mB;
      if (innerH <= 0) return;
      const pct = ((y - mT) / innerH) * 100;
      setCustomRowLines(prev => {
        const lines = prev ? [...prev] : getRowLinePositions();
        const lower = drag.index > 0 ? lines[drag.index - 1] + MIN_GAP : MIN_GAP;
        const upper = drag.index < lines.length - 1 ? lines[drag.index + 1] - MIN_GAP : 100 - MIN_GAP;
        lines[drag.index] = Math.max(lower, Math.min(upper, parseFloat(pct.toFixed(1))));
        return lines;
      });
    }
  }, [marginLeft, marginRight, marginTop, marginBottom, getColLinePositions, getRowLinePositions]);

  const handleOverlayMouseUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  // Cursor style on hover
  const handleOverlayMouseMovePassive = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingRef.current) return; // already dragging, handled by move handler
    const go = gridOverlayRef.current;
    const sc = sourceCanvasRef.current;
    if (!go || !sc) return;

    const rect = go.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const W = sc.width;
    const H = sc.height;

    const mL = W * marginLeft / 100;
    const mR = W * marginRight / 100;
    const mT = H * marginTop / 100;
    const mB = H * marginBottom / 100;
    const innerW = W - mL - mR;
    const innerH = H - mT - mB;
    const HIT = 8;

    let cursor = 'crosshair';

    // Margins
    if (Math.abs(y - mT) < HIT && x >= mL && x <= W - mR) cursor = 'ns-resize';
    else if (Math.abs(y - (H - mB)) < HIT && x >= mL && x <= W - mR) cursor = 'ns-resize';
    else if (Math.abs(x - mL) < HIT && y >= mT && y <= H - mB) cursor = 'ew-resize';
    else if (Math.abs(x - (W - mR)) < HIT && y >= mT && y <= H - mB) cursor = 'ew-resize';
    else {
      // Col lines
      const colLines = getColLinePositions();
      for (const pct of colLines) {
        if (Math.abs(x - (mL + innerW * pct / 100)) < HIT && y >= mT && y <= H - mB) {
          cursor = 'ew-resize';
          break;
        }
      }
      if (cursor === 'crosshair') {
        const rowLines = getRowLinePositions();
        for (const pct of rowLines) {
          if (Math.abs(y - (mT + innerH * pct / 100)) < HIT && x >= mL && x <= W - mR) {
            cursor = 'ns-resize';
            break;
          }
        }
      }
    }

    go.style.cursor = cursor;
  }, [marginLeft, marginRight, marginTop, marginBottom, getColLinePositions, getRowLinePositions]);

  const loadFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        sourceImageRef.current = img;
        setShowGrid(true);
        setShowAvatars(false);
        setShowEditor(false);
        avatarImagesRef.current = [];
        setAvatarCount(0);
        setSelectedIndex(-1);
        selectedIndexRef.current = -1;
        showToast('Imagen cargada');
        setTimeout(() => {
          renderSourceCanvas();
          gridSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [renderSourceCanvas, showToast]);

  // Load image from URL (used for default image)
  const loadImageFromUrl = useCallback((url: string) => {
    const img = new Image();
    img.onload = () => {
      sourceImageRef.current = img;
      setShowGrid(true);
      setShowAvatars(false);
      setShowEditor(false);
      avatarImagesRef.current = [];
      setAvatarCount(0);
      setSelectedIndex(-1);
      selectedIndexRef.current = -1;
      setTimeout(() => {
        renderSourceCanvas();
      }, 50);
    };
    img.src = url;
  }, [renderSourceCanvas]);

  // Load default image on mount
  useEffect(() => {
    loadImageFromUrl('/avatares.png');
  }, [loadImageFromUrl]);

  // Paste from clipboard
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) loadFile(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [loadFile]);

  const handleCut = useCallback(() => {
    const img = sourceImageRef.current;
    if (!img) return;

    const c = Math.max(1, cols);
    const r = Math.max(1, rows);
    const fullW = img.naturalWidth;
    const fullH = img.naturalHeight;

    // Apply margins at full resolution
    const mL = Math.round(fullW * marginLeft / 100);
    const mR = Math.round(fullW * marginRight / 100);
    const mT = Math.round(fullH * marginTop / 100);
    const mB = Math.round(fullH * marginBottom / 100);
    const innerW = fullW - mL - mR;
    const innerH = fullH - mT - mB;

    const offscreen = document.createElement('canvas');
    offscreen.width = fullW;
    offscreen.height = fullH;
    const offCtx = offscreen.getContext('2d')!;
    offCtx.drawImage(img, 0, 0, fullW, fullH);

    // Build cut boundaries from line positions
    const colLines = getColLinePositions();
    const rowLines = getRowLinePositions();

    // Column boundaries: 0%, ...colLines..., 100%
    const colBounds = [0, ...colLines, 100].map(pct => Math.round(mL + innerW * pct / 100));
    const rowBounds = [0, ...rowLines, 100].map(pct => Math.round(mT + innerH * pct / 100));

    // Gap in full-res pixels (half on each side of a line)
    const gapHpx = Math.round(innerW * gapH / 100 / 2);
    const gapVpx = Math.round(innerH * gapV / 100 / 2);

    const avatars: AvatarData[] = [];

    for (let row = 0; row < r; row++) {
      for (let col = 0; col < c; col++) {
        // Trim gap: add half-gap on left/top (except first), subtract half-gap on right/bottom (except last)
        const x = colBounds[col] + (col > 0 ? gapHpx : 0);
        const y = rowBounds[row] + (row > 0 ? gapVpx : 0);
        const x2 = colBounds[col + 1] - (col < c - 1 ? gapHpx : 0);
        const y2 = rowBounds[row + 1] - (row < r - 1 ? gapVpx : 0);
        const w = x2 - x;
        const h = y2 - y;
        if (w > 0 && h > 0) {
          const imgData = offCtx.getImageData(x, y, w, h);
          avatars.push({ imgData, row, col });
        }
      }
    }

    avatarImagesRef.current = avatars;
    setAvatarCount(avatars.length);
    setShowAvatars(true);
    setShowEditor(false);
    setSelectedIndex(-1);
    selectedIndexRef.current = -1;
    showToast(`${avatars.length} avatares recortados`);

    // Generate thumbnail URLs for React rendering
    const thumbs = avatars.map(av => ({
      url: imageDataToUrl(av.imgData),
      row: av.row,
      col: av.col,
    }));
    setAvatarThumbs(thumbs);

    setTimeout(() => {
      avatarsSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, [cols, rows, marginTop, marginRight, marginBottom, marginLeft, showToast, getColLinePositions, getRowLinePositions, gapH, gapV]);

  const selectAvatar = (index: number) => {
    // Save current edits before switching
    if (selectedIndexRef.current >= 0) {
      allEditsRef.current.set(selectedIndexRef.current, { ...edits });
    }
    selectedIndexRef.current = index;
    setSelectedIndex(index);
    // Load saved edits for this avatar, or defaults
    const saved = allEditsRef.current.get(index);
    setEdits(saved ? { ...saved } : { ...DEFAULT_EDITS });
    setShowEditor(true);

    setTimeout(() => {
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  };

  const handleFlipH = () => setEdit('flipH', !flipH);
  const handleFlipV = () => setEdit('flipV', !flipV);

  const handleResetEdits = () => {
    const reset = { ...DEFAULT_EDITS };
    setEdits(reset);
    if (selectedIndexRef.current >= 0) {
      allEditsRef.current.set(selectedIndexRef.current, reset);
    }
  };

  const handleApplyToAll = () => {
    const current = { ...edits };
    const count = avatarImagesRef.current.length;
    for (let i = 0; i < count; i++) {
      allEditsRef.current.set(i, { ...current });
    }
    showToast(`Ajustes aplicados a ${count} avatares`);
  };

  const handleDownload = () => {
    const ec = editorCanvasRef.current;
    if (selectedIndexRef.current < 0 || !ec) return;
    const link = document.createElement('a');
    link.download = `avatar_${selectedIndexRef.current + 1}.png`;
    link.href = ec.toDataURL('image/png');
    link.click();
    showToast('Avatar descargado');
  };

  const buildAvatarCanvas = (index: number) => {
    const av = avatarImagesRef.current[index];
    const e = allEditsRef.current.get(index) || DEFAULT_EDITS;
    const imgW = av.imgData.width;
    const imgH = av.imgData.height;
    const sc = e.scale / 100;
    const rot = e.rotation * Math.PI / 180;

    const scaledW = Math.round(imgW * sc);
    const scaledH = Math.round(imgH * sc);
    const cosR = Math.abs(Math.cos(rot));
    const sinR = Math.abs(Math.sin(rot));
    const rotW = Math.round(scaledW * cosR + scaledH * sinR);
    const rotH = Math.round(scaledW * sinR + scaledH * cosR);

    let cW = rotW, cH = rotH, offX = 0, offY = 0;
    if (e.makeSquare && rotW !== rotH) {
      const side = Math.max(rotW, rotH);
      cW = side; cH = side;
      offX = Math.round((side - rotW) / 2);
      offY = Math.round((side - rotH) / 2);
    }

    const c = document.createElement('canvas');
    c.width = cW; c.height = cH;
    const ctx = c.getContext('2d')!;

    if (e.makeSquare && (offX > 0 || offY > 0) && !e.padTransparent) {
      ctx.fillStyle = e.padColor;
      ctx.fillRect(0, 0, cW, cH);
    }

    if (e.borderRadius > 0) {
      const r = (e.borderRadius / 100) * Math.min(cW, cH) / 2;
      ctx.beginPath(); ctx.roundRect(0, 0, cW, cH, r); ctx.clip();
    }

    ctx.filter = [
      `brightness(${e.brightness}%)`, `contrast(${e.contrast}%)`,
      `saturate(${e.saturation}%)`, `hue-rotate(${e.hue}deg)`,
      `opacity(${e.opacity}%)`,
      e.blur > 0 ? `blur(${e.blur}px)` : '',
      e.grayscale > 0 ? `grayscale(${e.grayscale}%)` : '',
      e.sepia > 0 ? `sepia(${e.sepia}%)` : '',
      e.invert > 0 ? `invert(${e.invert}%)` : '',
    ].filter(Boolean).join(' ');

    const src = document.createElement('canvas');
    src.width = imgW; src.height = imgH;
    src.getContext('2d')!.putImageData(av.imgData, 0, 0);

    ctx.save();
    ctx.translate(offX + rotW / 2, offY + rotH / 2);
    ctx.rotate(rot);
    ctx.scale(e.flipH ? -1 : 1, e.flipV ? -1 : 1);
    ctx.drawImage(src, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
    ctx.restore();
    return c;
  };

  const handleDownloadAll = async () => {
    const avatars = avatarImagesRef.current;
    if (!avatars.length) return;

    showToast(`Empaquetando ${avatars.length} avatares en ZIP...`);

    const zip = new JSZip();
    for (let i = 0; i < avatars.length; i++) {
      const tmpCanvas = buildAvatarCanvas(i);
      const dataUrl = tmpCanvas.toDataURL('image/png');
      const base64 = dataUrl.split(',')[1];
      zip.file(`avatar_${i + 1}.png`, base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, 'cortavatares.zip');
    showToast(`${avatars.length} avatares descargados en ZIP`);
  };

  const handleReset = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    sourceImageRef.current = null;
    avatarImagesRef.current = [];
    selectedIndexRef.current = -1;
    setSelectedIndex(-1);
    setAvatarCount(0);
    setShowGrid(false);
    setShowAvatars(false);
    setShowEditor(false);
    setAvatarThumbs([]);
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    showToast('Listo para nueva imagen');
  };

  return (
    <>
      <header>
        <span style={{ fontSize: '1.6rem' }}>✂️</span>
        <div>
          <h1>Cortavatares</h1>
          <div className="subtitle">Sube una imagen, define el grid y recorta tus avatares</div>
        </div>
      </header>

      <main>
        {/* 1. Upload */}
        <section className="card" ref={uploadSectionRef}>
          <div className="card-title">📂 Subir imagen</div>
          <div
            id="upload-zone"
            role="button"
            tabIndex={0}
            aria-label="Subir imagen"
            className={dragOver ? 'drag-over' : ''}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file && file.type.startsWith('image/')) loadFile(file);
            }}
          >
            <span className="upload-icon">🖼️</span>
            <p><strong>Haz clic</strong>, arrastra o <strong>pega (Ctrl+V)</strong> una imagen</p>
            <p style={{ fontSize: '0.8rem', marginTop: 6, color: '#9ca3af' }}>PNG, JPG, WebP, GIF…</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="file-input-hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) loadFile(e.target.files[0]);
            }}
          />
        </section>

        {/* 2. Grid editor */}
        {showGrid && (
          <section className="card" ref={gridSectionRef}>
            <div className="card-title">🔲 Configurar grid</div>
            <div className="controls-row">
              <div className="control-group">
                <label htmlFor="cols-input">Columnas</label>
                <input
                  type="number"
                  id="cols-input"
                  min={1}
                  max={20}
                  value={cols}
                  onChange={(e) => setCols(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </div>
              <div className="control-group">
                <label htmlFor="rows-input">Filas</label>
                <input
                  type="number"
                  id="rows-input"
                  min={1}
                  max={20}
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </div>
              <button className="btn btn-primary" onClick={handleCut}>✂️ Recortar avatares</button>
              <button className="btn btn-ghost" onClick={handleReset}>🔄 Nueva imagen</button>
            </div>

            <div className="margins-row">
              <span className="margins-title">Márgenes (%)</span>
              <MarginSlider label="Arriba" value={marginTop} onChange={setMarginTop} />
              <MarginSlider label="Abajo" value={marginBottom} onChange={setMarginBottom} />
              <MarginSlider label="Izquierda" value={marginLeft} onChange={setMarginLeft} />
              <MarginSlider label="Derecha" value={marginRight} onChange={setMarginRight} />
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <span className="margins-title">Separación entre celdas (%)</span>
                <MarginSlider label="Horizontal" value={gapH} onChange={setGapH} />
                <MarginSlider label="Vertical" value={gapV} onChange={setGapV} />
              </div>
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <span className="margins-title">Presets</span>
                <div className="preset-save-row">
                  <input
                    type="text"
                    placeholder="Nombre del preset"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && savePreset()}
                    className="preset-input"
                  />
                  <button className="btn btn-primary btn-sm" onClick={savePreset}>Guardar</button>
                </div>
                {presets.length > 0 && (
                  <div className="preset-list">
                    {presets.map((p) => (
                      <div key={p.name} className="preset-item">
                        <button className="preset-load-btn" onClick={() => loadPreset(p)} title={`${p.cols}x${p.rows} · M: ${p.marginTop}/${p.marginRight}/${p.marginBottom}/${p.marginLeft} · Gap: ${p.gapH}/${p.gapV}`}>
                          {p.name}
                        </button>
                        <button className="preset-delete-btn" onClick={() => deletePreset(p.name)} title="Eliminar">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div id="canvas-container">
              <canvas ref={sourceCanvasRef} id="source-canvas" />
              <canvas
                ref={gridOverlayRef}
                id="grid-overlay"
                onMouseDown={handleOverlayMouseDown}
                onMouseMove={(e) => {
                  handleOverlayMouseMove(e);
                  handleOverlayMouseMovePassive(e);
                }}
                onMouseUp={handleOverlayMouseUp}
                onMouseLeave={handleOverlayMouseUp}
              />
            </div>
          </section>
        )}

        {/* 3. Avatars grid */}
        {showAvatars && (
          <section className="card" ref={avatarsSectionRef}>
            <div className="card-title">
              🎭 Avatares recortados
              <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                ({avatarCount})
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Haz clic en un avatar para editarlo.
            </p>
            <div id="avatars-grid">
              {avatarThumbs.map((thumb, i) => (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className={`avatar-thumb${selectedIndex === i ? ' selected' : ''}`}
                      onClick={() => selectAvatar(i)}
                    >
                      <Avatar className="size-full rounded-none">
                        <AvatarImage src={thumb.url} alt={`Avatar ${i + 1}`} className="rounded-none object-contain" />
                        <AvatarFallback className="rounded-none text-lg">{i + 1}</AvatarFallback>
                      </Avatar>
                      <span className="avatar-index">{i + 1}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="avatar-tooltip-content">
                    <div className="avatar-preview-sizes">
                      {[96, 64, 48, 32, 24].map(size => (
                        <div key={size} className="avatar-preview-circle" style={{ width: size, height: size }}>
                          <img src={thumb.url} alt={`${size}px`} />
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </section>
        )}

        {/* 4. Editor */}
        {showEditor && (
          <section className="card" ref={editorSectionRef}>
            <div className="card-title">🎨 Editor de avatar</div>
            <div className="editor-layout">
              <div id="editor-preview-wrap">
                <canvas ref={editorCanvasRef} id="editor-canvas" />
              </div>

              <div className="editor-controls">
                <SliderControl label="Brillo" suffix="%" value={brightness} min={0} max={200} onChange={(v) => setEdit('brightness', v)} />
                <SliderControl label="Contraste" suffix="%" value={contrast} min={0} max={200} onChange={(v) => setEdit('contrast', v)} />
                <SliderControl label="Saturación" suffix="%" value={saturation} min={0} max={300} onChange={(v) => setEdit('saturation', v)} />
                <SliderControl label="Tono (hue)" suffix="°" value={hue} min={-180} max={180} onChange={(v) => setEdit('hue', v)} />
                <SliderControl label="Rotación" suffix="°" value={rotation} min={-180} max={180} onChange={(v) => setEdit('rotation', v)} />
                <SliderControl label="Opacidad" suffix="%" value={opacity} min={0} max={100} onChange={(v) => setEdit('opacity', v)} />
                <SliderControl label="Desenfoque" suffix="px" value={blur} min={0} max={20} onChange={(v) => setEdit('blur', v)} />
                <SliderControl label="Escala" suffix="%" value={scale} min={10} max={200} onChange={(v) => setEdit('scale', v)} />
                <SliderControl label="Bordes redondos" suffix="%" value={borderRadius} min={0} max={100} onChange={(v) => setEdit('borderRadius', v)} />
                <SliderControl label="Escala de grises" suffix="%" value={grayscale} min={0} max={100} onChange={(v) => setEdit('grayscale', v)} />
                <SliderControl label="Sepia" suffix="%" value={sepia} min={0} max={100} onChange={(v) => setEdit('sepia', v)} />
                <SliderControl label="Invertir" suffix="%" value={invert} min={0} max={100} onChange={(v) => setEdit('invert', v)} />

                <div className="flip-btns">
                  <button className="btn btn-ghost btn-sm" onClick={handleFlipH}>↔ Voltear H</button>
                  <button className="btn btn-ghost btn-sm" onClick={handleFlipV}>↕ Voltear V</button>
                </div>

                <div className="square-pad-section">
                  <label className="square-toggle">
                    <input
                      type="checkbox"
                      checked={makeSquare}
                      onChange={(e) => setEdit('makeSquare', e.target.checked)}
                    />
                    <span>Cuadrar imagen</span>
                  </label>
                  {makeSquare && (
                    <div className="pad-color-row">
                      <label className="square-toggle">
                        <input
                          type="checkbox"
                          checked={padTransparent}
                          onChange={(e) => setEdit('padTransparent', e.target.checked)}
                        />
                        <span>Transparente</span>
                      </label>
                      {!padTransparent && (
                        <input
                          type="color"
                          value={padColor}
                          onChange={(e) => setEdit('padColor', e.target.value)}
                          className="color-picker"
                          title="Color de relleno"
                        />
                      )}
                    </div>
                  )}
                </div>

                <button className="btn btn-ghost btn-sm" onClick={handleResetEdits}>↺ Restablecer</button>
                <button className="btn btn-primary btn-sm" onClick={handleApplyToAll}>Aplicar a todos</button>

                <div className="editor-actions">
                  <button className="btn btn-accent" onClick={handleDownload}>⬇ Descargar</button>
                  <button className="btn btn-primary btn-sm" onClick={handleDownloadAll}>⬇ Todos (ZIP)</button>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      <div id="toast" ref={toastRef} />
    </>
  );
}

function MarginSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="margin-slider">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{value.toFixed(1)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={45}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

function SliderControl({
  label,
  suffix,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-group">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
      />
    </div>
  );
}
