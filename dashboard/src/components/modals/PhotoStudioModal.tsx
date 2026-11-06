import { createSignal, onSettled, Show, For } from 'solid-js';
import { showToast, setActiveModal, saveEditedPhoto, activeModal } from '../store';
import { Paintbrush, Crop, Sparkles, Type, Undo2, RotateCw, RotateCcw, Check } from '../../icons';

export interface TextSticker {
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  align: 'left' | 'center' | 'right';
  hasBg: boolean;
  isDragging?: boolean;
}

export default function PhotoStudioModal(props: {
  data: {
    imageUrl: string;
    onSave?: (b64: string, blobUrl: string) => void;
    campaignId?: number;
    fileName?: string;
    returnToDirectMessage?: boolean;
    returnToCreateCampaign?: boolean;
  };
  onClose: () => void;
}) {
  const [photoCanvasRef, setPhotoCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  const [photoOriginalImg, setPhotoOriginalImg] = createSignal<HTMLImageElement | null>(null);
  const [photoTool, setPhotoTool] = createSignal<'brush' | 'crop' | 'filter' | 'text'>('brush');
  const [brushColor, setBrushColor] = createSignal('#25d366');
  const [brushSize, setBrushSize] = createSignal(6);
  const [cropRatio, setCropRatio] = createSignal<'free' | '1:1' | '4:5' | '16:9'>('free');
  const [cropBox, setCropBox] = createSignal({ x: 5, y: 5, w: 90, h: 90 });
  const [photoFilter, setPhotoFilter] = createSignal<'normal' | 'vivid' | 'bw' | 'warm' | 'cool'>(
    'normal'
  );
  const [textCaption, setTextCaption] = createSignal('');
  const [isSavingPhoto, setIsSavingPhoto] = createSignal(false);
  const [photoPreserveHd, setPhotoPreserveHd] = createSignal(true);
  const [photoHistory, setPhotoHistory] = createSignal<ImageData[]>([]);
  const [isDrawing, setIsDrawing] = createSignal(false);
  let currentLoadedImg: HTMLImageElement | null = null;

  const pushPhotoHistory = () => {
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setPhotoHistory((prev) => [...prev.slice(-10), imgData]);
    } catch {}
  };

  const undoPhoto = () => {
    const hist = photoHistory();
    if (hist.length <= 1) return;
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const nextHist = hist.slice(0, -1);
    const prev = nextHist[nextHist.length - 1];
    if (prev) {
      canvas.width = prev.width;
      canvas.height = prev.height;
      ctx.putImageData(prev, 0, 0);
      setPhotoHistory(nextHist);
    }
  };

  const renderImageToCanvas = (img: HTMLImageElement, canvasEl?: HTMLCanvasElement | null) => {
    const canvas = canvasEl || photoCanvasRef();
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = img.naturalWidth || img.width || 800;
    let h = img.naturalHeight || img.height || 600;
    const maxDim = photoPreserveHd() ? 4096 : 800;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    try {
      const initial = ctx.getImageData(0, 0, w, h);
      setPhotoHistory([initial]);
    } catch (e) {
      console.warn('Initial photo snapshot warning', e);
    }
  };

  const resetPhoto = () => {
    const img = photoOriginalImg() || currentLoadedImg;
    const canvas = photoCanvasRef();
    if (!img || !canvas) return;
    renderImageToCanvas(img, canvas);
    setPhotoFilter('normal');
    setCropRatio('free');
  };

  const initPhotoCanvas = (imageUrl: string, canvasEl?: HTMLCanvasElement | null) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      currentLoadedImg = img;
      setPhotoOriginalImg(img);
      renderImageToCanvas(img, canvasEl);
    };
    img.onerror = () => {
      const fallbackImg = new window.Image();
      fallbackImg.onload = () => {
        currentLoadedImg = fallbackImg;
        setPhotoOriginalImg(fallbackImg);
        renderImageToCanvas(fallbackImg, canvasEl);
      };
      fallbackImg.src = imageUrl;
    };
    img.src = imageUrl;
  };

  const rotatePhoto90 = () => {
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushPhotoHistory();
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const offCtx = offscreen.getContext('2d');
    offCtx?.drawImage(canvas, 0, 0);

    const oldW = canvas.width;
    const oldH = canvas.height;
    canvas.width = oldH;
    canvas.height = oldW;

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(offscreen, -oldW / 2, -oldH / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const snapCropRatio = (ratio: 'free' | '1:1' | '4:5' | '16:9') => {
    setCropRatio(ratio);
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const curW = canvas.width;
    const curH = canvas.height;

    if (ratio === 'free') {
      setCropBox({ x: 5, y: 5, w: 90, h: 90 });
      return;
    }

    let targetRatio = 1;
    if (ratio === '1:1') targetRatio = 1;
    else if (ratio === '4:5') targetRatio = 4 / 5;
    else if (ratio === '16:9') targetRatio = 16 / 9;

    const canvasAspect = curW / curH;
    let boxW = 80;
    let boxH = 80;

    if (canvasAspect > targetRatio) {
      boxH = 80;
      boxW = (boxH * targetRatio) / canvasAspect;
    } else {
      boxW = 80;
      boxH = (boxW / targetRatio) * canvasAspect;
    }

    const boxX = Math.round((100 - boxW) / 2);
    const boxY = Math.round((100 - boxH) / 2);
    setCropBox({
      x: Math.max(2, boxX),
      y: Math.max(2, boxY),
      w: Math.min(96, Math.round(boxW)),
      h: Math.min(96, Math.round(boxH))
    });
  };

  const applyCropNow = () => {
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushPhotoHistory();
    const box = cropBox();
    const pixelX = Math.round((box.x / 100) * canvas.width);
    const pixelY = Math.round((box.y / 100) * canvas.height);
    const pixelW = Math.max(20, Math.round((box.w / 100) * canvas.width));
    const pixelH = Math.max(20, Math.round((box.h / 100) * canvas.height));

    const croppedData = ctx.getImageData(pixelX, pixelY, pixelW, pixelH);
    canvas.width = pixelW;
    canvas.height = pixelH;
    ctx.putImageData(croppedData, 0, 0);

    setCropBox({ x: 5, y: 5, w: 90, h: 90 });
    showToast('Crop applied successfully', 'success');
  };

  const handleCornerResize = (e: PointerEvent, corner: 'tl' | 'tr' | 'bl' | 'br') => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {}
    const cropContainer = target.closest('.pointer-events-auto') as HTMLElement;
    if (!cropContainer) return;
    const rect = cropContainer.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const init = { ...cropBox() };

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      let { x, y, w, h } = init;

      if (corner === 'br') {
        w = Math.max(10, Math.min(100 - x, init.w + dx));
        h = Math.max(10, Math.min(100 - y, init.h + dy));
      } else if (corner === 'bl') {
        const nextX = Math.max(0, Math.min(init.x + init.w - 10, init.x + dx));
        w = init.w + (init.x - nextX);
        x = nextX;
        h = Math.max(10, Math.min(100 - y, init.h + dy));
      } else if (corner === 'tr') {
        const nextY = Math.max(0, Math.min(init.y + init.h - 10, init.y + dy));
        h = init.h + (init.y - nextY);
        y = nextY;
        w = Math.max(10, Math.min(100 - x, init.w + dx));
      } else if (corner === 'tl') {
        const nextX = Math.max(0, Math.min(init.x + init.w - 10, init.x + dx));
        const nextY = Math.max(0, Math.min(init.y + init.h - 10, init.y + dy));
        w = init.w + (init.x - nextX);
        h = init.h + (init.y - nextY);
        x = nextX;
        y = nextY;
      }

      setCropBox({ x, y, w, h });
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const applyPhotoFilter = (filter: 'normal' | 'vivid' | 'bw' | 'warm' | 'cool') => {
    setPhotoFilter(filter);
    const canvas = photoCanvasRef();
    const img = photoOriginalImg() || currentLoadedImg;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (filter === 'normal') {
      resetPhoto();
      return;
    }

    pushPhotoHistory();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];

      if (filter === 'bw') {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        d[i] = gray;
        d[i + 1] = gray;
        d[i + 2] = gray;
      } else if (filter === 'vivid') {
        d[i] = Math.min(255, Math.max(0, (r - 128) * 1.35 + 128 + 20));
        d[i + 1] = Math.min(255, Math.max(0, (g - 128) * 1.35 + 128 + 20));
        d[i + 2] = Math.min(255, Math.max(0, (b - 128) * 1.35 + 128 + 20));
      } else if (filter === 'warm') {
        d[i] = Math.min(255, r + 35);
        d[i + 1] = Math.min(255, g + 15);
        d[i + 2] = Math.max(0, b - 20);
      } else if (filter === 'cool') {
        d[i] = Math.max(0, r - 20);
        d[i + 1] = Math.min(255, g + 10);
        d[i + 2] = Math.min(255, b + 40);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const stampText = () => {
    const text = textCaption().trim();
    if (!text) return;
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pushPhotoHistory();
    const fontSize = Math.max(18, Math.round(canvas.width / 24));
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    const pad = 14;
    const x = Math.round((canvas.width - textWidth) / 2);
    const y = Math.round(canvas.height - 45);

    // Semi-transparent pill backdrop
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.beginPath();
    ctx.roundRect(x - pad, y - fontSize, textWidth + pad * 2, fontSize + 16, 8);
    ctx.fill();

    // Text with chosen color
    ctx.fillStyle = brushColor();
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y - fontSize / 2 + 8);
    setTextCaption('');
    showToast('Caption stamped onto photo', 'info');
  };

  onSettled(() => {
    requestAnimationFrame(() => {
      initPhotoCanvas(props.data.imageUrl, photoCanvasRef());
    });
  });

  return (
    <div class="space-y-3.5">
      {/* Top Studio Toolbar */}
      <div class="bg-[#111b21] border border-[#2a3942] rounded-xl p-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
        {/* Tool Selector Tabs */}
        <div class="flex items-center gap-1">
          <button
            type="button"
            class={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-xs ${
              photoTool() === 'brush'
                ? 'bg-[#00a884] text-white shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => setPhotoTool('brush')}
          >
            <Paintbrush size={13} />
            <span>Doodle / Brush</span>
          </button>
          <button
            type="button"
            class={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-xs ${
              photoTool() === 'crop'
                ? 'bg-[#00a884] text-white shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => setPhotoTool('crop')}
          >
            <Crop size={13} />
            <span>Crop & Rotate</span>
          </button>
          <button
            type="button"
            class={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-xs ${
              photoTool() === 'text'
                ? 'bg-[#00a884] text-white shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => setPhotoTool('text')}
          >
            <Type size={13} />
            <span>Caption</span>
          </button>
          <button
            type="button"
            class={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-colors cursor-pointer text-xs ${
              photoTool() === 'filter'
                ? 'bg-[#00a884] text-white shadow-xs'
                : 'bg-[#202c33] text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => setPhotoTool('filter')}
          >
            <Sparkles size={13} />
            <span>Filters</span>
          </button>
        </div>

        {/* Undo & Reset Action Buttons */}
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="px-2 py-1 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] flex items-center gap-1 text-[11px] cursor-pointer transition-colors"
            title="Undo last action"
            onClick={undoPhoto}
          >
            <Undo2 size={12} />
            <span>Undo</span>
          </button>
          <button
            type="button"
            class="px-2 py-1 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] flex items-center gap-1 text-[11px] cursor-pointer transition-colors"
            title="Reset to original photo"
            onClick={resetPhoto}
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button
            type="button"
            class={`px-2.5 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1 cursor-pointer select-none ${
              photoPreserveHd()
                ? 'bg-[#00a884]/20 border-[#00a884] text-[#00a884] shadow-xs'
                : 'bg-[#202c33] border-[#2a3942] text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => {
              const next = !photoPreserveHd();
              setPhotoPreserveHd(next);
              resetPhoto();
              showToast(
                next
                  ? 'HD Resolution Enabled (Original Quality)'
                  : 'Standard Resolution (800px max)',
                'info'
              );
            }}
            title={
              photoPreserveHd()
                ? 'Preserve Full HD Photo Resolution (Click to toggle Standard)'
                : 'Standard Resolution (Click to toggle HD)'
            }
          >
            <span>HD</span>
            <Show when={photoPreserveHd()}>
              <Check size={11} stroke-width={3} />
            </Show>
          </button>
        </div>
      </div>

      {/* Secondary Tool Controls Bar */}
      <div class="bg-[#111b21] border border-[#2a3942] rounded-xl p-2.5 text-xs">
        {/* BRUSH OPTIONS */}
        <Show when={photoTool() === 'brush'}>
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] text-[#8696a0] font-medium mr-1">Colors:</span>
              <For
                each={['#ffffff', '#25d366', '#ffd700', '#ff9800', '#ff3b30', '#00bcd4', '#9c27b0']}
              >
                {(color) => (
                  <button
                    type="button"
                    class={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                      brushColor() === color
                        ? 'scale-125 ring-2 ring-white shadow-md'
                        : 'hover:scale-110'
                    }`}
                    style={{ background: color }}
                    onClick={() => setBrushColor(color)}
                  />
                )}
              </For>
            </div>

            <div class="flex items-center gap-2">
              <span class="text-[11px] text-[#8696a0] font-medium">Size:</span>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer border ${
                    brushSize() === 3
                      ? 'bg-[#00a884] text-white border-[#00a884]'
                      : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                  }`}
                  onClick={() => setBrushSize(3)}
                >
                  Fine
                </button>
                <button
                  type="button"
                  class={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer border ${
                    brushSize() === 7
                      ? 'bg-[#00a884] text-white border-[#00a884]'
                      : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                  }`}
                  onClick={() => setBrushSize(7)}
                >
                  Medium
                </button>
                <button
                  type="button"
                  class={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer border ${
                    brushSize() === 15
                      ? 'bg-[#00a884] text-white border-[#00a884]'
                      : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                  }`}
                  onClick={() => setBrushSize(15)}
                >
                  Bold
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* CROP & ROTATE OPTIONS */}
        <Show when={photoTool() === 'crop'}>
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-1.5">
              <span class="text-[11px] text-[#8696a0] font-medium mr-1">Aspect Ratio:</span>
              <button
                type="button"
                class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                  cropRatio() === 'free'
                    ? 'bg-[#00a884] text-white border-[#00a884]'
                    : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                }`}
                onClick={() => snapCropRatio('free')}
              >
                Free
              </button>
              <button
                type="button"
                class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                  cropRatio() === '1:1'
                    ? 'bg-[#00a884] text-white border-[#00a884]'
                    : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                }`}
                onClick={() => snapCropRatio('1:1')}
              >
                1:1 Square
              </button>
              <button
                type="button"
                class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                  cropRatio() === '4:5'
                    ? 'bg-[#00a884] text-white border-[#00a884]'
                    : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                }`}
                onClick={() => snapCropRatio('4:5')}
              >
                4:5 Portrait
              </button>
              <button
                type="button"
                class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                  cropRatio() === '16:9'
                    ? 'bg-[#00a884] text-white border-[#00a884]'
                    : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                }`}
                onClick={() => snapCropRatio('16:9')}
              >
                16:9 Wide
              </button>
            </div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-2.5 py-1 rounded-lg bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] hover:text-[#00a884] border border-[#2a3942] flex items-center gap-1.5 text-xs font-medium transition-colors cursor-pointer"
                onClick={rotatePhoto90}
              >
                <RotateCw size={13} />
                <span>Rotate 90&deg;</span>
              </button>
              <button
                type="button"
                class="px-3 py-1 rounded-lg bg-[#00a884] hover:bg-[#02906f] text-white flex items-center gap-1.5 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                onClick={applyCropNow}
              >
                <Check size={13} stroke-width={2.5} />
                <span>Apply Crop</span>
              </button>
            </div>
          </div>
        </Show>

        {/* TEXT CAPTION OPTIONS */}
        <Show when={photoTool() === 'text'}>
          <div class="flex items-center gap-2">
            <input
              type="text"
              placeholder="Type caption to stamp on photo..."
              class="flex-1 bg-[#182229] border border-[#2a3942] focus:border-[#00a884] rounded-lg px-3 py-1.5 text-xs text-[#e9edef]"
              value={textCaption()}
              onInput={(e) => setTextCaption(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') stampText();
              }}
            />
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-[#00a884] hover:bg-[#02906f] text-white text-xs font-medium cursor-pointer transition-colors"
              onClick={stampText}
            >
              Stamp Text
            </button>
          </div>
        </Show>

        {/* FILTERS OPTIONS */}
        <Show when={photoTool() === 'filter'}>
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-[#8696a0] font-medium mr-1">Preset:</span>
            <button
              type="button"
              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                photoFilter() === 'normal'
                  ? 'bg-[#00a884] text-white border-[#00a884]'
                  : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
              }`}
              onClick={() => applyPhotoFilter('normal')}
            >
              Original
            </button>
            <button
              type="button"
              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                photoFilter() === 'vivid'
                  ? 'bg-[#00a884] text-white border-[#00a884]'
                  : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
              }`}
              onClick={() => applyPhotoFilter('vivid')}
            >
              Vivid
            </button>
            <button
              type="button"
              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                photoFilter() === 'bw'
                  ? 'bg-[#00a884] text-white border-[#00a884]'
                  : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
              }`}
              onClick={() => applyPhotoFilter('bw')}
            >
              B&W Mono
            </button>
            <button
              type="button"
              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                photoFilter() === 'warm'
                  ? 'bg-[#00a884] text-white border-[#00a884]'
                  : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
              }`}
              onClick={() => applyPhotoFilter('warm')}
            >
              Warm
            </button>
            <button
              type="button"
              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                photoFilter() === 'cool'
                  ? 'bg-[#00a884] text-white border-[#00a884]'
                  : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
              }`}
              onClick={() => applyPhotoFilter('cool')}
            >
              Cool
            </button>
          </div>
        </Show>
      </div>

      {/* Interactive Canvas Surface */}
      <div
        class="relative border border-[#2a3942] rounded-xl overflow-hidden flex items-center justify-center p-2 min-h-[320px] max-h-[440px] select-none"
        style={{
          background: 'repeating-conic-gradient(#111b21 0% 25%, #182229 0% 50%) 50% / 20px 20px'
        }}
      >
        <div class="relative inline-block max-h-[420px] max-w-full">
          <canvas
            ref={(el) => {
              setPhotoCanvasRef(el);
              if (currentLoadedImg) {
                renderImageToCanvas(currentLoadedImg, el);
              } else {
                const data = props.data;
                if (data?.imageUrl) {
                  initPhotoCanvas(data.imageUrl, el);
                }
              }
            }}
            class={`max-h-[420px] max-w-full object-contain rounded shadow-2xl transition-all ${
              photoTool() === 'brush' ? 'cursor-crosshair' : 'cursor-default'
            }`}
            onPointerDown={(e) => {
              if (photoTool() !== 'brush') return;
              const canvas = photoCanvasRef();
              if (!canvas) return;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;

              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {}
              setIsDrawing(true);
              pushPhotoHistory();

              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;

              ctx.beginPath();
              ctx.fillStyle = brushColor();
              ctx.arc(x, y, brushSize() / 2, 0, Math.PI * 2);
              ctx.fill();

              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.strokeStyle = brushColor();
              ctx.lineWidth = brushSize();
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
            }}
            onPointerMove={(e) => {
              if (!isDrawing() || photoTool() !== 'brush') return;
              const canvas = photoCanvasRef();
              if (!canvas) return;
              const ctx = canvas.getContext('2d');
              if (!ctx) return;

              const rect = canvas.getBoundingClientRect();
              const scaleX = canvas.width / rect.width;
              const scaleY = canvas.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;

              ctx.lineTo(x, y);
              ctx.stroke();
            }}
            onPointerUp={(e) => {
              if (isDrawing()) {
                setIsDrawing(false);
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {}
              }
            }}
            onPointerCancel={() => setIsDrawing(false)}
          />

          {/* Interactive Crop Resizer Overlay */}
          <Show when={photoTool() === 'crop'}>
            <div class="absolute inset-0 pointer-events-auto select-none overflow-hidden rounded">
              {/* 4 Dimmed Masks */}
              <div
                class="absolute left-0 right-0 top-0 bg-black/60 pointer-events-none"
                style={{ height: `${cropBox().y}%` }}
              />
              <div
                class="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none"
                style={{ height: `${100 - (cropBox().y + cropBox().h)}%` }}
              />
              <div
                class="absolute left-0 bg-black/60 pointer-events-none"
                style={{
                  top: `${cropBox().y}%`,
                  height: `${cropBox().h}%`,
                  width: `${cropBox().x}%`
                }}
              />
              <div
                class="absolute right-0 bg-black/60 pointer-events-none"
                style={{
                  top: `${cropBox().y}%`,
                  height: `${cropBox().h}%`,
                  width: `${100 - (cropBox().x + cropBox().w)}%`
                }}
              />

              {/* Crop Box with Rule-of-Thirds Grid & Handles */}
              <div
                class="absolute border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move"
                style={{
                  left: `${cropBox().x}%`,
                  top: `${cropBox().y}%`,
                  width: `${cropBox().w}%`,
                  height: `${cropBox().h}%`
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const target = e.currentTarget as HTMLElement;
                  try {
                    target.setPointerCapture(e.pointerId);
                  } catch {}
                  const parent = target.parentElement;
                  if (!parent) return;
                  const rect = parent.getBoundingClientRect();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const initialBox = { ...cropBox() };

                  const onMove = (ev: PointerEvent) => {
                    const dx = ((ev.clientX - startX) / rect.width) * 100;
                    const dy = ((ev.clientY - startY) / rect.height) * 100;
                    const newX = Math.max(0, Math.min(100 - initialBox.w, initialBox.x + dx));
                    const newY = Math.max(0, Math.min(100 - initialBox.h, initialBox.y + dy));
                    setCropBox({ ...initialBox, x: newX, y: newY });
                  };

                  const onUp = (ev: PointerEvent) => {
                    try {
                      target.releasePointerCapture(ev.pointerId);
                    } catch {}
                    window.removeEventListener('pointermove', onMove as any);
                    window.removeEventListener('pointerup', onUp as any);
                  };
                  window.addEventListener('pointermove', onMove as any);
                  window.addEventListener('pointerup', onUp as any);
                }}
              >
                {/* 3x3 Grid Lines */}
                <div class="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
                  <div class="border-r border-b border-white/30" />
                  <div class="border-r border-b border-white/30" />
                  <div class="border-b border-white/30" />
                  <div class="border-r border-b border-white/30" />
                  <div class="border-r border-b border-white/30" />
                  <div class="border-b border-white/30" />
                  <div class="border-r border-b border-white/30" />
                  <div class="border-r border-b border-white/30" />
                  <div />
                </div>

                {/* Corner Handles */}
                <div
                  class="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-white cursor-nw-resize z-20"
                  onPointerDown={(e) => handleCornerResize(e, 'tl')}
                  title="Resize Crop Box"
                />
                <div
                  class="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-white cursor-ne-resize z-20"
                  onPointerDown={(e) => handleCornerResize(e, 'tr')}
                  title="Resize Crop Box"
                />
                <div
                  class="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-white cursor-sw-resize z-20"
                  onPointerDown={(e) => handleCornerResize(e, 'bl')}
                  title="Resize Crop Box"
                />
                <div
                  class="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-white cursor-se-resize z-20"
                  onPointerDown={(e) => handleCornerResize(e, 'br')}
                  title="Resize Crop Box"
                />
              </div>
            </div>
          </Show>
        </div>
      </div>

      {/* Footer Controls */}
      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-[#222d34]">
        <button
          type="button"
          class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn-accent h-8 px-4 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
          disabled={isSavingPhoto()}
          onClick={async () => {
            const canvas = photoCanvasRef();
            if (!canvas) return;
            setIsSavingPhoto(true);
            try {
              const quality = photoPreserveHd() ? 0.96 : 0.88;
              const dataUrl = canvas.toDataURL('image/jpeg', quality);
              const modalInfo = props.data;
              if (modalInfo?.campaignId) {
                const ok = await saveEditedPhoto(
                  modalInfo.campaignId,
                  modalInfo.fileName || '',
                  dataUrl
                );
                if (ok) setActiveModal(null);
              } else if (modalInfo?.onSave) {
                let thumbB64: string | undefined;
                try {
                  const thumbCanvas = document.createElement('canvas');
                  thumbCanvas.width = 120;
                  thumbCanvas.height = 120;
                  const thumbCtx = thumbCanvas.getContext('2d');
                  thumbCtx?.drawImage(canvas, 0, 0, 120, 120);
                  thumbB64 = thumbCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                } catch {}
                await modalInfo.onSave(dataUrl, thumbB64 || '');
                if (activeModal()?.type === 'edit_photo') {
                  if (modalInfo.returnToDirectMessage) {
                    setActiveModal({
                      type: 'direct_message',
                      preserveState: true
                    });
                  } else if (modalInfo.returnToCreateCampaign) {
                    setActiveModal({
                      type: 'create_campaign',
                      preserveState: true
                    });
                  } else {
                    setActiveModal(null);
                  }
                }
              } else {
                setActiveModal(null);
              }
            } finally {
              setIsSavingPhoto(false);
            }
          }}
        >
          <Check size={14} />
          <span>{isSavingPhoto() ? 'Saving Photo...' : 'Apply & Save Photo'}</span>
        </button>
      </div>
    </div>
  );
}
