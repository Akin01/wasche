import { createSignal, createEffect, onMount, onCleanup, untrack, Show, For } from 'solid-js';
import {
  selectedCampaignDetails,
  activeModal,
  setActiveModal,
  accounts,
  contacts,
  contactsTotal,
  contactsLoading,
  contactsHasMore,
  fetchContacts,
  fetchCampaigns,
  fetchAccounts,
  switchView,
  renameCampaign,
  renameAccount,
  sendDirectMessage,
  addRecipients,
  showToast,
  trimVideoAttachment,
  captureVideoFrame,
  saveEditedPhoto
} from './store';
import type { Account, Contact } from './types';
import { getAccountStatusState } from './types';
import { Dialog } from '@kobalte/core/dialog';
import { Checkbox } from '@kobalte/core/checkbox';
import { Select } from '@kobalte/core/select';
import {
  X,
  QrCode,
  RotateCcw,
  Check,
  Send,
  AlertTriangle,
  Smartphone,
  ChevronDown,
  Plus,
  Trash2,
  Search,
  RefreshCw,
  Users,
  Scissors,
  Play,
  Pause,
  Camera,
  Image as ImageIcon,
  Clock,
  Film,
  CheckCircle2,
  Sliders,
  Zap,
  Smile,
  HelpCircle,
  FileText,
  Paperclip,
  Crop,
  RotateCw,
  Undo2,
  Paintbrush,
  Type,
  Sparkles,
  Volume2,
  VolumeX,
  Video,
  Eye,
  CheckCheck
} from 'lucide-solid';
export default function Modals() {
  const isOpen = () => activeModal() !== null;
  const modal = () => activeModal();

  // Typed modal accessors to ensure child props like .message or .campaignId are reactive
  const confirmData = () => {
    const m = modal();
    return m && m.type === 'confirm' ? m : null;
  };
  const addContactsData = () => {
    const m = modal();
    return m && m.type === 'add_contacts' ? m : null;
  };
  const qrDataModal = () => {
    const m = modal();
    return m && m.type === 'qr' ? m : null;
  };
  const pairPhoneData = () => {
    const m = modal();
    return m && m.type === 'pair_phone' ? m : null;
  };
  const renameData = () => {
    const m = modal();
    return m && (m.type === 'rename_campaign' || m.type === 'rename_account') ? m : null;
  };
  const cutVideoData = () => {
    const m = modal();
    return m && m.type === 'cut_video' ? m : null;
  };

  const editPhotoData = () => {
    const m = modal();
    return m && m.type === 'edit_photo' ? m : null;
  };

  // Photo Studio & Canvas Editor State
  const [photoCanvasRef, setPhotoCanvasRef] = createSignal<HTMLCanvasElement | null>(null);
  const [photoTool, setPhotoTool] = createSignal<'brush' | 'crop' | 'text' | 'filter'>('brush');
  const [brushColor, setBrushColor] = createSignal('#25d366'); // WhatsApp Emerald Green
  const [brushSize, setBrushSize] = createSignal(6);
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [photoHistory, setPhotoHistory] = createSignal<ImageData[]>([]);
  const [cropRatio, setCropRatio] = createSignal<'free' | '1:1' | '4:5' | '16:9'>('free');
  const [cropBox, setCropBox] = createSignal<{ x: number; y: number; w: number; h: number }>({
    x: 5,
    y: 5,
    w: 90,
    h: 90
  });
  const [photoFilter, setPhotoFilter] = createSignal<'normal' | 'vivid' | 'bw' | 'warm' | 'cool'>('normal');
  const [textCaption, setTextCaption] = createSignal('');
  const [isSavingPhoto, setIsSavingPhoto] = createSignal(false);
  const [photoOriginalImg, setPhotoOriginalImg] = createSignal<HTMLImageElement | null>(null);
  const [photoPreserveHd, setPhotoPreserveHd] = createSignal(true);
  let currentLoadedImg: HTMLImageElement | null = null;

  const pushPhotoHistory = () => {
    const canvas = photoCanvasRef();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setPhotoHistory(prev => [...prev.slice(-10), imgData]);
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
    try { target.setPointerCapture(e.pointerId); } catch {}
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

  // Video Cutting & Frame Studio State
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement | null>(null);
  const [videoDuration, setVideoDuration] = createSignal(0);
  const [videoCurrentTime, setVideoCurrentTime] = createSignal(0);
  const [videoPlaying, setVideoPlaying] = createSignal(false);
  const [startTime, setStartTime] = createSignal(0);
  const [endTime, setEndTime] = createSignal(30);
  const [isTrimming, setIsTrimming] = createSignal(false);
  const [isCapturing, setIsCapturing] = createSignal(false);
  const [videoMuted, setVideoMuted] = createSignal(false);
  const [videoPreserveHd, setVideoPreserveHd] = createSignal(true);
  const [filmstripFrames, setFilmstripFrames] = createSignal<string[]>([]);
  const filmstripCache: Record<string, string[]> = {};

  const formatTime = (seconds: number) => {
    const totalTenths = Math.round(seconds * 10);
    const m = Math.floor(totalTenths / 600);
    const s = Math.floor((totalTenths % 600) / 10);
    const ms = totalTenths % 10;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const onVideoLoaded = (e: Event) => {
    const v = e.currentTarget as HTMLVideoElement;
    const dur = v.duration || 0;
    setVideoDuration(dur);
    setStartTime(0);
    setEndTime(dur);
    generateFilmstrip(v, dur);
  };

  const generateFilmstrip = async (v: HTMLVideoElement, dur: number) => {
    if (!dur || isNaN(dur) || !v.src) return;
    if (filmstripCache[v.src]) {
      setFilmstripFrames(filmstripCache[v.src]);
      return;
    }
    try {
      const count = 7;
      const step = dur / count;
      const canvas = document.createElement('canvas');
      canvas.width = 80;
      canvas.height = 45;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const tempVideo = document.createElement('video');
      tempVideo.src = v.src;
      tempVideo.crossOrigin = 'anonymous';
      tempVideo.muted = true;
      await new Promise(r => { tempVideo.onloadeddata = r; setTimeout(r, 2000); });

      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = Math.min(dur, i * step + (step / 2));
        tempVideo.currentTime = t;
        await new Promise(r => { tempVideo.onseeked = r; setTimeout(r, 600); });
        ctx.drawImage(tempVideo, 0, 0, 80, 45);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
      }
      tempVideo.pause();
      tempVideo.removeAttribute('src');
      tempVideo.load();

      filmstripCache[v.src] = frames;
      setFilmstripFrames(frames);
    } catch {
      // Filmstrip optional fallback
    }
  };

  const togglePlay = () => {
    const v = videoRef();
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < startTime() || v.currentTime >= endTime() - 0.05) {
        v.currentTime = startTime();
        setVideoCurrentTime(startTime());
      }
      v.play();
      setVideoPlaying(true);
    } else {
      v.pause();
      setVideoPlaying(false);
    }
  };

  const seekVideo = (time: number) => {
    const v = videoRef();
    if (!v) return;
    v.currentTime = time;
    setVideoCurrentTime(time);
  };

  const handleCaptureFrame = async (asPhoto: boolean) => {
    const data = cutVideoData();
    const v = videoRef();
    if (!data) return;
    setIsCapturing(true);
    try {
      let imageDataB64: string | undefined;
      if (v && v.videoWidth > 0 && v.videoHeight > 0) {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(v, 0, 0, v.videoWidth, v.videoHeight);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            imageDataB64 = dataUrl.split(',')[1];
          }
        } catch (e) {
          console.warn('Canvas frame capture fallback to server FFmpeg', e);
        }
      }
      if (data.campaignId) {
        await captureVideoFrame(data.campaignId, data.fileName, videoCurrentTime(), asPhoto, imageDataB64);
      } else if (data.returnToDirectMessage && imageDataB64) {
        if (asPhoto) {
          const photoName = `frame_${data.fileName.replace(/\.[^/.]+$/, '')}_${Math.round(videoCurrentTime())}s.jpg`;
          const newAtt: ModalAttachment = {
            fileName: photoName,
            fileDataB64: imageDataB64,
            mimeType: 'image/jpeg',
            thumbnailB64: imageDataB64,
            sendAs: 'media',
            fileSize: Math.round((imageDataB64.length * 3) / 4)
          };
          setDmAttachmentsList(prev => [...prev, newAtt]);
          showToast('Captured frame as photo attachment!', 'success');
        } else {
          // Set Cover: Update the preview thumbnail of the video itself!
          setDmAttachmentsList(prev =>
            prev.map(item =>
              item.fileName === data.fileName
                ? { ...item, thumbnailB64: imageDataB64 }
                : item
            )
          );
          showToast('Updated video preview thumbnail from frame!', 'success');
        }
      } else if (data.returnToCreateCampaign && imageDataB64) {
        if (asPhoto) {
          const photoName = `frame_${data.fileName.replace(/\.[^/.]+$/, '')}_${Math.round(videoCurrentTime())}s.jpg`;
          const newAtt: ModalAttachment = {
            fileName: photoName,
            fileDataB64: imageDataB64,
            mimeType: 'image/jpeg',
            thumbnailB64: imageDataB64,
            sendAs: 'media',
            fileSize: Math.round((imageDataB64.length * 3) / 4)
          };
          setCampAttachmentsList(prev => [...prev, newAtt]);
          showToast('Captured frame as photo attachment!', 'success');
        } else {
          // Set Cover: Update the preview thumbnail of the video itself!
          setCampAttachmentsList(prev =>
            prev.map(item =>
              item.fileName === data.fileName
                ? { ...item, thumbnailB64: imageDataB64 }
                : item
            )
          );
          showToast('Updated video preview thumbnail from frame!', 'success');
        }
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const handleTrimVideo = async () => {
    const data = cutVideoData();
    const v = videoRef();
    if (!data) return;
    if (v) {
      v.pause();
      setVideoPlaying(false);
    }
    setIsTrimming(true);
    try {
      if (data.onTrim) {
        await data.onTrim({
          startTime: startTime(),
          endTime: endTime(),
          mute: videoMuted(),
          preserveHd: videoPreserveHd()
        });
        if (activeModal()?.type === 'cut_video') {
          if (data.returnToDirectMessage) {
            setActiveModal({
              type: 'direct_message',
              jid: dmJid(),
              accountId: dmAccount(),
              preserveState: true
            });
          } else if (data.returnToCreateCampaign) {
            setActiveModal({
              type: 'create_campaign',
              preserveState: true
            });
          } else {
            setActiveModal(null);
          }
        }
      } else if (data.campaignId) {
        const ok = await trimVideoAttachment(data.campaignId, data.fileName, startTime(), endTime(), videoMuted(), videoPreserveHd());
        if (ok) {
          setActiveModal(null);
        }
      }
    } finally {
      setIsTrimming(false);
    }
  };
  // Local state for forms
  const [newAccountId, setNewAccountId] = createSignal('');
  const [newAccountPhone, setNewAccountPhone] = createSignal('');

  const [qrData, setQrData] = createSignal<{ svg_qr?: string; status?: string } | null>(null);
  const QR_TIMEOUT_SECS = 30;
  const [qrCountdown, setQrCountdown] = createSignal(QR_TIMEOUT_SECS);
  const [isQrRotating, setIsQrRotating] = createSignal(false);
  const [pairCode, setPairCode] = createSignal<string | null>(null);
  const [pairPhoneInput, setPairPhoneInput] = createSignal('');

  const [dmJid, setDmJid] = createSignal('');
  const [dmAccount, setDmAccount] = createSignal('');
  const [dmMessage, setDmMessage] = createSignal('');

  const [campName, setCampName] = createSignal('');
  const [campAccount, setCampAccount] = createSignal('');
  const [campAccounts, setCampAccounts] = createSignal<string[]>([]);
  const [campTemplate, setCampTemplate] = createSignal('Hello {name}, this is an automated announcement.');
  const [campMinDelay, setCampMinDelay] = createSignal('20');
  const [campMaxDelay, setCampMaxDelay] = createSignal('45');

  const [renameInput, setRenameInput] = createSignal('');
  const [selectedContactsMap, setSelectedContactsMap] = createSignal<Record<string, Contact>>({});
  const [contactSearchFilter, setContactSearchFilter] = createSignal('');
  const [selectedAccountFilter, setSelectedAccountFilter] = createSignal('all');
  const [accountDropdownOpen, setAccountDropdownOpen] = createSignal(false);
  const [campAccountDropdownOpen, setCampAccountDropdownOpen] = createSignal(false);
  let dropdownWrapRef: HTMLDivElement | undefined;
  let campAccountDropdownRef: HTMLDivElement | undefined;
  let searchTimer: any;

  // Emoticons and Formatting Picker state for textareas
  const EMOJIS = ['👍', '❤️', '🔥', '👏', '🙏', '🎉', '😊', '🚀', '✅', '✨', '💯', '👋', '⭐', '🤝', '💼', '📌', '🔔', '📢', '🎁', '⚡', '💬', '📱', '📦', '🎯'];

  const [dmEmojiOpen, setDmEmojiOpen] = createSignal(false);
  const [dmFormatOpen, setDmFormatOpen] = createSignal(false);
  let dmEmojiWrapRef: HTMLDivElement | undefined;
  let dmFormatWrapRef: HTMLDivElement | undefined;

  const [campEmojiOpen, setCampEmojiOpen] = createSignal(false);
  const [campFormatOpen, setCampFormatOpen] = createSignal(false);
  let campEmojiWrapRef: HTMLDivElement | undefined;
  let campFormatWrapRef: HTMLDivElement | undefined;

  const wrapText = (textareaId: string, getter: () => string, setter: (val: string) => void, wrapper: string) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const cur = getter();
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = cur.substring(start, end);
    let nextText = '';
    if (selected.length > 0) {
      nextText = cur.substring(0, start) + `${wrapper}${selected}${wrapper}` + cur.substring(end);
    } else {
      nextText = cur.substring(0, start) + `${wrapper}text${wrapper}` + cur.substring(end);
    }
    setter(nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
    }, 10);
  };

  const insertToken = (textareaId: string, getter: () => string, setter: (val: string) => void, token: string) => {
    const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const cur = getter();
    if (!textarea) {
      setter(cur + token);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextText = cur.substring(0, start) + token + cur.substring(end);
    setter(nextText);
    setTimeout(() => {
      textarea.focus();
      const pos = start + token.length;
      textarea.setSelectionRange(pos, pos);
    }, 10);
  };

  const formatWhatsAppText = (raw: string) => {
    if (!raw) return '';
    let text = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    text = text.replace(
      /```([\s\S]*?)```/g,
      '<code style="background:rgba(0,0,0,0.35); padding:2px 6px; border-radius:4px; font-family:monospace; font-size:11.5px; display:inline-block; margin:2px 0;">$1</code>'
    );
    text = text.replace(
      /`([^`\n]+)`/g,
      '<code style="background:rgba(0,0,0,0.35); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:11.5px;">$1</code>'
    );
    text = text.replace(/(?<!\w)\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?!\w)/g, '<strong style="font-weight:700;">$1</strong>');
    text = text.replace(/(?<!\w)_([^\s_](?:[\s\S]*?[^\s_])?)_(?!\w)/g, '<em style="font-style:italic;">$1</em>');
    text = text.replace(/(?<!\w)~([^\s~](?:[\s\S]*?[^\s~])?)~(?!\w)/g, '<del style="text-decoration:line-through; opacity:0.85;">$1</del>');
    text = text.replace(/\r?\n/g, '<br/>');
    return text;
  };

  interface ModalAttachment {
    fileName: string;
    fileDataB64: string;
    mimeType: string;
    thumbnailB64?: string;
    sendAs: 'media' | 'document';
    fileSize: number;
    blobUrl?: string;
  }

  // Direct Message Attachment State
  const [dmAttachmentsList, setDmAttachmentsList] = createSignal<ModalAttachment[]>([]);
  const [dmTab, setDmTab] = createSignal<'editor' | 'preview'>('editor');
  const [isSendingDm, setIsSendingDm] = createSignal(false);
  const dmAttachment = () => dmAttachmentsList()[0] || null;
  const dmMediaCount = () => dmAttachmentsList().filter(a => a.sendAs === 'media' || a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')).length;
  const dmDocCount = () => dmAttachmentsList().filter(a => a.sendAs === 'document' && !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')).length;
  let dmFileInputMediaRef: HTMLInputElement | undefined;
  let dmFileInputDocRef: HTMLInputElement | undefined;

  // Create Campaign Attachments State
  const [campAttachmentsList, setCampAttachmentsList] = createSignal<ModalAttachment[]>([]);
  const [campTab, setCampTab] = createSignal<'editor' | 'preview'>('editor');
  const campMediaCount = () => campAttachmentsList().filter(a => a.sendAs === 'media' || a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')).length;
  const campDocCount = () => campAttachmentsList().filter(a => a.sendAs === 'document' && !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')).length;
  let campFileInputMediaRef: HTMLInputElement | undefined;
  let campFileInputDocRef: HTMLInputElement | undefined;

  const processFileToAttachment = async (file: File, forcedMode: 'media' | 'document'): Promise<ModalAttachment | null> => {
    if (file.size > 30 * 1024 * 1024) {
      showToast(`'${file.name}' exceeds 30MB limit`, 'error');
      return null;
    }
    const fileName = file.name;
    const mimeType = file.type || 'application/octet-stream';
    const isImg = mimeType.startsWith('image/');
    const isVid = mimeType.startsWith('video/');

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) return null;

    let thumbnailB64: string | undefined;
    if (isImg) {
      try {
        const img = document.createElement('img');
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; setTimeout(r, 2000); });
        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, 120, 120);
        thumbnailB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      } catch {}
    } else if (isVid) {
      try {
        const vid = document.createElement('video');
        vid.src = dataUrl;
        vid.muted = true;
        await new Promise(r => { vid.onloadeddata = () => { vid.currentTime = 0.5; }; vid.onseeked = r; setTimeout(r, 2000); });
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(vid, 0, 0, 160, 100);
        thumbnailB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      } catch {}
    }

    const blobUrl = URL.createObjectURL(file);
    return {
      fileName,
      fileDataB64: base64Data,
      mimeType,
      thumbnailB64,
      sendAs: forcedMode,
      fileSize: file.size,
      blobUrl
    };
  };

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownWrapRef && !dropdownWrapRef.contains(target)) {
        setAccountDropdownOpen(false);
      }
      if (campAccountDropdownRef && !campAccountDropdownRef.contains(target)) {
        setCampAccountDropdownOpen(false);
      }
      if (dmEmojiWrapRef && !dmEmojiWrapRef.contains(target)) {
        setDmEmojiOpen(false);
      }
      if (dmFormatWrapRef && !dmFormatWrapRef.contains(target)) {
        setDmFormatOpen(false);
      }
      if (campEmojiWrapRef && !campEmojiWrapRef.contains(target)) {
        setCampEmojiOpen(false);
      }
      if (campFormatWrapRef && !campFormatWrapRef.contains(target)) {
        setCampFormatOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleOutsideClick);
    });
  });
  createEffect(() => {
    const m = modal();
    if (!m) return;

    untrack(() => {
      if (m.type === 'direct_message') {
        if (!m.preserveState) {
          setDmJid(m.jid || '');
          setDmAccount(m.accountId || accounts()[0]?.account_id || '');
          setDmMessage('');
          setDmAttachmentsList([]);
          setDmEmojiOpen(false);
          setDmFormatOpen(false);
          setDmTab('editor');
          setIsSendingDm(false);
        }
        setRenameInput(m.currentName || '');
      } else if (m.type === 'create_campaign') {
        if (!m.preserveState) {
          setCampName('');
          setCampAccounts(accounts().map(a => a.account_id));
          setCampAccountDropdownOpen(false);
          setCampEmojiOpen(false);
          setCampFormatOpen(false);
          setCampAttachmentsList([]);
          setCampTab('editor');
          setCampTemplate('Hello {name}, this is an automated announcement.');
          setCampMinDelay('20');
          setCampMaxDelay('45');
          setSelectedContactsMap({});
          setContactSearchFilter('');
          setSelectedAccountFilter('all');
          fetchContacts('', 'all', false);
        }
      } else if (m.type === 'qr') {
        setQrData(null);
        startQrPolling(m.accountId);
      } else if (m.type === 'pair_phone') {
        setPairCode(null);
        setPairPhoneInput('');
      } else if (m.type === 'cut_video') {
        setStartTime(0);
        setEndTime(30);
        setVideoCurrentTime(0);
        setVideoPlaying(false);
        setFilmstripFrames([]);
        setIsTrimming(false);
        setIsCapturing(false);
      } else if (m.type === 'edit_photo') {
        setPhotoTool('brush');
        setBrushColor('#25d366');
        setBrushSize(6);
        setCropRatio('free');
        setPhotoFilter('normal');
        setTextCaption('');
        setPhotoHistory([]);
        setIsSavingPhoto(false);
        currentLoadedImg = null;
        initPhotoCanvas(m.imageUrl, photoCanvasRef());
      }
    });
  });

  // QR Polling lifecycle
  let qrPollTimer: number | undefined;
  let qrCountdownTimer: number | undefined;
  let lastSeenQr = '';

  const triggerQrRotation = async (accId: string, manual = false) => {
    setIsQrRotating(true);
    setQrCountdown(QR_TIMEOUT_SECS);
    try {
      await fetch(`/api/accounts/${encodeURIComponent(accId)}/reset-pairing`, { method: 'POST' });
      if (manual) {
        showToast('Pairing session reset. Generating fresh QR...', 'info');
      }
      const res = await fetch(`/api/accounts/${encodeURIComponent(accId)}/qr`);
      if (res.ok) {
        const data = await res.json();
        setQrData(data);
        if (data?.svg_qr) lastSeenQr = data.svg_qr;
      }
    } catch {}
    setTimeout(() => setIsQrRotating(false), 500);
  };

  const stopQrTimers = () => {
    clearInterval(qrPollTimer);
    clearInterval(qrCountdownTimer);
  };

  const startQrPolling = (accId: string) => {
    stopQrTimers();
    setQrCountdown(QR_TIMEOUT_SECS);
    setIsQrRotating(false);
    lastSeenQr = '';

    const poll = async () => {
      try {
        const res = await fetch(`/api/accounts/${encodeURIComponent(accId)}/qr`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.svg_qr) {
            if (lastSeenQr && lastSeenQr !== data.svg_qr) {
              setQrCountdown(QR_TIMEOUT_SECS);
            }
            lastSeenQr = data.svg_qr;
          }
          setQrData(data);
          if (data && data.status === 'Connected') {
            showToast(`Account '${accId}' successfully connected!`, 'success');
            await fetchAccounts();
            stopQrTimers();
            setActiveModal(null);
          }
        }
      } catch {}
    };

    poll();
    qrPollTimer = window.setInterval(poll, 800);

    // 1-second interval for countdown timer & auto-rotation (only ticks while QR code is displayed)
    qrCountdownTimer = window.setInterval(() => {
      if (!lastSeenQr) {
        return;
      }
      setQrCountdown(prev => {
        if (prev <= 1) {
          triggerQrRotation(accId, false);
          return QR_TIMEOUT_SECS;
        }
        return prev - 1;
      });
    }, 1000);
  };

  onCleanup(() => {
    stopQrTimers();
  });

  const handleClose = () => {
    stopQrTimers();
    const v = videoRef();
    if (v) {
      v.pause();
      setVideoPlaying(false);
    }
    setPhotoHistory([]);
    setPhotoOriginalImg(null);
    currentLoadedImg = null;

    const m = modal();
    if (
      (m?.type === 'edit_photo' && (m as any).returnToDirectMessage) ||
      (m?.type === 'cut_video' && (m as any).returnToDirectMessage)
    ) {
      setActiveModal({
        type: 'direct_message',
        jid: dmJid(),
        accountId: dmAccount(),
        preserveState: true
      });
    } else if (
      (m?.type === 'edit_photo' && (m as any).returnToCreateCampaign) ||
      (m?.type === 'cut_video' && (m as any).returnToCreateCampaign)
    ) {
      setActiveModal({
        type: 'create_campaign',
        preserveState: true
      });
    } else {
      setActiveModal(null);
    }
  };

  const getModalTitle = () => {
    const m = modal();
    if (!m) return 'Action';
    switch (m.type) {
      case 'add_account':
        return 'Add WhatsApp Account';
      case 'qr':
        return `Scan QR Code: ${m.accountId}`;
      case 'pair_phone':
        return 'Pair with Phone Code';
      case 'direct_message':
        return 'Send Direct WhatsApp Message';
      case 'add_contacts':
        return 'Add Target Contacts to Campaign';
      case 'create_campaign':
        return 'Create Broadcast Campaign';
      case 'rename_campaign':
      case 'rename_account':
        return 'Rename Item';
      case 'confirm':
        return m.title;
      case 'edit_photo':
        return 'WhatsApp Photo Studio & Canvas Editor';
      case 'cut_video':
        return 'Video Trimmer';
      default:
        return 'Action';
    }
  };
  return (
    <Dialog open={isOpen()} onOpenChange={open => !open && handleClose()}>
      <Dialog.Portal>
        {/* Deep Backdrop Overlay */}
        <Dialog.Overlay class="fixed inset-0 bg-black/85 z-50 animate-in fade-in duration-100" />

        {/* Modal Center Viewport */}
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          {/* Solid Opaque Modal Card */}
          <Dialog.Content
            class={`pointer-events-auto bg-[#182229] border border-[#2a3942] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.85)] w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 ${
              modal()?.type === 'confirm'
                ? 'max-w-[460px]'
                : modal()?.type === 'add_contacts'
                ? 'max-w-[620px]'
                : modal()?.type === 'create_campaign'
                ? 'max-w-[580px]'
                : modal()?.type === 'cut_video' || modal()?.type === 'edit_photo'
                ? 'max-w-[720px]'
                : modal()?.type === 'direct_message'
                ? 'max-w-[620px]'
                : 'max-w-[540px]'
            }`}
          >
            {/* Modal Header */}
            <div class="h-14 px-6 border-b border-[#222d34] flex items-center justify-between shrink-0 bg-[#111b21]">
              <Dialog.Title class="text-base font-bold text-[#e9edef] m-0 tracking-tight truncate">
                {getModalTitle()}
              </Dialog.Title>
              <Dialog.CloseButton
                style={{ border: 'none', background: 'transparent' }}
                class="w-8 h-8 rounded-lg hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] flex items-center justify-center p-0 transition-colors cursor-pointer shrink-0"
                onClick={handleClose}
              >
                <X size={16} />
              </Dialog.CloseButton>
            </div>

            {/* Modal Body */}
            <div class="p-6 overflow-y-auto max-h-[calc(85vh-120px)] space-y-4">
              {/* 1. ADD ACCOUNT */}
              <Show when={modal()?.type === 'add_account'}>
                <div class="space-y-4">
                  <p class="text-xs text-[#8696a0]">
                    Enter a unique identifier for this WhatsApp connection (e.g. <code>sales</code>, <code>support</code>).
                  </p>
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                      Account Identifier
                    </label>
                    <input
                      type="text"
                      class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
                      placeholder="e.g. sales-team"
                      value={newAccountId()}
                      onInput={e => setNewAccountId(e.currentTarget.value)}
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="text"
                      class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
                      placeholder="+62 812-3456-7890 (or leave empty for QR)"
                      value={newAccountPhone()}
                      onInput={e => setNewAccountPhone(e.currentTarget.value)}
                    />
                  </div>
                  <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
                    <button class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer" onClick={handleClose}>
                      Cancel
                    </button>
                    <button
                      class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
                      onClick={async () => {
                        const id = newAccountId().trim();
                        if (!id) {
                          showToast('Account ID cannot be empty', 'error');
                          return;
                        }
                        try {
                          const res = await fetch('/api/accounts/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              account_id: id,
                              phone: newAccountPhone().trim() || undefined
                            })
                          });
                          const data = await res.json();
                          if (data.success) {
                            showToast(`Account '${id}' registered`, 'success');
                            await fetchAccounts();
                            if (newAccountPhone().trim()) {
                              setActiveModal({ type: 'pair_phone', accountId: id });
                            } else {
                              setActiveModal({ type: 'qr', accountId: id });
                            }
                          } else {
                            showToast(data.error || 'Failed to add account', 'error');
                          }
                        } catch (e: unknown) {
                          const msg = e instanceof Error ? e.message : String(e);
                          showToast(`Error adding account: ${msg}`, 'error');
                        }
                      }}
                    >
                      Continue to Pair
                    </button>
                  </div>
                </div>
              </Show>

              {/* 2. QR CODE SCAN */}
              <Show when={qrDataModal()}>
                {m => {
                  const cleanSvg = (raw?: string) => {
                    if (!raw) return '';
                    return raw
                      .replace(/<\?xml[\s\S]*?\?>/i, '')
                      .replace(/\s+width="[^"]*"/i, ' width="100%"')
                      .replace(/\s+height="[^"]*"/i, ' height="100%"');
                  };

                  return (
                    <div class="space-y-4">
                      {/* Step-by-Step Instructions Card */}
                      <div class="bg-[#111b21] border border-[#2a3942] rounded-xl p-3 px-4 text-xs text-[#8696a0]">
                        <div class="flex items-center gap-2 text-[#e9edef] font-semibold mb-1.5">
                          <Smartphone size={14} class="text-[#00a884]" />
                          <span>To link WhatsApp on this account:</span>
                        </div>
                        <ol class="list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed">
                          <li>Open <strong>WhatsApp</strong> on your mobile phone</li>
                          <li>Tap <strong>Settings &rarr; Linked Devices &rarr; Link a Device</strong></li>
                          <li>Point your phone camera to scan the QR code below</li>
                        </ol>
                      </div>

                      {/* Clean Contained QR Display Surface */}
                      {/* Clean Contained QR Display Surface with Countdown & Auto-Rotate */}
                      <div class="bg-[#111b21] p-6 rounded-2xl border border-[#2a3942] flex flex-col items-center justify-center min-h-[340px]">
                        {/* Countdown Badge / Connection Status Pill */}
                        <Show
                          when={qrData()?.svg_qr}
                          fallback={
                            <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-[#182229] border border-[#2a3942] text-xs mb-4 select-none">
                              <span class="w-2 h-2 rounded-full bg-[#ffbc38] animate-ping" />
                              <span class="text-[#8696a0]">
                                {qrData()?.status === 'Connecting' ? 'Connecting to WhatsApp...' : 'Initializing pairing session...'}
                              </span>
                            </div>
                          }
                        >
                          <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-[#182229] border border-[#2a3942] text-xs mb-4 select-none">
                            <span
                              class={`w-2 h-2 rounded-full transition-colors ${
                                qrCountdown() <= 5 ? 'bg-[#ffbc38] animate-ping' : 'bg-[#00a884]'
                              }`}
                            />
                            <span class="text-[#8696a0]">Auto-rotates in:</span>
                            <span
                              class={`font-mono font-bold ${
                                qrCountdown() <= 5 ? 'text-[#ffbc38]' : 'text-[#e9edef]'
                              }`}
                            >
                              {qrCountdown()}s
                            </span>
                          </div>
                        </Show>

                        <Show
                          when={qrData()?.svg_qr}
                          fallback={
                            <div class="py-12 flex flex-col items-center justify-center gap-3 text-xs text-[#8696a0]">
                              <div class="w-12 h-12 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884] animate-pulse">
                                <QrCode size={24} />
                              </div>
                              <span class="font-medium text-[#e9edef]">
                                {qrData()?.status === 'Connecting'
                                  ? 'Handshake in progress with WhatsApp servers...'
                                  : 'Waiting for WhatsApp pairing session...'}
                              </span>
                              <span class="text-[11px] text-[#8696a0]/80">
                                {qrData()?.status === 'Connecting'
                                  ? 'TLS secure channel connected, requesting live QR code...'
                                  : 'Generating live pairing code'}
                              </span>
                            </div>
                          }
                        >
                          <div
                            class="relative bg-white p-5 rounded-3xl w-[268px] h-[268px] mx-auto flex items-center justify-center overflow-hidden"
                            style={{
                              'border-radius': '24px',
                              'box-shadow': '0 12px 36px rgba(0, 0, 0, 0.45)',
                              '-webkit-mask-image': '-webkit-radial-gradient(white, black)'
                            }}
                          >
                            <div
                              class={`qr-display-box w-full h-full flex items-center justify-center transition-opacity duration-200 ${
                                isQrRotating() ? 'opacity-20' : 'opacity-100'
                              }`}
                              innerHTML={cleanSvg(qrData()?.svg_qr)}
                            />

                            {/* Rotating Overlay Spinner with perfectly clipped rounded corners */}
                            <Show when={isQrRotating()}>
                              <div
                                class="absolute inset-0 flex flex-col items-center justify-center bg-white/92 gap-2.5 z-10"
                                style={{ 'border-radius': '24px' }}
                              >
                                <div class="w-10 h-10 rounded-full bg-[#111b21] flex items-center justify-center shadow-md">
                                  <RefreshCw size={20} class="text-[#00a884] animate-spin" />
                                </div>
                                <span class="text-xs font-bold text-[#111b21] tracking-tight">Rotating QR...</span>
                              </div>
                            </Show>
                          </div>

                          {/* Countdown Progress Bar */}
                          <div class="w-[268px] h-1.5 bg-[#202c33] rounded-full overflow-hidden mt-4 border border-[#2a3942]/50">
                            <div
                              class={`h-full transition-all duration-1000 ease-linear rounded-full ${
                                qrCountdown() <= 5 ? 'bg-[#ffbc38]' : 'bg-[#00a884]'
                              }`}
                              style={{ width: `${(qrCountdown() / QR_TIMEOUT_SECS) * 100}%` }}
                            />
                          </div>
                        </Show>
                      </div>

                      {/* Modal Footer Controls */}
                      <div class="flex items-center justify-between text-xs pt-1">
                        <button
                          type="button"
                          class="btn-secondary h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer hover:border-[#00a884] transition-colors"
                          onClick={() => triggerQrRotation(m().accountId, true)}
                          disabled={isQrRotating()}
                        >
                          <RotateCcw size={13} class={isQrRotating() ? 'animate-spin' : ''} />
                          <span>Reset QR</span>
                        </button>

                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent' }}
                          class="text-xs text-[#00a884] hover:underline cursor-pointer p-0 font-medium flex items-center gap-1"
                          onClick={() => setActiveModal({ type: 'pair_phone', accountId: m().accountId })}
                        >
                          <span>Pair with phone number instead</span>
                          <span>&rarr;</span>
                        </button>
                      </div>
                    </div>
                  );
                }}
              </Show>

              {/* 3. PAIR WITH PHONE */}
              <Show when={pairPhoneData()}>
                {m => (
                  <div class="space-y-4">
                    <p class="text-xs text-[#8696a0]">
                      Enter your phone number (with country code) to receive an 8-character pairing code on your phone.
                    </p>
                    <div>
                      <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
                        placeholder="e.g. 628123456789"
                        value={pairPhoneInput()}
                        onInput={e => setPairPhoneInput(e.currentTarget.value)}
                      />
                    </div>

                    <Show when={pairCode()}>
                      <div class="p-4 bg-[#111b21] rounded-xl border border-[#00a884] text-center space-y-1">
                        <span class="text-xs text-[#8696a0] block uppercase tracking-wider">
                          Pairing Code
                        </span>
                        <strong class="text-2xl font-mono text-[#00a884] tracking-widest block">
                          {pairCode()}
                        </strong>
                        <span class="text-[11px] text-[#8696a0] block">
                          Enter this 8-digit code on your WhatsApp notification.
                        </span>
                      </div>
                    </Show>

                    <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
                      <button class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer" onClick={handleClose}>
                        Cancel
                      </button>
                      <button
                        class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
                        onClick={async () => {
                          const phone = pairPhoneInput().trim();
                          if (!phone) {
                            showToast('Please enter a phone number', 'error');
                            return;
                          }
                          try {
                            const res = await fetch(`/api/accounts/${encodeURIComponent(m().accountId)}/pair-phone`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ phone })
                            });
                            const data = await res.json();
                            if (data.pairing_code) {
                              setPairCode(data.pairing_code);
                              showToast('Pairing code generated!', 'success');
                            } else {
                              showToast(data.error || 'Failed to request pairing code', 'error');
                            }
                          } catch (e: unknown) {
                            const msg = e instanceof Error ? e.message : String(e);
                            showToast(`Error: ${msg}`, 'error');
                          }
                        }}
                      >
                        Request Pairing Code
                      </button>
                    </div>
                  </div>
                )}
              </Show>

              {/* 4. DIRECT MESSAGE */}
              <Show when={modal()?.type === 'direct_message'}>
                <div class="space-y-4">
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                      Target Phone or WhatsApp JID
                    </label>
                    <input
                      type="text"
                      class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
                      placeholder="e.g. 6281234567890 or 6281234567890@s.whatsapp.net"
                      value={dmJid()}
                      onInput={e => setDmJid(e.currentTarget.value)}
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                      Sender WhatsApp Account
                    </label>
                    <Select<Account>
                      options={accounts()}
                      optionValue="account_id"
                      optionTextValue="account_id"
                      value={accounts().find(a => a.account_id === dmAccount())}
                      onChange={acc => acc && setDmAccount(acc.account_id)}
                      placeholder="Select WhatsApp Account"
                      itemComponent={props => {
                        const status = () => getAccountStatusState(props.item.rawValue.status);
                        const isOnline = () => status() === 'Connected';
                        return (
                          <Select.Item
                            item={props.item}
                            class="px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between text-[#e9edef] hover:bg-[#202c33] transition-colors focus:bg-[#202c33] focus:outline-none"
                          >
                            <div class="flex items-center gap-2.5 min-w-0">
                              <div class="w-6 h-6 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[10.5px] font-bold text-[#00a884] shrink-0">
                                {props.item.rawValue.account_id.charAt(0).toUpperCase()}
                              </div>
                              <div class="min-w-0">
                                <Select.ItemLabel class="font-medium text-[#e9edef] block truncate">
                                  {props.item.rawValue.account_id}
                                </Select.ItemLabel>
                                <span class="block text-[10px] text-[#8696a0] font-mono truncate">
                                  {props.item.rawValue.phone_number ? `+${props.item.rawValue.phone_number}` : status()}
                                </span>
                              </div>
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                              <span class={`w-1.5 h-1.5 rounded-full ${isOnline() ? 'bg-[#00a884]' : 'bg-[#f15c6d]'}`} />
                              <Select.ItemIndicator>
                                <Check size={13} class="text-[#00a884]" />
                              </Select.ItemIndicator>
                            </div>
                          </Select.Item>
                        );
                      }}
                    >
                      <Select.Trigger
                        style={{ border: '1px solid #2a3942', background: '#111b21', 'justify-content': 'space-between' }}
                        class="w-full h-8 px-3 rounded-lg text-xs text-[#e9edef] flex items-center justify-between cursor-pointer hover:border-[#00a884] transition-colors focus:outline-none focus:border-[#00a884]"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <Smartphone size={14} class="text-[#00a884] shrink-0" />
                          <Select.Value<Account>>
                            {state => (
                              <span class="font-medium text-[#e9edef] truncate">
                                {state.selectedOption()?.account_id || 'Select Account'}
                              </span>
                            )}
                          </Select.Value>
                        </div>
                        <Select.Icon>
                          <ChevronDown size={14} class="text-[#8696a0] shrink-0" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content class="bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-1.5 z-[100] min-w-[300px] max-h-[220px] overflow-y-auto space-y-1">
                          <Select.Listbox class="space-y-1 focus:outline-none" />
                        </Select.Content>
                      </Select.Portal>
                    </Select>
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0]">
                        Message Composition
                      </label>
                      {/* Segmented Switch: Editor vs Live Preview Tabs */}
                      <div class="relative inline-flex items-center w-52 p-1 bg-[#0b141a] border border-[#222d34] rounded-xl text-xs select-none shadow-inner">
                        {/* Smooth sliding active background pill - consistent dark slate design */}
                        <div
                          class="absolute top-1 bottom-1 rounded-lg transition-all duration-200 ease-out pointer-events-none"
                          style={{
                            left: dmTab() === 'editor' ? '4px' : 'calc(50%)',
                            width: 'calc(50% - 4px)',
                            background: '#1f2c34',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            'box-shadow': '0 2px 8px rgba(0,0,0,0.5)'
                          }}
                        />
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', outline: 'none', 'box-shadow': 'none' }}
                          class={`relative z-10 flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                            dmTab() === 'editor'
                              ? 'text-[#00a884] font-bold'
                              : 'text-[#8696a0] hover:text-[#e9edef] font-medium'
                          }`}
                          onClick={() => setDmTab('editor')}
                        >
                          <Type size={13} class={dmTab() === 'editor' ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                          <span>Editor</span>
                        </button>
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', outline: 'none', 'box-shadow': 'none' }}
                          class={`relative z-10 flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                            dmTab() === 'preview'
                              ? 'text-[#00a884] font-bold'
                              : 'text-[#8696a0] hover:text-[#e9edef] font-medium'
                          }`}
                          onClick={() => setDmTab('preview')}
                        >
                          <Eye size={13} class={dmTab() === 'preview' ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>

                    {/* Hidden Inputs for Direct Message Files */}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      class="hidden"
                      ref={dmFileInputMediaRef}
                      onChange={async e => {
                        const files = Array.from(e.currentTarget.files || []);
                        for (const file of files) {
                          const att = await processFileToAttachment(file, 'media');
                          if (att) setDmAttachmentsList(prev => [...prev, att]);
                        }
                        e.currentTarget.value = '';
                      }}
                    />
                    <input
                      type="file"
                      accept="*/*"
                      multiple
                      class="hidden"
                      ref={dmFileInputDocRef}
                      onChange={async e => {
                        const files = Array.from(e.currentTarget.files || []);
                        for (const file of files) {
                          const att = await processFileToAttachment(file, 'document');
                          if (att) setDmAttachmentsList(prev => [...prev, att]);
                        }
                        e.currentTarget.value = '';
                      }}
                    />

                    {/* 1. EDITOR TAB VIEW */}
                    <Show when={dmTab() === 'editor'}>
                      {/* Multi-Media / Document Attachment Gallery Card in Direct Message */}
                      <Show when={dmAttachmentsList().length > 0}>
                        <div class="mb-3 p-3 bg-[#141f26] border border-[#2a3942] rounded-xl space-y-2.5 animate-in fade-in duration-150">
                          <div class="flex items-center justify-between text-xs pb-2 border-b border-[#222d34] flex-wrap gap-2">
                            <span class="font-bold text-[#e9edef] flex items-center gap-2 text-xs">
                              <Paperclip size={14} class="text-[#00a884]" />
                              <span>Attached Files</span>
                              <span class="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/35">
                                {dmAttachmentsList().length}
                              </span>
                            </span>
                            <div class="flex items-center gap-1.5">
                              <button
                                type="button"
                                class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/35 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                                onClick={() => dmFileInputMediaRef?.click()}
                                title="Attach photos and videos to send as inline media"
                              >
                                <Camera size={12} class="text-[#00a884]" />
                                <span>+ Media</span>
                              </button>
                              <button
                                type="button"
                                class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#53bdeb]/15 hover:bg-[#53bdeb]/25 text-[#53bdeb] border border-[#53bdeb]/35 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                                onClick={() => dmFileInputDocRef?.click()}
                                title="Attach any document file (PDF, docx, etc.)"
                              >
                                <Paperclip size={12} class="text-[#53bdeb]" />
                                <span>+ Attachment</span>
                              </button>
                              <button
                                type="button"
                                class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#202c33] hover:bg-[#ef4444]/15 border border-[#2a3942] hover:border-[#ef4444]/40 text-[#8696a0] hover:text-[#ef4444] flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                                onClick={() => setDmAttachmentsList([])}
                                title="Remove all attached files"
                              >
                                <Trash2 size={12} />
                                <span>Clear All</span>
                              </button>
                            </div>
                          </div>

                          <div class="space-y-2 max-h-52 overflow-y-auto p-0.5 pr-1">
                            <For each={dmAttachmentsList()}>
                              {(att, idx) => {
                                 const isImg = () => att.mimeType.startsWith('image/');
                                 const isVid = () => att.mimeType.startsWith('video/');
                                 const isDocMode = () => att.sendAs === 'document';
                                 return (
                                   <div class="p-2.5 px-3 bg-[#111b21] hover:bg-[#18262f] border border-[#2a3942] hover:border-[#00a884]/40 rounded-xl flex items-center justify-between gap-3 text-xs transition-all shadow-xs group">
                                     <div class="flex items-center gap-3 min-w-0 flex-1">
                                       {/* Media Thumbnail */}
                                       <div class="w-11 h-11 rounded-lg bg-[#202c33] border border-[#2a3942] overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                                         <Show
                                           when={att.thumbnailB64}
                                           fallback={
                                             <Show
                                               when={isVid()}
                                               fallback={
                                                 <Show
                                                   when={isImg()}
                                                   fallback={<FileText size={18} class="text-[#53bdeb]" />}
                                                 >
                                                   <ImageIcon size={18} class="text-[#00a884]" />
                                                 </Show>
                                               }
                                             >
                                               <Video size={18} class="text-[#53bdeb]" />
                                             </Show>
                                           }
                                         >
                                           <div class="relative w-full h-full flex items-center justify-center">
                                             <img
                                               src={`data:image/jpeg;base64,${att.thumbnailB64}`}
                                               alt="Thumb"
                                               class="w-full h-full object-cover"
                                             />
                                             <Show when={isVid()}>
                                               <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                 <Play size={11} fill="currentColor" class="text-white ml-0.5" />
                                               </div>
                                             </Show>
                                           </div>
                                         </Show>
                                       </div>

                                       {/* File Name & Delivery Details */}
                                       <div class="min-w-0 flex-1">
                                         <strong class="text-xs font-semibold text-[#e9edef] block truncate max-w-[200px] sm:max-w-[300px] tracking-tight leading-snug" title={att.fileName}>
                                           {att.fileName}
                                         </strong>
                                         <div class="flex items-center gap-2 mt-1 flex-wrap">
                                           <span class="text-[11px] text-[#8696a0] font-mono">
                                             {(att.fileSize / 1024).toFixed(1)} KB
                                           </span>
                                           <span class="text-[#2a3942]">&bull;</span>
                                           {/* Delivery Mode Toggle Pill */}
                                           <button
                                             type="button"
                                             class={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border ${
                                               isDocMode()
                                                 ? 'bg-[#53bdeb]/15 text-[#53bdeb] border-[#53bdeb]/40 hover:bg-[#53bdeb]/30'
                                                 : 'bg-[#00a884]/15 text-[#00a884] border-[#00a884]/40 hover:bg-[#00a884]/30'
                                             }`}
                                             title={
                                               isDocMode()
                                                 ? 'Sending as Document (preserves original quality, up to 100MB). Click to switch to Media.'
                                                 : 'Sending as Media (WhatsApp preview, max 16MB). Click to switch to Document.'
                                             }
                                             onClick={() => {
                                               setDmAttachmentsList(prev =>
                                                 prev.map((item, i) =>
                                                   i === idx()
                                                     ? { ...item, sendAs: item.sendAs === 'media' ? 'document' : 'media' }
                                                     : item
                                                 )
                                               );
                                             }}
                                           >
                                             <Show when={isDocMode()} fallback={<Video size={10} />}>
                                               <FileText size={10} />
                                             </Show>
                                             <span>{isDocMode() ? 'Document' : 'Media'}</span>
                                           </button>
                                         </div>
                                       </div>
                                     </div>

                                     {/* Actions: Edit Photo, Cut/Trim, Remove */}
                                     <div class="flex items-center gap-2 shrink-0">
                                       <Show when={isImg()}>
                                         <button
                                           type="button"
                                           class="h-7 px-2.5 rounded-lg bg-[#202c33] hover:bg-[#00a884]/20 border border-[#2a3942] hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer active:scale-95"
                                           title="Open WhatsApp Photo Studio (Crop, Doodle, Text, Filters)"
                                           onClick={() => {
                                             setActiveModal({
                                               type: 'edit_photo',
                                               fileName: att.fileName,
                                               imageUrl: att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : (att.blobUrl || ''),
                                               returnToDirectMessage: true,
                                               onSave: async (editedDataUrl: string, passedThumbB64?: string) => {
                                                 const base64 = editedDataUrl.split(',')[1];
                                                 let thumbB64 = passedThumbB64;
                                                 if (!thumbB64) {
                                                   try {
                                                     const canvas = document.createElement('canvas');
                                                     canvas.width = 120;
                                                     canvas.height = 120;
                                                     const img = document.createElement('img');
                                                     img.src = editedDataUrl;
                                                     await new Promise(r => { img.onload = r; setTimeout(r, 500); });
                                                     const ctx = canvas.getContext('2d');
                                                     ctx?.drawImage(img, 0, 0, 120, 120);
                                                     thumbB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                                                   } catch {}
                                                 }
                                                 setDmAttachmentsList(prev =>
                                                   prev.map((item, i) =>
                                                     i === idx()
                                                       ? {
                                                           ...item,
                                                           fileDataB64: base64,
                                                           blobUrl: editedDataUrl,
                                                           mimeType: 'image/jpeg',
                                                           thumbnailB64: thumbB64 || item.thumbnailB64,
                                                           fileSize: Math.round((base64.length * 3) / 4)
                                                         }
                                                       : item
                                                   )
                                                 );
                                                 showToast('Photo updated from Photo Studio!', 'success');
                                                 setActiveModal({
                                                   type: 'direct_message',
                                                   jid: dmJid(),
                                                   accountId: dmAccount(),
                                                   preserveState: true
                                                 });
                                               }
                                             });
                                           }}
                                         >
                                           <Crop size={12} />
                                           <span>Edit Photo</span>
                                         </button>
                                       </Show>
                                       <Show when={isVid()}>
                                         <button
                                           type="button"
                                           class="h-7 px-2.5 rounded-lg bg-[#202c33] hover:bg-[#00a884]/20 border border-[#2a3942] hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer active:scale-95"
                                           title="Open Video Trimmer"
                                           onClick={() => {
                                             setActiveModal({
                                               type: 'cut_video',
                                               fileName: att.fileName,
                                               videoUrl: att.blobUrl || `data:${att.mimeType};base64,${att.fileDataB64}`,
                                               fileSize: att.fileSize,
                                               returnToDirectMessage: true,
                                               onTrim: async (params) => {
                                                 const controller = new AbortController();
                                                 const timeoutId = setTimeout(() => controller.abort(), 65000);
                                                 try {
                                                   const res = await fetch('/api/trim-video', {
                                                     method: 'POST',
                                                     headers: { 'Content-Type': 'application/json' },
                                                     signal: controller.signal,
                                                     body: JSON.stringify({
                                                       file_name: att.fileName,
                                                       file_data: att.fileDataB64,
                                                       start_time: params.startTime,
                                                       end_time: params.endTime,
                                                       mute: params.mute,
                                                       preserve_hd: params.preserveHd
                                                     })
                                                   });
                                                   clearTimeout(timeoutId);
                                                   const resData = await res.json();
                                                   if (resData.success && resData.file_data) {
                                                     let newBlobUrl = att.blobUrl;
                                                     try {
                                                       const byteChars = atob(resData.file_data);
                                                       const byteNums = new Array(byteChars.length);
                                                       for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
                                                       const byteArray = new Uint8Array(byteNums);
                                                       const blob = new Blob([byteArray], { type: 'video/mp4' });
                                                       newBlobUrl = URL.createObjectURL(blob);
                                                     } catch {}

                                                     setDmAttachmentsList(prev =>
                                                       prev.map((item, i) =>
                                                         i === idx()
                                                           ? {
                                                               ...item,
                                                               fileName: resData.file_name || item.fileName,
                                                               fileDataB64: resData.file_data,
                                                               fileSize: resData.file_size || item.fileSize,
                                                               thumbnailB64: resData.thumbnail_data || item.thumbnailB64,
                                                               blobUrl: newBlobUrl,
                                                               mimeType: 'video/mp4'
                                                             }
                                                           : item
                                                       )
                                                     );
                                                     showToast('Video trimmed successfully!', 'success');
                                                   } else {
                                                     showToast(resData.error || 'Failed to trim video', 'error');
                                                   }
                                                 } catch (e: any) {
                                                   clearTimeout(timeoutId);
                                                   const msg = e?.name === 'AbortError' ? 'Trimming timed out' : (e?.message || 'Network error');
                                                   showToast(`Error trimming video: ${msg}`, 'error');
                                                 }
                                               }
                                             });
                                           }}
                                         >
                                           <Scissors size={12} />
                                           <span>Cut / Trim</span>
                                         </button>
                                       </Show>
                                       <button
                                         type="button"
                                         class="w-7 h-7 rounded-lg bg-[#202c33] hover:bg-[#ef4444]/20 border border-[#2a3942] hover:border-[#ef4444]/40 text-[#8696a0] hover:text-[#ef4444] flex items-center justify-center p-0 transition-colors cursor-pointer"
                                         title={`Remove ${att.fileName}`}
                                         onClick={() => {
                                           setDmAttachmentsList(prev => prev.filter((_, i) => i !== idx()));
                                         }}
                                       >
                                         <X size={13} />
                                       </button>
                                     </div>
                                   </div>
                                 );
                               }}
                             </For>
                           </div>
                         </div>
                       </Show>

                       <div class="relative w-full">
                         <textarea
                          id="dmMessageTextarea"
                          class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl p-3.5 pb-11 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884] h-[260px] min-h-[260px] resize-y font-sans leading-relaxed transition-colors"
                          placeholder="Type your WhatsApp message..."
                           value={dmMessage()}
                           onInput={e => setDmMessage(e.currentTarget.value)}
                         />

                         {/* Floating Bottom-Right Tools (Media, Document, Emoji & Formatting) */}
                         <div class="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 z-20">
                           {/* 1. Floating Media Picker Button */}
                           <button
                             type="button"
                             style={{
                               border: dmMediaCount() > 0 ? '1px solid #00a884' : '1px solid #2a3942',
                               background: dmMediaCount() > 0 ? '#202c33' : '#111b21'
                             }}
                             class={`w-7 h-7 rounded-lg flex items-center justify-center p-0 transition-colors cursor-pointer relative ${
                               dmMediaCount() > 0 ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#00a884] hover:border-[#00a884]'
                             }`}
                             title="Attach Photos or Videos (Inline Media)"
                             onClick={() => dmFileInputMediaRef?.click()}
                           >
                             <Camera size={14} class={dmMediaCount() > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                             <Show when={dmMediaCount() > 0}>
                               <span class="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 bg-[#00a884] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#111b21]">
                                 {dmMediaCount()}
                               </span>
                             </Show>
                           </button>

                           {/* 2. Floating Document Picker Button */}
                           <button
                             type="button"
                             style={{
                               border: dmDocCount() > 0 ? '1px solid #53bdeb' : '1px solid #2a3942',
                               background: dmDocCount() > 0 ? '#202c33' : '#111b21'
                             }}
                             class={`w-7 h-7 rounded-lg flex items-center justify-center p-0 transition-colors cursor-pointer relative ${
                               dmDocCount() > 0 ? 'text-[#53bdeb]' : 'text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb]'
                             }`}
                             title="Attach Documents or Raw Files"
                             onClick={() => dmFileInputDocRef?.click()}
                           >
                             <Paperclip size={14} class={dmDocCount() > 0 ? 'text-[#53bdeb]' : 'text-[#8696a0]'} />
                             <Show when={dmDocCount() > 0}>
                               <span class="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 bg-[#53bdeb] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#111b21]">
                                 {dmDocCount()}
                               </span>
                             </Show>
                           </button>

                           <div class="w-[1px] h-3.5 bg-[#2a3942] mx-0.5" />

                           {/* 3. Emoji Popover */}
                           <div class="relative" ref={dmEmojiWrapRef}>
                             <button
                               type="button"
                               style={{ border: '1px solid #2a3942', background: dmEmojiOpen() ? '#202c33' : '#111b21' }}
                               class="w-7 h-7 rounded-lg text-[#8696a0] hover:text-[#ffbc38] hover:border-[#ffbc38] flex items-center justify-center p-0 transition-colors cursor-pointer"
                               title="Insert Emoji"
                               onClick={() => {
                                 setDmEmojiOpen(!dmEmojiOpen());
                                 setDmFormatOpen(false);
                               }}
                             >
                               <Smile size={14} class="text-[#ffbc38]" />
                             </button>

                             <Show when={dmEmojiOpen()}>
                               <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2.5 z-40 w-64 animate-in fade-in zoom-in-95 duration-100">
                                 <div class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0] mb-2 pb-1 border-b border-[#222d34]">
                                   Quick Emojis
                                 </div>
                                 <div class="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto p-0.5">
                                   <For each={EMOJIS}>
                                     {em => (
                                       <button
                                         type="button"
                                         style={{ border: 'none', background: 'transparent' }}
                                         class="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-[#202c33] cursor-pointer transition-transform hover:scale-125 p-0"
                                         onClick={() => {
                                           insertToken('dmMessageTextarea', dmMessage, setDmMessage, em);
                                           setDmEmojiOpen(false);
                                         }}
                                       >
                                         {em}
                                       </button>
                                     )}
                                   </For>
                                 </div>
                               </div>
                             </Show>
                           </div>

                           {/* 4. Formatting Shortcuts Popover */}
                           <div class="relative" ref={dmFormatWrapRef}>
                             <button
                               type="button"
                               style={{ border: '1px solid #2a3942', background: dmFormatOpen() ? '#202c33' : '#111b21' }}
                               class="w-7 h-7 rounded-lg text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb] flex items-center justify-center p-0 transition-colors cursor-pointer"
                               title="WhatsApp Formatting"
                               onClick={() => {
                                 setDmFormatOpen(!dmFormatOpen());
                                 setDmEmojiOpen(false);
                               }}
                             >
                               <HelpCircle size={14} class="text-[#53bdeb]" />
                             </button>

                             <Show when={dmFormatOpen()}>
                               <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2 z-40 w-64 animate-in fade-in zoom-in-95 duration-100 space-y-1">
                                 <div class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0] mb-1.5 px-1 pb-1 border-b border-[#222d34]">
                                   WhatsApp Formatting
                                 </div>
                                 <div
                                   class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                   onClick={() => {
                                     wrapText('dmMessageTextarea', dmMessage, setDmMessage, '*');
                                     setDmFormatOpen(false);
                                   }}
                                 >
                                   <code class="text-[#00a884] font-mono font-semibold">*text*</code>
                                   <strong class="text-[#e9edef]">Bold</strong>
                                 </div>
                                 <div
                                   class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                   onClick={() => {
                                     wrapText('dmMessageTextarea', dmMessage, setDmMessage, '_');
                                     setDmFormatOpen(false);
                                   }}
                                 >
                                   <code class="text-[#00a884] font-mono font-semibold">_text_</code>
                                   <em class="text-[#e9edef]">Italic</em>
                                 </div>
                                 <div
                                   class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                   onClick={() => {
                                     wrapText('dmMessageTextarea', dmMessage, setDmMessage, '~');
                                     setDmFormatOpen(false);
                                   }}
                                 >
                                   <code class="text-[#00a884] font-mono font-semibold">~text~</code>
                                   <span class="line-through text-[#e9edef]">Strikethrough</span>
                                 </div>
                                 <div
                                   class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                   onClick={() => {
                                     wrapText('dmMessageTextarea', dmMessage, setDmMessage, '```');
                                     setDmFormatOpen(false);
                                   }}
                                 >
                                   <code class="text-[#00a884] font-mono font-semibold">```text```</code>
                                   <span class="font-mono text-[#e9edef] text-[11px]">Monospace</span>
                                 </div>
                               </div>
                             </Show>
                           </div>
                         </div>
                       </div>

                       {/* Metadata Word & Character Count Bar */}
                       <div class="flex items-center text-[11px] text-[#8696a0] mt-1.5 px-1 font-mono">
                         <span>
                           {dmMessage().length} characters • {dmMessage().trim() ? dmMessage().trim().split(/\s+/).length : 0} words
                         </span>
                       </div>
                     </Show>

                     {/* 2. AUTHENTIC WHATSAPP CHAT PREVIEW TAB */}
                     <Show when={dmTab() === 'preview'}>
                       <div class="rounded-xl border border-[#2a3942] bg-[#0b141a] overflow-hidden flex flex-col min-h-[260px] max-h-[380px] relative p-3">
                         <div class="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                           {/* Centered Date Badge */}
                           <div class="self-center my-1 px-3 py-0.5 rounded-md bg-[#182229]/90 border border-[#2a3942] text-[10.5px] text-[#8696a0] font-medium shadow-xs">
                             TODAY
                           </div>

                           {/* WhatsApp Outgoing Speech Bubble */}
                           <div class="max-w-[88%] self-end mt-auto mb-1 w-full flex flex-col items-end">
                             <Show
                               when={dmAttachmentsList().length > 0 || dmMessage().trim().length > 0}
                               fallback={
                                 <div class="bg-[#182229] border border-[#2a3942] text-[#8696a0] p-4 rounded-xl text-xs text-center italic w-full">
                                   No message text or attachments yet. Switch to Editor to compose.
                                 </div>
                               }
                             >
                               <div class="bg-[#005c4b] text-[#e9edef] p-2.5 px-3 rounded-2xl rounded-tr-xs shadow-md text-xs leading-relaxed break-words space-y-1.5 max-w-full">
                                 {/* Photos Grid in Chat Bubble */}
                                 <Show when={dmAttachmentsList().some(a => a.sendAs !== 'document' && a.mimeType.startsWith('image/'))}>
                                   <div
                                     class={`rounded-xl overflow-hidden mb-1 gap-1 bg-black/20 border border-black/10 ${
                                       dmAttachmentsList().filter(a => a.sendAs !== 'document' && a.mimeType.startsWith('image/')).length === 1
                                         ? 'flex items-center justify-center max-h-52'
                                         : 'grid grid-cols-2 max-h-56'
                                     }`}
                                   >
                                     <For each={dmAttachmentsList().filter(a => a.sendAs !== 'document' && a.mimeType.startsWith('image/'))}>
                                       {att => (
                                         <div class="relative overflow-hidden aspect-square flex items-center justify-center bg-black/20">
                                           <img
                                             src={att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : (att.blobUrl || '')}
                                             alt="Photo Preview"
                                             class="w-full h-full object-cover"
                                           />
                                         </div>
                                       )}
                                     </For>
                                   </div>
                                 </Show>

                                 {/* Playable Video Preview directly inside WhatsApp Bubble */}
                                 <For each={dmAttachmentsList().filter(a => a.sendAs !== 'document' && a.mimeType.startsWith('video/'))}>
                                   {att => (
                                     <div class="relative rounded-xl overflow-hidden max-h-52 bg-black flex items-center justify-center border border-black/20 mb-1 shadow-md">
                                       <video
                                         src={att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : (att.blobUrl || '')}
                                         poster={att.thumbnailB64 ? `data:image/jpeg;base64,${att.thumbnailB64}` : undefined}
                                         controls
                                         preload="metadata"
                                         playsinline
                                         class="w-full h-auto max-h-48 rounded-xl object-contain bg-black cursor-pointer"
                                       />
                                     </div>
                                   )}
                                 </For>

                                 {/* Document / Raw File Attachments */}
                                 <For each={dmAttachmentsList().filter(a => a.sendAs === 'document' || (!a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')))}>
                                   {att => (
                                     <div class="p-2 px-2.5 rounded-xl bg-[#182229]/90 border border-[#2a3942] flex items-center gap-2 mb-1">
                                       <div class="w-8 h-8 rounded-lg bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#53bdeb] shrink-0 font-bold uppercase text-[10px]">
                                         <FileText size={16} />
                                       </div>
                                       <div class="min-w-0 flex-1">
                                         <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                                           {att.fileName}
                                         </strong>
                                         <span class="text-[10px] text-[#8696a0] block mt-0.5 font-mono">
                                           {(att.fileSize / 1024).toFixed(1)} KB &bull; {att.fileName.split('.').pop()?.toUpperCase()}
                                         </span>
                                       </div>
                                     </div>
                                   )}
                                 </For>

                                 {/* Formatted Message Text with Live WhatsApp Markdown */}
                                 <Show when={dmMessage().trim().length > 0}>
                                   <div
                                     class="leading-relaxed m-0 text-xs break-words"
                                     innerHTML={formatWhatsAppText(dmMessage())}
                                   />
                                 </Show>

                                 {/* Outgoing Message Timestamp & Double Blue Ticks */}
                                 <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-white/60">
                                   <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                   <CheckCheck size={14} class="text-[#53bdeb]" />
                                 </div>
                               </div>
                             </Show>
                           </div>
                         </div>
                       </div>
                     </Show>
                   </div>
                  <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
                    <button
                      type="button"
                      disabled={isSendingDm()}
                      class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer disabled:opacity-50"
                      onClick={handleClose}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isSendingDm()}
                      class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={async () => {
                        const jid = dmJid().trim();
                        const acc = dmAccount();
                        const msg = dmMessage().trim();
                        const atts = dmAttachmentsList();
                        if (!jid || (!msg && atts.length === 0)) {
                          showToast('Recipient and either message or attachment required', 'error');
                          return;
                        }
                        setIsSendingDm(true);
                        try {
                          await sendDirectMessage(
                            jid,
                            acc,
                            msg,
                            atts.length > 0
                              ? atts.map(a => ({
                                  file_name: a.fileName,
                                  file_data: a.fileDataB64,
                                  mime_type: a.mimeType,
                                  send_as: a.sendAs,
                                  thumbnail_data: a.thumbnailB64
                                }))
                              : null
                          );
                        } finally {
                          setIsSendingDm(false);
                        }
                      }}
                    >
                      <Show
                        when={isSendingDm()}
                        fallback={<Send size={13} class="text-[#00a884]" />}
                      >
                        <RefreshCw size={13} class="text-[#00a884] animate-spin" />
                      </Show>
                      <span>{isSendingDm() ? 'Sending...' : 'Send Now'}</span>
                    </button>
                  </div>
                </div>
              </Show>

              {/* 5. ADD CONTACTS TO CAMPAIGN */}
              <Show when={addContactsData()}>
                {m => {
                  const onSearchInput = (val: string) => {
                    setContactSearchFilter(val);
                    if (searchTimer) clearTimeout(searchTimer);
                    searchTimer = setTimeout(() => {
                      fetchContacts(val, selectedAccountFilter(), false);
                    }, 250);
                  };

                  const onAccountSelect = (acc: string) => {
                    setSelectedAccountFilter(acc);
                    fetchContacts(contactSearchFilter(), acc, false);
                  };

                  const handleScroll = (e: Event) => {
                    const target = e.currentTarget as HTMLElement;
                    if (target.scrollHeight - target.scrollTop - target.clientHeight < 120) {
                      if (!contactsLoading() && contactsHasMore()) {
                        fetchContacts(contactSearchFilter(), selectedAccountFilter(), true);
                      }
                    }
                  };

                  const isAllSelected = () => {
                    const list = contacts();
                    return list.length > 0 && list.every(c => !!selectedContactsMap()[c.jid]);
                  };

                  const toggleSelectAll = () => {
                    const list = contacts();
                    const map = { ...selectedContactsMap() };
                    if (isAllSelected()) {
                      for (const c of list) {
                        delete map[c.jid];
                      }
                    } else {
                      for (const c of list) {
                        map[c.jid] = c;
                      }
                    }
                    setSelectedContactsMap(map);
                  };

                  interface AccountOption {
                    value: string;
                    label: string;
                    phone?: string;
                    isOnline?: boolean;
                  }

                  const accountOptions = (): AccountOption[] => [
                    { value: 'all', label: 'All Accounts' },
                    ...accounts().map(a => {
                      const status = getAccountStatusState(a.status);
                      return {
                        value: a.account_id,
                        label: a.account_id,
                        phone: a.phone_number ? `+${a.phone_number}` : undefined,
                        isOnline: status === 'Connected'
                      };
                    })
                  ];

                  const selectedCount = () => Object.keys(selectedContactsMap()).length;

                  return (
                    <div class="space-y-3.5">
                      {/* Search and Account Filter Bar */}
                      <div class="flex items-center gap-2.5">
                        <div class="search-input-wrap flex-1">
                          <Search size={14} class="search-icon" />
                          <input
                            type="text"
                            placeholder="Search contacts archive by name, phone, or JID..."
                            class="search-input"
                            value={contactSearchFilter()}
                            onInput={e => onSearchInput(e.currentTarget.value)}
                          />
                        </div>

                        {/* Account Filter Custom Dropdown */}
                        <div class="relative shrink-0" ref={dropdownWrapRef}>
                          <button
                            type="button"
                            style={{ border: '1px solid #2a3942', background: '#111b21' }}
                            class="h-8 px-3 rounded-lg text-xs text-[#e9edef] flex items-center justify-between gap-2.5 cursor-pointer hover:border-[#00a884] transition-colors focus:outline-none focus:border-[#00a884] min-w-[150px]"
                            onClick={() => setAccountDropdownOpen(!accountDropdownOpen())}
                          >
                            <div class="flex items-center gap-2 truncate">
                              {selectedAccountFilter() === 'all' ? (
                                <Users size={13} class="text-[#00a884] shrink-0" />
                              ) : (
                                <Smartphone size={13} class="text-[#00a884] shrink-0" />
                              )}
                              <span class="font-medium text-[#e9edef] truncate">
                                {selectedAccountFilter() === 'all' ? 'All Accounts' : selectedAccountFilter()}
                              </span>
                            </div>
                            <ChevronDown
                              size={14}
                              class={`text-[#8696a0] shrink-0 transition-transform duration-200 ${
                                accountDropdownOpen() ? 'rotate-180 text-[#00a884]' : ''
                              }`}
                            />
                          </button>

                          <Show when={accountDropdownOpen()}>
                            <div
                              class="absolute right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-1.5 z-50 min-w-[230px] max-h-[240px] overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-100"
                            >
                              <For each={accountOptions()}>
                                {opt => {
                                  const isSelected = () => opt.value === selectedAccountFilter();
                                  const isAll = opt.value === 'all';
                                  return (
                                    <div
                                      class={`px-2.5 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                                        isSelected()
                                          ? 'bg-[#202c33] text-[#00a884]'
                                          : 'text-[#e9edef] hover:bg-[#202c33]'
                                      }`}
                                      onClick={() => {
                                        onAccountSelect(opt.value);
                                        setAccountDropdownOpen(false);
                                      }}
                                    >
                                      <div class="flex items-center gap-2.5 min-w-0">
                                        {isAll ? (
                                          <div class="w-6 h-6 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884] shrink-0">
                                            <Users size={12} />
                                          </div>
                                        ) : (
                                          <div class="w-6 h-6 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[10.5px] font-bold text-[#00a884] shrink-0">
                                            {opt.label.charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <div class="min-w-0">
                                          <strong class="font-medium text-[#e9edef] block truncate">
                                            {opt.label}
                                          </strong>
                                          <span class="block text-[10px] text-[#8696a0] font-mono truncate">
                                            {opt.phone || (isAll ? 'All synced contacts' : 'WhatsApp Account')}
                                          </span>
                                        </div>
                                      </div>
                                      <div class="flex items-center gap-2 shrink-0">
                                        {!isAll && (
                                          <span
                                            class={`w-1.5 h-1.5 rounded-full ${
                                              opt.isOnline ? 'bg-[#00a884]' : 'bg-[#f15c6d]'
                                            }`}
                                          />
                                        )}
                                        {isSelected() && <Check size={13} class="text-[#00a884]" />}
                                      </div>
                                    </div>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </div>

                      {/* Quick Action & Count Strip */}
                      <div class="flex items-center justify-between text-xs px-1 text-[#8696a0]">
                        <div class="flex items-center gap-2">
                          <span>
                            Showing {contacts().length} of {contactsTotal()} contacts
                          </span>
                          <Show when={contactsLoading()}>
                            <span class="text-[#00a884] flex items-center gap-1 text-[11px]">
                              <RefreshCw size={11} class="animate-spin" /> Loading...
                            </span>
                          </Show>
                        </div>
                        <div class="flex items-center gap-2">
                          <button
                            type="button"
                            style={{ border: '1px solid #2a3942', background: '#182229' }}
                            class="h-7 px-2.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer hover:border-[#00a884] hover:text-[#00a884] text-[#e9edef] transition-colors select-none"
                            onClick={toggleSelectAll}
                          >
                            <Check size={12} class={isAllSelected() ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                            <span>{isAllSelected() ? 'Deselect All' : 'Select All'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Contacts Infinite Scroll List */}
                      <div
                        class="max-h-[350px] overflow-y-auto border border-[#2a3942] rounded-xl divide-y divide-[#2a3942]/50 bg-[#111b21]"
                        onScroll={handleScroll}
                      >
                        <Show
                          when={contacts().length > 0}
                          fallback={
                            <div class="text-center py-12 text-[#8696a0] text-xs">
                              {contactsLoading() ? 'Loading contacts from archive...' : 'No contacts found.'}
                            </div>
                          }
                        >
                          <For each={contacts()}>
                            {c => {
                              const isAlreadyAdded = () => {
                                const existing = selectedCampaignDetails()?.recent_recipients || [];
                                return existing.some(
                                  r =>
                                    (r.jid && r.jid === c.jid) ||
                                    (r.phone_number && c.phone_number && r.phone_number === c.phone_number) ||
                                    (r.phone_number && c.jid && c.jid.startsWith(r.phone_number.replace(/\D/g, '')))
                                );
                              };
                              const isSelected = () => !!selectedContactsMap()[c.jid];
                              return (
                                <div
                                  class={`p-2.5 px-3 flex items-center justify-between text-xs transition-colors ${
                                    isAlreadyAdded()
                                      ? 'opacity-40 cursor-not-allowed bg-[#141f26]'
                                      : isSelected()
                                      ? 'bg-[#202c33]/40 hover:bg-[#202c33]/80 cursor-pointer'
                                      : 'hover:bg-[#202c33]/80 cursor-pointer'
                                  }`}
                                  onClick={() => {
                                    if (isAlreadyAdded()) return;
                                    const map = { ...selectedContactsMap() };
                                    if (map[c.jid]) {
                                      delete map[c.jid];
                                    } else {
                                      map[c.jid] = c;
                                    }
                                    setSelectedContactsMap(map);
                                  }}
                                >
                                  <div class="flex items-center gap-3 min-w-0">
                                    <Show
                                      when={!isAlreadyAdded()}
                                      fallback={
                                        <span class="text-[10px] text-[#8696a0] bg-[#182229] border border-[#2a3942] px-1.5 py-0.5 rounded-full font-medium shrink-0">
                                          Added
                                        </span>
                                      }
                                    >
                                      <Checkbox checked={isSelected()} onChange={() => {}}>
                                        <Checkbox.Input class="sr-only" />
                                        <Checkbox.Control class="w-4 h-4 rounded border border-[#2a3942] bg-[#182229] flex items-center justify-center shrink-0">
                                          <Checkbox.Indicator>
                                            <Check size={11} class="text-[#00a884]" />
                                          </Checkbox.Indicator>
                                        </Checkbox.Control>
                                      </Checkbox>
                                    </Show>

                                    {/* Profile Picture / Avatar with Lazy Loading & Fallback */}
                                    <div class="relative w-8 h-8 shrink-0">
                                      <img
                                        src={c.avatar_url || `/api/contacts/${encodeURIComponent(c.jid || c.id || '')}/avatar-image`}
                                        alt={c.full_name || 'Contact'}
                                        loading="lazy"
                                        referrerpolicy="no-referrer"
                                        class="w-8 h-8 rounded-full object-cover border border-[#2a3942] shrink-0"
                                        onError={e => {
                                          e.currentTarget.style.display = 'none';
                                          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                                          if (next) next.style.display = 'flex';
                                        }}
                                      />
                                      <div
                                        style={{ display: 'none' }}
                                        class="w-8 h-8 rounded-full bg-[#202c33] border border-[#2a3942] items-center justify-center text-xs font-bold text-[#00a884] shrink-0"
                                      >
                                        {(c.full_name || c.first_name || c.push_name || c.phone_number || 'U').charAt(0).toUpperCase()}
                                      </div>
                                    </div>

                                    {/* Name and Phone Details */}
                                    <div class="min-w-0">
                                      <div class="flex items-center gap-2">
                                        <strong class="text-xs text-[#e9edef] block truncate">
                                          {c.full_name || c.first_name || c.push_name || 'Unknown Contact'}
                                        </strong>
                                        <Show when={c.business_name}>
                                          <span class="text-[10px] text-[#8696a0] px-1.5 py-0.2 rounded bg-[#202c33] border border-[#2a3942] shrink-0">
                                            {c.business_name}
                                          </span>
                                        </Show>
                                      </div>
                                      <div class="flex items-center gap-1.5 mt-0.5">
                                        <span class="text-xs font-mono text-[#00a884]">
                                          {c.phone_number ? (c.phone_number.startsWith('+') ? c.phone_number : `+${c.phone_number}`) : c.jid.split('@')[0]}
                                        </span>
                                        <span class="text-[10.5px] font-mono text-[#8696a0] truncate">
                                          &bull; {c.jid}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            }}
                          </For>
                        </Show>

                        {/* Infinite Scroll Indicator at Bottom */}
                        <Show when={contactsLoading() && contacts().length > 0}>
                          <div class="p-3 text-center text-xs text-[#00a884] flex items-center justify-center gap-1.5">
                            <RefreshCw size={12} class="animate-spin" /> Loading more contacts...
                          </div>
                        </Show>
                        <Show when={!contactsHasMore() && contacts().length > 0}>
                          <div class="p-2.5 text-center text-[11px] text-[#8696a0] border-t border-[#2a3942]/30">
                            All {contactsTotal()} contacts loaded
                          </div>
                        </Show>
                      </div>

                      {/* Modal Footer */}
                      <div class="flex justify-between items-center pt-3 border-t border-[#222d34]">
                        <div class="flex items-center gap-2">
                          <span class="text-xs font-medium text-[#e9edef]">
                            {selectedCount()} selected
                          </span>
                          <Show when={selectedCount() > 0}>
                            <button
                              type="button"
                              class="text-[11px] text-[#8696a0] hover:text-[#f15c6d] cursor-pointer ml-1"
                              onClick={() => setSelectedContactsMap({})}
                            >
                              Clear selection
                            </button>
                          </Show>
                        </div>
                        <div class="flex items-center gap-2.5">
                          <button class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer" onClick={handleClose}>
                            Cancel
                          </button>
                          <button
                            class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
                            disabled={selectedCount() === 0}
                            onClick={() => {
                              const selected = Object.values(selectedContactsMap()).filter(
                                c =>
                                  !selectedCampaignDetails()?.recent_recipients?.some(
                                    r => r.jid === c.jid || (r.phone_number && c.phone_number && r.phone_number === c.phone_number)
                                  )
                              );
                              const recipientsPayload = selected.map(c => ({
                                jid: c.jid || (c.phone_number ? `${c.phone_number.replace(/\D/g, '')}@s.whatsapp.net` : ''),
                                phone_number: c.phone_number || c.jid.split('@')[0],
                                display_name: c.full_name || c.push_name || undefined
                              }));
                              addRecipients(m().campaignId, recipientsPayload);
                            }}
                          >
                            Add {selectedCount()} Contacts
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }}
              </Show>

              {/* 6. CREATE CAMPAIGN */}
              <Show when={modal()?.type === 'create_campaign'}>
                <div class="space-y-4">
                  {/* 1. Campaign Name */}
                  <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                      Campaign Name
                    </label>
                    <input
                      type="text"
                      class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884] transition-colors"
                      placeholder="e.g. October Product Launch"
                      value={campName()}
                      onInput={e => setCampName(e.currentTarget.value)}
                    />
                  </div>

                  {/* 2. Multi-Sender WhatsApp Account Selection Dropdown */}
                  <div class="relative" ref={campAccountDropdownRef}>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0]">
                        Sender WhatsApp Account(s) &bull; Multi-Sender Pool
                      </label>
                      <span class="text-[11px] font-mono text-[#00a884] font-semibold">
                        {campAccounts().length === accounts().length
                          ? 'All Accounts'
                          : `${campAccounts().length} of ${accounts().length} Selected`}
                      </span>
                    </div>

                    {/* Dropdown Trigger Button */}
                    <button
                      type="button"
                      style={{ border: '1px solid #2a3942', background: '#111b21' }}
                      class={`w-full min-h-[42px] px-3.5 py-2 rounded-xl text-xs text-[#e9edef] flex items-center justify-between cursor-pointer transition-all hover:border-[#00a884] focus:outline-none focus:border-[#00a884] ${
                        campAccountDropdownOpen() ? 'border-[#00a884] shadow-[0_0_0_2px_rgba(0,168,132,0.15)]' : ''
                      }`}
                      onClick={() => setCampAccountDropdownOpen(!campAccountDropdownOpen())}
                    >
                      <div class="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 py-0.5">
                        <Show
                          when={campAccounts().length > 0}
                          fallback={
                            <span class="text-[#8696a0]">Select sender accounts...</span>
                          }
                        >
                          <Show
                            when={campAccounts().length === accounts().length && accounts().length > 1}
                            fallback={
                              <For each={campAccounts()}>
                                {accId => (
                                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#202c33] border border-[#2a3942] text-[11px] text-[#e9edef] font-medium shrink-0">
                                    <span class="w-3.5 h-3.5 rounded-full bg-[#00a884]/20 text-[#00a884] font-bold text-[8.5px] flex items-center justify-center">
                                      {accId.charAt(0).toUpperCase()}
                                    </span>
                                    <span>{accId}</span>
                                  </span>
                                )}
                              </For>
                            }
                          >
                            <span class="inline-flex items-center gap-1.5 text-xs text-[#e9edef] font-semibold">
                              <span class="w-5 h-5 rounded-full bg-[#00a884]/20 text-[#00a884] flex items-center justify-center">
                                <Users size={12} />
                              </span>
                              <span>All Connected Accounts ({accounts().length})</span>
                            </span>
                          </Show>
                        </Show>
                      </div>

                      <div class="flex items-center gap-2 shrink-0 ml-2">
                        <span class="text-[10.5px] font-mono px-2 py-0.5 rounded-full bg-[#202c33] text-[#00a884] border border-[#2a3942] font-bold">
                          {campAccounts().length}
                        </span>
                        <ChevronDown
                          size={14}
                          class={`text-[#8696a0] transition-transform duration-200 ${
                            campAccountDropdownOpen() ? 'rotate-180 text-[#00a884]' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Popover Menu */}
                    <Show when={campAccountDropdownOpen()}>
                      <div class="absolute left-0 right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-2 z-[100] animate-in fade-in zoom-in-95 duration-100 space-y-2">
                        {/* Header Actions: Select All, Active Only */}
                        <div class="flex items-center justify-between pb-2 border-b border-[#222d34] px-1">
                          <span class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0]">
                            Select Senders ({campAccounts().length}/{accounts().length})
                          </span>
                          <div class="flex items-center gap-1.5">
                            <button
                              type="button"
                              class="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#202c33] hover:bg-[#2a3942] text-[#00a884] border border-[#00a884]/30 hover:border-[#00a884] transition-colors cursor-pointer flex items-center gap-1"
                              onClick={() => setCampAccounts(accounts().map(a => a.account_id))}
                            >
                              <Check size={10} stroke-width={2.5} />
                              <span>Select All</span>
                            </button>
                            <button
                              type="button"
                              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#111b21] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] transition-colors cursor-pointer"
                              onClick={() => {
                                const active = accounts().find(a => a.is_active)?.account_id || accounts()[0]?.account_id;
                                setCampAccounts(active ? [active] : []);
                              }}
                            >
                              Active Only
                            </button>
                          </div>
                        </div>

                        {/* Accounts List in Dropdown */}
                        <div class="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                          <For each={accounts()}>
                            {acc => {
                              const isSelected = () => campAccounts().includes(acc.account_id);
                              const status = () => getAccountStatusState(acc.status);
                              const isOnline = () => status() === 'Connected';
                              return (
                                <div
                                  class={`p-2 px-2.5 rounded-lg flex items-center justify-between cursor-pointer text-xs transition-all border ${
                                    isSelected()
                                      ? 'bg-[#00a884]/10 border-[#00a884]/60 text-[#e9edef]'
                                      : 'bg-transparent border-transparent text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
                                  }`}
                                  onClick={() => {
                                    const current = campAccounts();
                                    if (current.includes(acc.account_id)) {
                                      if (current.length > 1) {
                                        setCampAccounts(current.filter(id => id !== acc.account_id));
                                      } else {
                                        showToast('At least one sender account must be selected', 'info');
                                      }
                                    } else {
                                      setCampAccounts([...current, acc.account_id]);
                                    }
                                  }}
                                >
                                  <div class="flex items-center gap-2.5 min-w-0">
                                    <div
                                      class={`w-6 h-6 rounded-full border flex items-center justify-center text-[10.5px] font-bold shrink-0 transition-colors ${
                                        isSelected()
                                          ? 'bg-[#00a884] border-[#00a884] text-white'
                                          : 'bg-[#202c33] border-[#2a3942] text-[#8696a0]'
                                      }`}
                                    >
                                      {acc.account_id.charAt(0).toUpperCase()}
                                    </div>
                                    <div class="min-w-0">
                                      <span
                                        class={`font-semibold text-xs block truncate leading-tight ${
                                          isSelected() ? 'text-[#e9edef]' : 'text-[#8696a0]'
                                        }`}
                                      >
                                        {acc.account_id}
                                      </span>
                                      <span class="text-[10px] font-mono block mt-0.5 text-[#8696a0] truncate">
                                        {acc.phone_number ? `+${acc.phone_number}` : status()}
                                      </span>
                                    </div>
                                  </div>

                                  <div class="flex items-center gap-2 shrink-0">
                                    <span
                                      class={`w-2 h-2 rounded-full ${
                                        isOnline() ? 'bg-[#00a884]' : 'bg-[#f15c6d]'
                                      }`}
                                      title={isOnline() ? 'Connected' : 'Disconnected'}
                                    />
                                    <div
                                      class={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${
                                        isSelected()
                                          ? 'bg-[#00a884] border-[#00a884] text-white shadow-xs'
                                          : 'border-[#2a3942] bg-[#111b21]'
                                      }`}
                                    >
                                      <Show when={isSelected()}>
                                        <Check size={11} stroke-width={3} />
                                      </Show>
                                    </div>
                                  </div>
                                </div>
                              );
                            }}
                          </For>
                        </div>
                      </div>
                    </Show>

                    {/* Parallel Speed Callout below Dropdown */}
                    <div class="p-2.5 mt-2 rounded-xl bg-[#111b21] border border-[#2a3942] flex items-start gap-2.5 text-xs">
                      <div class="w-5 h-5 rounded-md bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] flex items-center justify-center shrink-0 mt-0.5">
                        <Zap size={11} />
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between text-xs">
                          <strong class="text-[#e9edef] font-semibold text-[11.5px]">
                            {campAccounts().length} Account{campAccounts().length > 1 ? 's' : ''} in Multi-Sender Pool
                          </strong>
                          <span class="text-[10px] font-mono font-bold text-[#00a884] bg-[#00a884]/15 px-2 py-0.5 rounded-full border border-[#00a884]/25">
                            ~{campAccounts().length * 90} msgs/hr ({campAccounts().length}x Parallel Speed)
                          </span>
                        </div>
                        <p class="text-[10.5px] text-[#8696a0] mt-0.5 leading-relaxed">
                          Parallel multi-worker pipeline dispatches messages simultaneously across the selected accounts in the dropdown.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* 3. Template Body with Quick Tags, Emoticons & Formatting */}
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0]">
                        Message Template Body
                      </label>
                      {/* Segmented Switch: Editor vs Live Preview Tabs */}
                      <div class="relative inline-flex items-center w-52 p-1 bg-[#0b141a] border border-[#222d34] rounded-xl text-xs select-none shadow-inner">
                        {/* Smooth sliding active background pill */}
                        <div
                          class="absolute top-1 bottom-1 rounded-lg transition-all duration-200 ease-out pointer-events-none"
                          style={{
                            left: campTab() === 'editor' ? '4px' : 'calc(50%)',
                            width: 'calc(50% - 4px)',
                            background: '#1f2c34',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            'box-shadow': '0 2px 8px rgba(0,0,0,0.5)'
                          }}
                        />
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', outline: 'none', 'box-shadow': 'none' }}
                          class={`relative z-10 flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                            campTab() === 'editor'
                              ? 'text-[#00a884] font-bold'
                              : 'text-[#8696a0] hover:text-[#e9edef] font-medium'
                          }`}
                          onClick={() => setCampTab('editor')}
                        >
                          <Type size={13} class={campTab() === 'editor' ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                          <span>Editor</span>
                        </button>
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', outline: 'none', 'box-shadow': 'none' }}
                          class={`relative z-10 flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                            campTab() === 'preview'
                              ? 'text-[#00a884] font-bold'
                              : 'text-[#8696a0] hover:text-[#e9edef] font-medium'
                          }`}
                          onClick={() => setCampTab('preview')}
                        >
                          <Eye size={13} class={campTab() === 'preview' ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                          <span>Preview</span>
                        </button>
                      </div>
                    </div>

                    {/* Hidden Inputs for Campaign Files */}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      class="hidden"
                      ref={campFileInputMediaRef}
                      onChange={async e => {
                        const files = Array.from(e.currentTarget.files || []);
                        for (const file of files) {
                          const att = await processFileToAttachment(file, 'media');
                          if (att) {
                            setCampAttachmentsList(prev => [...prev, att]);
                          }
                        }
                        e.currentTarget.value = '';
                      }}
                    />
                    <input
                      type="file"
                      accept="*/*"
                      multiple
                      class="hidden"
                      ref={campFileInputDocRef}
                      onChange={async e => {
                        const files = Array.from(e.currentTarget.files || []);
                        for (const file of files) {
                          const att = await processFileToAttachment(file, 'document');
                          if (att) {
                            setCampAttachmentsList(prev => [...prev, att]);
                          }
                        }
                        e.currentTarget.value = '';
                      }}
                    />

                    {/* 1. EDITOR TAB VIEW */}
                    <Show when={campTab() === 'editor'}>
                      {/* Attached Files List if any */}
                      <Show when={campAttachmentsList().length > 0}>
                        <div class="mb-3 p-3 bg-[#141f26] border border-[#2a3942] rounded-xl space-y-2.5 animate-in fade-in duration-150">
                          <div class="flex items-center justify-between text-xs pb-2 border-b border-[#222d34] flex-wrap gap-2">
                            <span class="font-bold text-[#e9edef] flex items-center gap-2 text-xs">
                              <Paperclip size={14} class="text-[#00a884]" />
                              <span>Attached Files</span>
                              <span class="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/35">
                                {campAttachmentsList().length}
                              </span>
                            </span>
                            <div class="flex items-center gap-1.5">
                              <button
                                type="button"
                                class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/35 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                                onClick={() => campFileInputMediaRef?.click()}
                                title="Attach photos and videos to send as inline media"
                              >
                                <Camera size={12} class="text-[#00a884]" />
                                <span>+ Media</span>
                              </button>
                              <button
                                type="button"
                                class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#53bdeb]/15 hover:bg-[#53bdeb]/25 text-[#53bdeb] border border-[#53bdeb]/35 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                                onClick={() => campFileInputDocRef?.click()}
                                title="Attach any document file (PDF, docx, etc.)"
                              >
                                <Paperclip size={12} class="text-[#53bdeb]" />
                                <span>+ Attachment</span>
                              </button>
                              <button
                                type="button"
                                class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#202c33] hover:bg-[#ef4444]/15 border border-[#2a3942] hover:border-[#ef4444]/40 text-[#8696a0] hover:text-[#ef4444] flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                                onClick={() => setCampAttachmentsList([])}
                                title="Remove all attached files"
                              >
                                <Trash2 size={12} />
                                <span>Clear All</span>
                              </button>
                            </div>
                          </div>

                          <div class="space-y-2 max-h-52 overflow-y-auto p-0.5 pr-1">
                            <For each={campAttachmentsList()}>
                              {(att, idx) => {
                                const isImg = () => att.mimeType.startsWith('image/');
                                const isVid = () => att.mimeType.startsWith('video/');
                                const isDocMode = () => att.sendAs === 'document';
                                return (
                                  <div class="p-2.5 px-3 bg-[#111b21] hover:bg-[#18262f] border border-[#2a3942] hover:border-[#00a884]/40 rounded-xl flex items-center justify-between gap-3 text-xs transition-all shadow-xs group">
                                    <div class="flex items-center gap-3 min-w-0 flex-1">
                                      {/* Media Thumbnail */}
                                      <div class="w-11 h-11 rounded-lg bg-[#202c33] border border-[#2a3942] overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                                        <Show
                                          when={att.thumbnailB64}
                                          fallback={
                                            <Show
                                              when={isVid()}
                                              fallback={
                                                <Show
                                                  when={isImg()}
                                                  fallback={<FileText size={18} class="text-[#53bdeb]" />}
                                                >
                                                  <ImageIcon size={18} class="text-[#00a884]" />
                                                </Show>
                                              }
                                            >
                                              <Video size={18} class="text-[#53bdeb]" />
                                            </Show>
                                          }
                                        >
                                          <div class="relative w-full h-full flex items-center justify-center">
                                            <img
                                              src={`data:image/jpeg;base64,${att.thumbnailB64}`}
                                              alt="Thumb"
                                              class="w-full h-full object-cover"
                                            />
                                            <Show when={isVid()}>
                                              <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                <Play size={11} fill="currentColor" class="text-white ml-0.5" />
                                              </div>
                                            </Show>
                                          </div>
                                        </Show>
                                      </div>

                                      {/* File Name & Delivery Details */}
                                      <div class="min-w-0 flex-1">
                                        <strong class="text-xs font-semibold text-[#e9edef] block truncate max-w-[200px] sm:max-w-[300px] tracking-tight leading-snug" title={att.fileName}>
                                          {att.fileName}
                                        </strong>
                                        <div class="flex items-center gap-2 mt-1 flex-wrap">
                                          <span class="text-[11px] text-[#8696a0] font-mono">
                                            {(att.fileSize / 1024).toFixed(1)} KB
                                          </span>
                                          <span class="text-[#2a3942]">&bull;</span>
                                          {/* Delivery Mode Toggle Pill */}
                                          <button
                                            type="button"
                                            class={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border ${
                                              isDocMode()
                                                ? 'bg-[#53bdeb]/15 text-[#53bdeb] border-[#53bdeb]/40 hover:bg-[#53bdeb]/30'
                                                : 'bg-[#00a884]/15 text-[#00a884] border-[#00a884]/40 hover:bg-[#00a884]/30'
                                            }`}
                                            title={
                                              isDocMode()
                                                ? 'Sending as Document (preserves original quality, up to 100MB). Click to switch to Media.'
                                                : 'Sending as Media (WhatsApp preview, max 16MB). Click to switch to Document.'
                                            }
                                            onClick={() => {
                                              setCampAttachmentsList(prev =>
                                                prev.map((item, i) =>
                                                  i === idx()
                                                    ? { ...item, sendAs: item.sendAs === 'media' ? 'document' : 'media' }
                                                    : item
                                                )
                                              );
                                            }}
                                          >
                                            <Show when={isDocMode()} fallback={<Video size={10} />}>
                                              <FileText size={10} />
                                            </Show>
                                            <span>{isDocMode() ? 'Document' : 'Media'}</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Actions: Edit Photo, Cut/Trim, Remove */}
                                    <div class="flex items-center gap-2 shrink-0">
                                      <Show when={isImg()}>
                                        <button
                                          type="button"
                                          class="h-7 px-2.5 rounded-lg bg-[#202c33] hover:bg-[#00a884]/20 border border-[#2a3942] hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer active:scale-95"
                                          title="Open WhatsApp Photo Studio (Crop, Doodle, Text, Filters)"
                                          onClick={() => {
                                            setActiveModal({
                                              type: 'edit_photo',
                                              fileName: att.fileName,
                                              imageUrl: att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : (att.blobUrl || ''),
                                              returnToCreateCampaign: true,
                                              onSave: async (editedDataUrl: string, passedThumbB64?: string) => {
                                                const base64 = editedDataUrl.split(',')[1];
                                                let thumbB64 = passedThumbB64;
                                                if (!thumbB64) {
                                                  try {
                                                    const canvas = document.createElement('canvas');
                                                    canvas.width = 120;
                                                    canvas.height = 120;
                                                    const img = document.createElement('img');
                                                    img.src = editedDataUrl;
                                                    await new Promise(r => { img.onload = r; setTimeout(r, 500); });
                                                    const ctx = canvas.getContext('2d');
                                                    ctx?.drawImage(img, 0, 0, 120, 120);
                                                    thumbB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
                                                  } catch {}
                                                }
                                                setCampAttachmentsList(prev =>
                                                  prev.map((item, i) =>
                                                    i === idx()
                                                      ? {
                                                          ...item,
                                                          fileDataB64: base64,
                                                          blobUrl: editedDataUrl,
                                                          mimeType: 'image/jpeg',
                                                          thumbnailB64: thumbB64 || item.thumbnailB64,
                                                          fileSize: Math.round((base64.length * 3) / 4)
                                                        }
                                                      : item
                                                  )
                                                );
                                                showToast('Photo updated from Photo Studio!', 'success');
                                                setActiveModal({
                                                  type: 'create_campaign',
                                                  preserveState: true
                                                });
                                              }
                                            });
                                          }}
                                        >
                                          <Crop size={12} />
                                          <span>Edit Photo</span>
                                        </button>
                                      </Show>
                                      <Show when={isVid()}>
                                        <button
                                          type="button"
                                          class="h-7 px-2.5 rounded-lg bg-[#202c33] hover:bg-[#00a884]/20 border border-[#2a3942] hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer active:scale-95"
                                          title="Open Video Trimmer"
                                          onClick={() => {
                                            setActiveModal({
                                              type: 'cut_video',
                                              fileName: att.fileName,
                                              videoUrl: att.blobUrl || (att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : ''),
                                              fileSize: att.fileSize,
                                              returnToCreateCampaign: true,
                                              onTrim: async (params) => {
                                                const controller = new AbortController();
                                                const timeoutId = setTimeout(() => controller.abort(), 65000);
                                                try {
                                                  const res = await fetch('/api/post/trim-video', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    signal: controller.signal,
                                                    body: JSON.stringify({
                                                      file_name: att.fileName,
                                                      file_data: att.fileDataB64,
                                                      start_time: params.startTime,
                                                      end_time: params.endTime,
                                                      mute: params.mute,
                                                      preserve_hd: params.preserveHd
                                                    })
                                                  });
                                                  clearTimeout(timeoutId);
                                                  const resData = await res.json();
                                                  if (resData.success && resData.file_data) {
                                                    let newBlobUrl = att.blobUrl;
                                                    try {
                                                      const byteChars = atob(resData.file_data);
                                                      const byteNums = new Array(byteChars.length);
                                                      for (let i = 0; i < byteChars.length; i++) {
                                                        byteNums[i] = byteChars.charCodeAt(i);
                                                      }
                                                      const byteArray = new Uint8Array(byteNums);
                                                      const blob = new Blob([byteArray], { type: 'video/mp4' });
                                                      newBlobUrl = URL.createObjectURL(blob);
                                                    } catch {}
                                                    setCampAttachmentsList(prev =>
                                                      prev.map((item, i) =>
                                                        i === idx()
                                                          ? {
                                                              ...item,
                                                              fileDataB64: resData.file_data,
                                                              fileSize: resData.file_size || Math.round((resData.file_data.length * 3) / 4),
                                                              thumbnailB64: resData.thumbnail_data || item.thumbnailB64,
                                                              blobUrl: newBlobUrl,
                                                              mimeType: 'video/mp4'
                                                            }
                                                          : item
                                                      )
                                                    );
                                                    showToast('Video trimmed successfully!', 'success');
                                                    setActiveModal({
                                                      type: 'create_campaign',
                                                      preserveState: true
                                                    });
                                                  } else {
                                                    showToast(resData.error || 'Failed to trim video', 'error');
                                                  }
                                                } catch (e: any) {
                                                  clearTimeout(timeoutId);
                                                  showToast(`Video trim failed: ${e?.message || e}`, 'error');
                                                }
                                              }
                                            });
                                          }}
                                        >
                                          <Scissors size={12} />
                                          <span>Cut / Trim</span>
                                        </button>
                                      </Show>
                                      <button
                                        type="button"
                                        class="w-7 h-7 rounded-lg bg-[#202c33] hover:bg-[#ef4444]/20 border border-[#2a3942] hover:border-[#ef4444]/40 text-[#8696a0] hover:text-[#ef4444] flex items-center justify-center p-0 transition-colors cursor-pointer"
                                        title={`Remove ${att.fileName}`}
                                        onClick={() => {
                                          setCampAttachmentsList(prev => prev.filter((_, i) => i !== idx()));
                                        }}
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </div>
                      </Show>

                      <div class="relative w-full">
                        <textarea
                          id="createCampTemplateTextarea"
                          class="w-full bg-[#111b21] border border-[#2a3942] focus:border-[#00a884] rounded-xl p-3.5 pb-11 text-sm text-[#e9edef] h-[220px] min-h-[220px] resize-y font-sans leading-relaxed transition-colors"
                          value={campTemplate()}
                          onInput={e => setCampTemplate(e.currentTarget.value)}
                          placeholder="Hello {name}, this is an automated announcement."
                        />

                        {/* Floating Bottom-Left Dynamic Personalization Tags */}
                        <div class="absolute left-2.5 bottom-2.5 flex items-center gap-1.5 z-20">
                          <button
                            type="button"
                            style={{ border: '1px solid #2a3942', background: '#182229' }}
                            class="h-7 px-2.5 rounded-lg text-xs font-mono font-semibold text-[#00a884] hover:bg-[#202c33] hover:border-[#00a884] flex items-center gap-1 transition-colors cursor-pointer active:scale-95 shadow-xs"
                            onClick={() => insertToken('createCampTemplateTextarea', campTemplate, setCampTemplate, ' {name}')}
                            title="Insert {name} personalization tag"
                          >
                            +{'{name}'}
                          </button>
                          <button
                            type="button"
                            style={{ border: '1px solid #2a3942', background: '#182229' }}
                            class="h-7 px-2.5 rounded-lg text-xs font-mono font-semibold text-[#00a884] hover:bg-[#202c33] hover:border-[#00a884] flex items-center gap-1 transition-colors cursor-pointer active:scale-95 shadow-xs"
                            onClick={() => insertToken('createCampTemplateTextarea', campTemplate, setCampTemplate, ' {phone}')}
                            title="Insert {phone} personalization tag"
                          >
                            +{'{phone}'}
                          </button>
                        </div>

                        {/* Floating Bottom-Right Tools (Media, Document, Emoji & Formatting) */}
                        <div class="absolute right-2.5 bottom-2.5 flex items-center gap-1.5 z-20">
                          {/* 1. Floating Media Picker Button */}
                          <button
                            type="button"
                            style={{
                              border: campMediaCount() > 0 ? '1px solid #00a884' : '1px solid #2a3942',
                              background: campMediaCount() > 0 ? '#202c33' : '#111b21'
                            }}
                            class={`w-7 h-7 rounded-lg flex items-center justify-center p-0 transition-colors cursor-pointer relative ${
                              campMediaCount() > 0 ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#00a884] hover:border-[#00a884]'
                            }`}
                            title="Attach Photos or Videos (Inline Media)"
                            onClick={() => campFileInputMediaRef?.click()}
                          >
                            <Camera size={14} class={campMediaCount() > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'} />
                            <Show when={campMediaCount() > 0}>
                              <span class="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 bg-[#00a884] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#111b21]">
                                {campMediaCount()}
                              </span>
                            </Show>
                          </button>

                          {/* 2. Floating Document Picker Button */}
                          <button
                            type="button"
                            style={{
                              border: campDocCount() > 0 ? '1px solid #53bdeb' : '1px solid #2a3942',
                              background: campDocCount() > 0 ? '#202c33' : '#111b21'
                            }}
                            class={`w-7 h-7 rounded-lg flex items-center justify-center p-0 transition-colors cursor-pointer relative ${
                              campDocCount() > 0 ? 'text-[#53bdeb]' : 'text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb]'
                            }`}
                            title="Attach Raw Documents or Files"
                            onClick={() => campFileInputDocRef?.click()}
                          >
                            <Paperclip size={14} class={campDocCount() > 0 ? 'text-[#53bdeb]' : 'text-[#8696a0]'} />
                            <Show when={campDocCount() > 0}>
                              <span class="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 bg-[#53bdeb] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center ring-2 ring-[#111b21]">
                                {campDocCount()}
                              </span>
                            </Show>
                          </button>

                          <div class="w-[1px] h-3.5 bg-[#2a3942] mx-0.5" />

                          {/* 3. Emoji Popover */}
                          <div class="relative" ref={campEmojiWrapRef}>
                            <button
                              type="button"
                              style={{ border: '1px solid #2a3942', background: campEmojiOpen() ? '#202c33' : '#111b21' }}
                              class="w-7 h-7 rounded-lg text-[#8696a0] hover:text-[#ffbc38] hover:border-[#ffbc38] flex items-center justify-center p-0 transition-colors cursor-pointer"
                              title="Insert Emoji"
                              onClick={() => {
                                setCampEmojiOpen(!campEmojiOpen());
                                setCampFormatOpen(false);
                              }}
                            >
                              <Smile size={14} class="text-[#ffbc38]" />
                            </button>

                            <Show when={campEmojiOpen()}>
                              <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2.5 z-40 w-64 animate-in fade-in zoom-in-95 duration-100">
                                <div class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0] mb-2 pb-1 border-b border-[#222d34]">
                                  Quick Emojis
                                </div>
                                <div class="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto p-0.5">
                                  <For each={EMOJIS}>
                                    {em => (
                                      <button
                                        type="button"
                                        style={{ border: 'none', background: 'transparent' }}
                                        class="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-[#202c33] cursor-pointer transition-transform hover:scale-125 p-0"
                                        onClick={() => {
                                          insertToken('createCampTemplateTextarea', campTemplate, setCampTemplate, em);
                                          setCampEmojiOpen(false);
                                        }}
                                      >
                                        {em}
                                      </button>
                                    )}
                                  </For>
                                </div>
                              </div>
                            </Show>
                          </div>

                          {/* 4. Formatting Shortcuts Popover */}
                          <div class="relative" ref={campFormatWrapRef}>
                            <button
                              type="button"
                              style={{ border: '1px solid #2a3942', background: campFormatOpen() ? '#202c33' : '#111b21' }}
                              class="w-7 h-7 rounded-lg text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb] flex items-center justify-center p-0 transition-colors cursor-pointer"
                              title="WhatsApp Formatting"
                              onClick={() => {
                                setCampFormatOpen(!campFormatOpen());
                                setCampEmojiOpen(false);
                              }}
                            >
                              <HelpCircle size={14} class="text-[#53bdeb]" />
                            </button>

                            <Show when={campFormatOpen()}>
                              <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2 z-40 w-64 animate-in fade-in zoom-in-95 duration-100 space-y-1">
                                <div class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0] mb-1.5 px-1 pb-1 border-b border-[#222d34]">
                                  WhatsApp Formatting
                                </div>
                                <div
                                  class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                  onClick={() => {
                                    wrapText('createCampTemplateTextarea', campTemplate, setCampTemplate, '*');
                                    setCampFormatOpen(false);
                                  }}
                                >
                                  <code class="text-[#00a884] font-mono font-semibold">*text*</code>
                                  <strong class="text-[#e9edef]">Bold</strong>
                                </div>
                                <div
                                  class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                  onClick={() => {
                                    wrapText('createCampTemplateTextarea', campTemplate, setCampTemplate, '_');
                                    setCampFormatOpen(false);
                                  }}
                                >
                                  <code class="text-[#00a884] font-mono font-semibold">_text_</code>
                                  <em class="text-[#e9edef]">Italic</em>
                                </div>
                                <div
                                  class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                  onClick={() => {
                                    wrapText('createCampTemplateTextarea', campTemplate, setCampTemplate, '~');
                                    setCampFormatOpen(false);
                                  }}
                                >
                                  <code class="text-[#00a884] font-mono font-semibold">~text~</code>
                                  <span class="line-through text-[#e9edef]">Strikethrough</span>
                                </div>
                                <div
                                  class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                                  onClick={() => {
                                    wrapText('createCampTemplateTextarea', campTemplate, setCampTemplate, '```');
                                    setCampFormatOpen(false);
                                  }}
                                >
                                  <code class="text-[#00a884] font-mono font-semibold">```text```</code>
                                  <span class="font-mono text-[#e9edef] text-[11px]">Monospace</span>
                                </div>
                              </div>
                            </Show>
                          </div>
                        </div>
                      </div>

                      {/* Metadata Word & Character Count Bar */}
                      <div class="flex items-center text-[11px] text-[#8696a0] mt-1.5 px-1 font-mono">
                        <span>
                          {campTemplate().length} characters • {campTemplate().trim() ? campTemplate().trim().split(/\s+/).length : 0} words
                        </span>
                      </div>
                    </Show>

                    {/* 2. AUTHENTIC WHATSAPP CHAT PREVIEW TAB */}
                    <Show when={campTab() === 'preview'}>
                      <div class="rounded-xl border border-[#2a3942] bg-[#0b141a] overflow-hidden flex flex-col min-h-[240px] max-h-[380px] relative p-3">
                        <div class="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                          {/* Centered Date Badge */}
                          <div class="self-center my-1 px-3 py-0.5 rounded-md bg-[#182229]/90 border border-[#2a3942] text-[10.5px] text-[#8696a0] font-medium shadow-xs">
                            TODAY
                          </div>

                          {/* WhatsApp Outgoing Speech Bubble */}
                          <div class="max-w-[88%] self-end mt-auto mb-1 w-full flex flex-col items-end">
                            <Show
                              when={campAttachmentsList().length > 0 || campTemplate().trim().length > 0}
                              fallback={
                                <div class="bg-[#182229] border border-[#2a3942] text-[#8696a0] p-4 rounded-xl text-xs text-center italic w-full">
                                  No template text or attachments yet. Switch to Editor to compose.
                                </div>
                              }
                            >
                              <div class="bg-[#005c4b] text-[#e9edef] p-2.5 px-3 rounded-2xl rounded-tr-xs shadow-md text-xs leading-relaxed break-words space-y-1.5 max-w-full">
                                {/* Photos Grid in Chat Bubble */}
                                <Show when={campAttachmentsList().some(a => a.sendAs !== 'document' && a.mimeType.startsWith('image/'))}>
                                  <div
                                    class={`rounded-xl overflow-hidden mb-1 gap-1 bg-black/20 border border-black/10 ${
                                      campAttachmentsList().filter(a => a.sendAs !== 'document' && a.mimeType.startsWith('image/')).length === 1
                                        ? 'flex items-center justify-center max-h-52'
                                        : 'grid grid-cols-2 max-h-56'
                                    }`}
                                  >
                                    <For each={campAttachmentsList().filter(a => a.sendAs !== 'document' && a.mimeType.startsWith('image/'))}>
                                      {att => (
                                        <div class="relative overflow-hidden aspect-square flex items-center justify-center bg-black/20">
                                          <img
                                            src={att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : (att.blobUrl || '')}
                                            alt="Photo Preview"
                                            class="w-full h-full object-cover"
                                          />
                                        </div>
                                      )}
                                    </For>
                                  </div>
                                </Show>

                                {/* Playable Video Preview directly inside WhatsApp Bubble */}
                                <For each={campAttachmentsList().filter(a => a.sendAs !== 'document' && a.mimeType.startsWith('video/'))}>
                                  {att => (
                                    <div class="relative rounded-xl overflow-hidden max-h-52 bg-black flex items-center justify-center border border-black/20 mb-1 shadow-md">
                                      <video
                                        src={att.fileDataB64 ? `data:${att.mimeType};base64,${att.fileDataB64}` : (att.blobUrl || '')}
                                        poster={att.thumbnailB64 ? `data:image/jpeg;base64,${att.thumbnailB64}` : undefined}
                                        controls
                                        preload="metadata"
                                        playsinline
                                        class="w-full h-auto max-h-48 rounded-xl object-contain bg-black cursor-pointer"
                                      />
                                    </div>
                                  )}
                                </For>

                                {/* Document / Raw File Attachments */}
                                <For each={campAttachmentsList().filter(a => a.sendAs === 'document' || (!a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')))}>
                                  {att => (
                                    <div class="p-2 px-2.5 rounded-xl bg-[#182229]/90 border border-[#2a3942] flex items-center gap-2 mb-1">
                                      <div class="w-8 h-8 rounded-lg bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#53bdeb] shrink-0 font-bold uppercase text-[10px]">
                                        <FileText size={16} />
                                      </div>
                                      <div class="min-w-0 flex-1">
                                        <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                                          {att.fileName}
                                        </strong>
                                        <span class="text-[10px] text-[#8696a0] block mt-0.5 font-mono">
                                          {(att.fileSize / 1024).toFixed(1)} KB &bull; {att.fileName.split('.').pop()?.toUpperCase()}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </For>

                                {/* Formatted Template Text with {name} and {phone} interpolated and WhatsApp markdown */}
                                <Show when={campTemplate().trim().length > 0}>
                                  <div
                                    class="leading-relaxed m-0 text-xs break-words"
                                    innerHTML={formatWhatsAppText(campTemplate(), 'Budi', '+62 812-3456-7890')}
                                  />
                                </Show>

                                {/* Outgoing Message Timestamp & Double Blue Ticks */}
                                <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-white/60">
                                  <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  <CheckCheck size={14} class="text-[#53bdeb]" />
                                </div>
                              </div>
                            </Show>
                          </div>
                        </div>
                      </div>
                    </Show>
                  </div>

                  {/* 4. Anti-Ban Jitter Window */}
                  <div class="bg-[#111b21] border border-[#2a3942] p-3 rounded-xl space-y-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="text-xs font-semibold uppercase tracking-wider text-[#8696a0] flex items-center gap-1.5">
                        <Clock size={13} class="text-[#00a884]" /> Anti-Ban Pacing Jitter Window
                      </span>
                      <span class="text-[10.5px] font-mono text-[#8696a0]">
                        Avg: ~{((parseInt(campMinDelay()) || 20) + (parseInt(campMaxDelay()) || 45)) / 2}s / message
                      </span>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[11px] text-[#8696a0] mb-1">Min Delay (Seconds)</label>
                        <input
                          type="number"
                          min="5"
                          max="300"
                          class="w-full bg-[#182229] border border-[#2a3942] focus:border-[#00a884] rounded-lg px-3 py-1.5 text-xs text-[#00a884] font-mono font-bold"
                          value={campMinDelay()}
                          onInput={e => setCampMinDelay(e.currentTarget.value)}
                        />
                      </div>
                      <div>
                        <label class="block text-[11px] text-[#8696a0] mb-1">Max Delay (Seconds)</label>
                        <input
                          type="number"
                          min="10"
                          max="600"
                          class="w-full bg-[#182229] border border-[#2a3942] focus:border-[#00a884] rounded-lg px-3 py-1.5 text-xs text-[#00a884] font-mono font-bold"
                          value={campMaxDelay()}
                          onInput={e => setCampMaxDelay(e.currentTarget.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
                    <button class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer" onClick={handleClose}>
                      Cancel
                    </button>
                    <button
                      class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                      onClick={async () => {
                        const name = campName().trim();
                        if (!name) {
                          showToast('Campaign name cannot be empty', 'error');
                          return;
                        }
                        try {
                          const selectedAccs = campAccounts();
                          const accPayload = selectedAccs.length === 0
                            ? (accounts()[0]?.account_id || 'default')
                            : (selectedAccs.length === accounts().length ? 'all' : selectedAccs.join(', '));

                          const res = await fetch('/api/campaigns/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name,
                              template_body: campTemplate(),
                              account_id: accPayload,
                              accounts: selectedAccs,
                              files: campAttachmentsList().map(a => ({
                                file_name: a.fileName,
                                file_data: a.fileDataB64,
                                mime_type: a.mimeType,
                                send_as: a.sendAs,
                                thumbnail_data: a.thumbnailB64
                              })),
                              min_delay_secs: parseInt(campMinDelay()) || 20,
                              max_delay_secs: parseInt(campMaxDelay()) || 45
                            })
                          });
                          const data = await res.json();
                          if (data.id) {
                            showToast(`Campaign '${name}' created!`, 'success');
                            await fetchCampaigns();
                            switchView('campaign-detail', data.id);
                            setActiveModal(null);
                          } else {
                            showToast(data.error || 'Failed to create campaign', 'error');
                          }
                        } catch (e: unknown) {
                          const msg = e instanceof Error ? e.message : String(e);
                          showToast(`Error creating campaign: ${msg}`, 'error');
                        }
                      }}
                    >
                      <Plus size={14} />
                      <span>Create</span>
                    </button>
                  </div>
                </div>
              </Show>

              {/* 7. RENAME */}
              <Show when={renameData()}>
                {m => (
                  <div class="space-y-4">
                    <div>
                      <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
                        New Name / Identifier
                      </label>
                      <input
                        type="text"
                        class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
                        value={renameInput()}
                        onInput={e => setRenameInput(e.currentTarget.value)}
                      />
                    </div>
                    <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
                      <button class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer" onClick={handleClose}>
                        Cancel
                      </button>
                      <button
                        class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
                        onClick={() => {
                          const val = renameInput().trim();
                          if (!val) return;
                          if (m().type === 'rename_campaign') {
                            renameCampaign(m().campaignId, val);
                          } else {
                            renameAccount(m().accountId, val);
                          }
                        }}
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                )}
              </Show>

              {/* 8. CONFIRM ACTION - Improved with compact width, yellow alert badge, and full message */}
              <Show when={confirmData()}>
                {m => (
                  <div class="space-y-4">
                    <div class="flex items-start gap-4 p-1">
                      <div class="w-10 h-10 rounded-xl bg-[#ffbc38]/15 border border-[#ffbc38]/30 text-[#ffbc38] flex items-center justify-center shrink-0">
                        <AlertTriangle size={20} />
                      </div>
                      <div class="min-w-0 flex-1">
                        <h4 class="text-sm font-semibold text-[#e9edef] mb-1.5">{m().title}</h4>
                        <p class="text-xs text-[#8696a0] leading-relaxed">{m().message}</p>
                      </div>
                    </div>
                    <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
                      <button class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer" onClick={handleClose}>
                        Cancel
                      </button>
                      <button
                        class="btn-danger h-8 px-3.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                        onClick={async () => {
                          await m().onConfirm();
                          setActiveModal(null);
                        }}
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
              </Show>

              {/* 9. VIDEO FRAME CUTTER & TRIM STUDIO */}
              <Show when={cutVideoData()}>
                {data => {
                  const selectedDuration = () => Math.max(0, endTime() - startTime());
                  const estSize = () => {
                    const sel = selectedDuration();
                    return Math.min(15 * 1024 * 1024, Math.round(sel * 220 * 1024));
                  };
                  const isUnder16MB = () => estSize() <= 16 * 1024 * 1024;
                  const isDurationCompliant = () => selectedDuration() <= 90;

                  return (
                    <div class="space-y-4">
                      {/* Top Info Banner explaining WhatsApp video limits */}
                      <div class="bg-[#111b21] border border-[#2a3942] rounded-xl p-3 flex items-start gap-3 text-xs">
                        <div class="w-8 h-8 rounded-lg bg-[#00a884]/15 border border-[#00a884]/30 text-[#00a884] flex items-center justify-center shrink-0">
                          <Film size={16} />
                        </div>
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center justify-between gap-2">
                            <strong class="text-[#e9edef] font-semibold truncate block">
                              {data().fileName}
                            </strong>
                            <span class="text-[11px] text-[#8696a0] font-mono shrink-0">
                              Original: {formatFileSize(data().fileSize)}
                            </span>
                          </div>
                          <p class="text-[#8696a0] text-[11px] mt-0.5 leading-relaxed">
                            Trim your video to any duration. Wasche automatically compresses and re-encodes the video with H.264 CRF rate control to stay compliant with WhatsApp.
                          </p>
                        </div>
                      </div>

                      {/* Video Player & Frame Display */}
                      <div class="relative bg-black rounded-xl overflow-hidden border border-[#2a3942] flex flex-col items-center justify-center min-h-[220px] max-h-[320px]">
                        <video
                          ref={setVideoRef}
                          src={data().videoUrl}
                          class="max-h-[300px] w-auto max-w-full object-contain mx-auto"
                          crossOrigin="anonymous"
                          onLoadedMetadata={onVideoLoaded}
                          onTimeUpdate={e => {
                            const v = e.currentTarget as HTMLVideoElement;
                            const cur = v.currentTime;
                            setVideoCurrentTime(cur);
                            if (videoPlaying() && cur >= endTime()) {
                              v.currentTime = startTime();
                              setVideoCurrentTime(startTime());
                            }
                          }}
                          onPlay={() => setVideoPlaying(true)}
                          onPause={() => setVideoPlaying(false)}
                          onEnded={() => {
                            const v = videoRef();
                            if (v) {
                              v.currentTime = startTime();
                              setVideoCurrentTime(startTime());
                            }
                            setVideoPlaying(false);
                          }}
                        />
                        {/* Overlay Floating Controls */}
                        <div class="absolute bottom-3 left-3 right-3 bg-[#111b21]/90 backdrop-blur-md border border-[#2a3942] rounded-lg px-3 py-2 flex items-center justify-between gap-3 text-xs shadow-lg">
                          <div class="flex items-center gap-2">
                            <button
                              type="button"
                              class="w-7 h-7 rounded-md bg-[#00a884] text-white flex items-center justify-center cursor-pointer hover:bg-[#02906f] transition-colors"
                              onClick={togglePlay}
                              title={videoPlaying() ? 'Pause' : 'Play'}
                            >
                              <Show when={videoPlaying()} fallback={<Play size={13} fill="currentColor" class="ml-0.5" />}>
                                <Pause size={13} fill="currentColor" />
                              </Show>
                            </button>

                            {/* Audio Mute / Unmute Control */}
                            <button
                              type="button"
                              class={`w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                                videoMuted()
                                  ? 'bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444]'
                                  : 'bg-[#202c33] border border-[#2a3942] text-[#8696a0] hover:text-[#e9edef]'
                              }`}
                              onClick={() => {
                                const v = videoRef();
                                if (!v) return;
                                const next = !v.muted;
                                v.muted = next;
                                setVideoMuted(next);
                              }}
                              title={videoMuted() ? 'Unmute Audio' : 'Mute Audio'}
                            >
                              <Show when={videoMuted()} fallback={<Volume2 size={13} />}>
                                <VolumeX size={13} />
                              </Show>
                            </button>

                            <span class="font-mono text-[#e9edef] text-[11px]">
                              {formatTime(videoCurrentTime())} / {formatTime(videoDuration())}
                            </span>
                          </div>

                          {/* Quick Frame Capture Buttons on Live Player */}
                          <div class="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isCapturing()}
                              class="px-2 py-1 rounded bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] hover:text-[#00a884] border border-[#2a3942] text-[10.5px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Capture this exact video frame and attach it as a high-res photo"
                              onClick={() => handleCaptureFrame(true)}
                            >
                              <Camera size={12} />
                              <span>Extract Photo</span>
                            </button>
                            <button
                              type="button"
                              disabled={isCapturing()}
                              class="px-2 py-1 rounded bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] hover:text-[#53bdeb] border border-[#2a3942] text-[10.5px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Set current video frame as campaign video thumbnail preview"
                              onClick={() => handleCaptureFrame(false)}
                            >
                              <ImageIcon size={12} />
                              <span>Set Cover</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* WhatsApp Unified Video Scrubber & Filmstrip Trimmer */}
                      <div class="bg-[#111b21] border border-[#2a3942] rounded-xl p-3.5 space-y-2.5">
                        <div class="flex items-center justify-between text-xs flex-wrap gap-2">
                          <div class="flex items-center gap-2">
                            <span class="text-[#e9edef] font-semibold text-xs flex items-center gap-1.5">
                              <Film size={14} class="text-[#00a884]" />
                              <span>Trim Window</span>
                            </span>
                            <span class="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#00a884]/15 text-[#00a884] border border-[#00a884]/30">
                              {selectedDuration().toFixed(1)}s (of {formatTime(videoDuration())})
                            </span>
                            <span class="text-[10.5px] text-[#00a884] font-medium flex items-center gap-1">
                              <Check size={11} /> ~{formatFileSize(estSize())} (Auto-compressed)
                            </span>
                          </div>

                          {/* Quick Duration Presets */}
                          <div class="flex items-center gap-1">
                            <button
                              type="button"
                              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
                              onClick={() => { setStartTime(0); setEndTime(Math.min(15, videoDuration())); seekVideo(0); }}
                            >
                              15s
                            </button>
                            <button
                              type="button"
                              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
                              onClick={() => { setStartTime(0); setEndTime(Math.min(30, videoDuration())); seekVideo(0); }}
                            >
                              30s (Status)
                            </button>
                            <button
                              type="button"
                              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
                              onClick={() => { setStartTime(0); setEndTime(Math.min(60, videoDuration())); seekVideo(0); }}
                            >
                              60s
                            </button>
                            <button
                              type="button"
                              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
                              onClick={() => { setStartTime(0); setEndTime(videoDuration()); seekVideo(0); }}
                            >
                              Full
                            </button>
                            <button
                              type="button"
                              class={`px-2 py-0.5 rounded text-[10.5px] font-bold border transition-all flex items-center gap-1 cursor-pointer select-none ${
                                videoPreserveHd()
                                  ? 'bg-[#00a884]/20 border-[#00a884] text-[#00a884] shadow-xs'
                                  : 'bg-[#202c33] border-[#2a3942] text-[#8696a0] hover:text-[#e9edef]'
                              }`}
                              onClick={() => {
                                const next = !videoPreserveHd();
                                setVideoPreserveHd(next);
                                showToast(next ? 'HD Quality Enabled (Native Resolution)' : 'Standard Quality (Compressed)', 'info');
                              }}
                              title={videoPreserveHd() ? 'Preserve Full HD Video Resolution (Click to toggle standard)' : 'Standard Video Quality (Click to toggle HD)'}
                            >
                              <span>HD</span>
                              <Show when={videoPreserveHd()}>
                                <Check size={10} stroke-width={3} />
                              </Show>
                            </button>
                          </div>
                        </div>

                        {/* Interactive WhatsApp Filmstrip Scrubber Track with Draggable Handles */}
                        <div
                          class="relative h-16 bg-[#0b141a] rounded-xl border border-[#2a3942] overflow-hidden select-none cursor-pointer"
                          onClick={e => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const pct = Math.max(0, Math.min(1, clickX / rect.width));
                            const targetTime = pct * videoDuration();
                            seekVideo(targetTime);
                          }}
                        >
                          {/* Filmstrip Frame Strip */}
                          <div class="absolute inset-0 flex pointer-events-none">
                            <For each={filmstripFrames()}>
                              {frame => (
                                 <div class="flex-1 h-full overflow-hidden border-r border-[#2a3942]/30 last:border-r-0">
                                  <img src={frame} alt="Frame" class="w-full h-full object-cover opacity-80" />
                                </div>
                              )}
                            </For>
                          </div>

                          {/* Left Dimmed Area */}
                          <div
                            class="absolute top-0 bottom-0 left-0 bg-black/75 pointer-events-none transition-all duration-75"
                            style={{ width: `${(startTime() / (videoDuration() || 1)) * 100}%` }}
                          />

                          {/* Right Dimmed Area */}
                          <div
                            class="absolute top-0 bottom-0 right-0 bg-black/75 pointer-events-none transition-all duration-75"
                            style={{ width: `${100 - (endTime() / (videoDuration() || 1)) * 100}%` }}
                          />

                          {/* Active Glowing Bounding Box - Draggable center to slide the whole window */}
                          <div
                            class="absolute top-0 bottom-0 border-y-2 border-[#00a884] shadow-[0_0_12px_rgba(0,168,132,0.45)] cursor-grab active:cursor-grabbing z-15 group"
                            style={{
                              left: `${(startTime() / (videoDuration() || 1)) * 100}%`,
                              width: `${((endTime() - startTime()) / (videoDuration() || 1)) * 100}%`
                            }}
                            onPointerDown={e => {
                              e.stopPropagation();
                              const target = e.currentTarget as HTMLElement;
                              try { target.setPointerCapture(e.pointerId); } catch {}
                              const parent = target.parentElement;
                              if (!parent) return;
                              const rect = parent.getBoundingClientRect();
                              const startClientX = e.clientX;
                              const dur = videoDuration() || 1;
                              const windowDuration = endTime() - startTime();
                              const initialStart = startTime();

                              const onMove = (ev: PointerEvent) => {
                                const deltaPx = ev.clientX - startClientX;
                                const deltaSec = (deltaPx / rect.width) * dur;
                                const maxStart = dur - windowDuration;
                                const newStart = Math.max(0, Math.min(maxStart, initialStart + deltaSec));
                                const newEnd = newStart + windowDuration;
                                setStartTime(newStart);
                                setEndTime(newEnd);
                                seekVideo(newStart);
                              };

                              const onUp = (ev: PointerEvent) => {
                                try { target.releasePointerCapture(ev.pointerId); } catch {}
                                window.removeEventListener('pointermove', onMove);
                                window.removeEventListener('pointerup', onUp);
                              };
                              window.addEventListener('pointermove', onMove);
                              window.addEventListener('pointerup', onUp);
                            }}
                            title="Click & Drag to slide the entire selection window"
                          >
                            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-75 transition-opacity pointer-events-none">
                              <span class="px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-[#00a884] font-mono font-bold tracking-wider">
                                Slide
                              </span>
                            </div>
                          </div>

                          {/* Left Drag Handle */}
                          <div
                            class="absolute top-0 bottom-0 w-4 bg-[#00a884] rounded-l-md flex items-center justify-center cursor-ew-resize z-20 shadow-md hover:bg-[#02906f] active:scale-110 transition-transform"
                            style={{
                              left: `calc(${(startTime() / (videoDuration() || 1)) * 100}% - 4px)`
                            }}
                            onPointerDown={e => {
                              e.stopPropagation();
                              const target = e.currentTarget;
                              target.setPointerCapture(e.pointerId);
                              const parent = target.parentElement;
                              if (!parent) return;
                              const rect = parent.getBoundingClientRect();
                              const onMove = (ev: PointerEvent) => {
                                const px = ev.clientX - rect.left;
                                const pct = Math.max(0, Math.min(1, px / rect.width));
                                const t = Math.min(pct * (videoDuration() || 60), endTime() - 0.5);
                                setStartTime(Math.max(0, t));
                                seekVideo(t);
                              };
                              const onUp = () => {
                                target.removeEventListener('pointermove', onMove as any);
                                target.removeEventListener('pointerup', onUp);
                              };
                              target.addEventListener('pointermove', onMove as any);
                              target.addEventListener('pointerup', onUp);
                            }}
                            title="Drag to trim start time"
                          >
                            <div class="w-0.5 h-6 bg-[#111b21] rounded-full" />
                          </div>

                          {/* Right Drag Handle */}
                          <div
                            class="absolute top-0 bottom-0 w-4 bg-[#00a884] rounded-r-md flex items-center justify-center cursor-ew-resize z-20 shadow-md hover:bg-[#02906f] active:scale-110 transition-transform"
                            style={{
                              left: `calc(${(endTime() / (videoDuration() || 1)) * 100}% - 12px)`
                            }}
                            onPointerDown={e => {
                              e.stopPropagation();
                              const target = e.currentTarget;
                              target.setPointerCapture(e.pointerId);
                              const parent = target.parentElement;
                              if (!parent) return;
                              const rect = parent.getBoundingClientRect();
                              const onMove = (ev: PointerEvent) => {
                                const px = ev.clientX - rect.left;
                                const pct = Math.max(0, Math.min(1, px / rect.width));
                                const t = Math.max(pct * (videoDuration() || 60), startTime() + 0.5);
                                setEndTime(Math.min(videoDuration() || 60, t));
                                seekVideo(t);
                              };
                              const onUp = () => {
                                target.removeEventListener('pointermove', onMove as any);
                                target.removeEventListener('pointerup', onUp);
                              };
                              target.addEventListener('pointermove', onMove as any);
                              target.addEventListener('pointerup', onUp);
                            }}
                            title="Drag to trim end time"
                          >
                            <div class="w-0.5 h-6 bg-[#111b21] rounded-full" />
                          </div>

                          {/* Current Scrubber Playhead Line */}
                          <div
                            class="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] pointer-events-none z-20"
                            style={{
                              left: `${(Math.max(startTime(), Math.min(endTime(), videoCurrentTime())) / (videoDuration() || 1)) * 100}%`
                            }}
                          />
                        </div>

                        <div class="flex items-center justify-between text-[11px] text-[#8696a0] font-mono px-0.5">
                          <span>Start: <strong class="text-[#00a884]">{formatTime(startTime())}</strong></span>
                          <span>End: <strong class="text-[#00a884]">{formatTime(endTime())}</strong></span>
                        </div>
                      </div>

                      {/* Footer Action Buttons */}
                      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-[#222d34]">
                        <button
                          type="button"
                          class="btn-cancel h-9 px-4 text-xs font-medium rounded-lg cursor-pointer"
                          onClick={handleClose}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                        disabled={isTrimming() || selectedDuration() <= 0}
                          class="h-9 px-4 text-xs font-semibold rounded-lg bg-[#00a884] hover:bg-[#02906f] text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                          onClick={handleTrimVideo}
                        >
                          <Show when={isTrimming()} fallback={<Scissors size={14} />}>
                            <RefreshCw size={14} class="animate-spin" />
                          </Show>
                          <span>{isTrimming() ? 'Trimming Video...' : 'Cut & Apply Video'}</span>
                        </button>
                      </div>
                    </div>
                  );
                }}
              </Show>

              {/* 10. WHATSAPP PHOTO STUDIO & CANVAS EDITOR */}
              <Show when={editPhotoData()}>
                {data => (
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
                            showToast(next ? 'HD Resolution Enabled (Original Quality)' : 'Standard Resolution (800px max)', 'info');
                          }}
                          title={photoPreserveHd() ? 'Preserve Full HD Photo Resolution (Click to toggle Standard)' : 'Standard Resolution (Click to toggle HD)'}
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
                            <For each={['#ffffff', '#25d366', '#ffd700', '#ff9800', '#ff3b30', '#00bcd4', '#9c27b0']}>
                              {color => (
                                <button
                                  type="button"
                                  class={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                                    brushColor() === color ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110'
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
                                cropRatio() === 'free' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                              }`}
                              onClick={() => snapCropRatio('free')}
                            >
                              Free
                            </button>
                            <button
                              type="button"
                              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                                cropRatio() === '1:1' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                              }`}
                              onClick={() => snapCropRatio('1:1')}
                            >
                              1:1 Square
                            </button>
                            <button
                              type="button"
                              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                                cropRatio() === '4:5' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                              }`}
                              onClick={() => snapCropRatio('4:5')}
                            >
                              4:5 Portrait
                            </button>
                            <button
                              type="button"
                              class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                                cropRatio() === '16:9' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
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
                            onInput={e => setTextCaption(e.currentTarget.value)}
                            onKeyDown={e => { if (e.key === 'Enter') stampText(); }}
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
                              photoFilter() === 'normal' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                            }`}
                            onClick={() => applyPhotoFilter('normal')}
                          >
                            Original
                          </button>
                          <button
                            type="button"
                            class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                              photoFilter() === 'vivid' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                            }`}
                            onClick={() => applyPhotoFilter('vivid')}
                          >
                            Vivid
                          </button>
                          <button
                            type="button"
                            class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                              photoFilter() === 'bw' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                            }`}
                            onClick={() => applyPhotoFilter('bw')}
                          >
                            B&W Mono
                          </button>
                          <button
                            type="button"
                            class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                              photoFilter() === 'warm' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
                            }`}
                            onClick={() => applyPhotoFilter('warm')}
                          >
                            Warm
                          </button>
                          <button
                            type="button"
                            class={`px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${
                              photoFilter() === 'cool' ? 'bg-[#00a884] text-white border-[#00a884]' : 'bg-[#202c33] text-[#8696a0] border-[#2a3942]'
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
                          ref={el => {
                            setPhotoCanvasRef(el);
                            if (currentLoadedImg) {
                              renderImageToCanvas(currentLoadedImg, el);
                            } else {
                              const data = editPhotoData();
                              if (data?.imageUrl) {
                                initPhotoCanvas(data.imageUrl, el);
                              }
                            }
                          }}
                          class={`max-h-[420px] max-w-full object-contain rounded shadow-2xl transition-all ${
                            photoTool() === 'brush' ? 'cursor-crosshair' : 'cursor-default'
                          }`}
                          onPointerDown={e => {
                            if (photoTool() !== 'brush') return;
                            const canvas = photoCanvasRef();
                            if (!canvas) return;
                            const ctx = canvas.getContext('2d');
                            if (!ctx) return;

                            try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
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
                          onPointerMove={e => {
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
                          onPointerUp={e => {
                            if (isDrawing()) {
                              setIsDrawing(false);
                              try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
                            }
                          }}
                          onPointerCancel={() => setIsDrawing(false)}
                        />

                        {/* Interactive Crop Resizer Overlay */}
                        <Show when={photoTool() === 'crop'}>
                          <div class="absolute inset-0 pointer-events-auto select-none overflow-hidden rounded">
                            {/* 4 Dimmed Masks */}
                            <div class="absolute left-0 right-0 top-0 bg-black/60 pointer-events-none" style={{ height: `${cropBox().y}%` }} />
                            <div class="absolute left-0 right-0 bottom-0 bg-black/60 pointer-events-none" style={{ height: `${100 - (cropBox().y + cropBox().h)}%` }} />
                            <div class="absolute left-0 bg-black/60 pointer-events-none" style={{ top: `${cropBox().y}%`, height: `${cropBox().h}%`, width: `${cropBox().x}%` }} />
                            <div class="absolute right-0 bg-black/60 pointer-events-none" style={{ top: `${cropBox().y}%`, height: `${cropBox().h}%`, width: `${100 - (cropBox().x + cropBox().w)}%` }} />

                            {/* Crop Box with Rule-of-Thirds Grid & Handles */}
                            <div
                              class="absolute border border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move"
                              style={{
                                left: `${cropBox().x}%`,
                                top: `${cropBox().y}%`,
                                width: `${cropBox().w}%`,
                                height: `${cropBox().h}%`
                              }}
                              onPointerDown={e => {
                                e.stopPropagation();
                                const target = e.currentTarget as HTMLElement;
                                try { target.setPointerCapture(e.pointerId); } catch {}
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
                                  try { target.releasePointerCapture(ev.pointerId); } catch {}
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
                                onPointerDown={e => handleCornerResize(e, 'tl')}
                                title="Resize Crop Box"
                              />
                              <div
                                class="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-white cursor-ne-resize z-20"
                                onPointerDown={e => handleCornerResize(e, 'tr')}
                                title="Resize Crop Box"
                              />
                              <div
                                class="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-white cursor-sw-resize z-20"
                                onPointerDown={e => handleCornerResize(e, 'bl')}
                                title="Resize Crop Box"
                              />
                              <div
                                class="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-white cursor-se-resize z-20"
                                onPointerDown={e => handleCornerResize(e, 'br')}
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
                        onClick={handleClose}
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
                            const modalInfo = editPhotoData();
                            if (modalInfo?.campaignId) {
                              const ok = await saveEditedPhoto(modalInfo.campaignId, modalInfo.fileName, dataUrl);
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
                              await modalInfo.onSave(dataUrl, thumbB64);
                              if (activeModal()?.type === 'edit_photo') {
                                if (modalInfo.returnToDirectMessage) {
                                  setActiveModal({
                                    type: 'direct_message',
                                    jid: dmJid(),
                                    accountId: dmAccount(),
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
                )}
              </Show>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
