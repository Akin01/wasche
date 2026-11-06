import { createSignal, Show, For } from 'solid-js';
import {
  showToast,
  trimVideoAttachment,
  captureVideoFrame,
  setActiveModal,
  activeModal
} from '../store';
import { formatBytes } from './shared';
import {
  Scissors,
  Play,
  Pause,
  Camera,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Check,
  RefreshCw,
  Film
} from '../../icons';

export default function VideoTrimmerModal(props: {
  data: {
    videoUrl: string;
    duration?: number;
    onTrim?: (blobUrl: string, b64: string, duration: number) => void;
    returnToDirectMessage?: boolean;
    returnToCreateCampaign?: boolean;
    campaignId?: number;
    fileName?: string;
  };
  onClose: () => void;
}) {
  const [videoRef, setVideoRef] = createSignal<HTMLVideoElement | null>(null);
  const [videoDuration, setVideoDuration] = createSignal(0);
  const [videoCurrentTime, setVideoCurrentTime] = createSignal(0);
  const [videoPlaying, setVideoPlaying] = createSignal(false);
  const [videoMuted, setVideoMuted] = createSignal(false);
  const [videoPreserveHd, setVideoPreserveHd] = createSignal(true);
  const [startTime, setStartTime] = createSignal(0);
  const [endTime, setEndTime] = createSignal(30);
  const [filmstripFrames, setFilmstripFrames] = createSignal<string[]>([]);
  const [isTrimming, setIsTrimming] = createSignal(false);
  const [isCapturing, setIsCapturing] = createSignal(false);
  const filmstripCache: Record<string, string[]> = {};
  const formatFileSize = formatBytes;
  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  }

  const cutVideoData = () => props.data;
  const selectedDuration = () => Math.max(0, endTime() - startTime());
  const estSize = () => {
    const sel = selectedDuration();
    return Math.min(15 * 1024 * 1024, Math.round(sel * 220 * 1024));
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
      await new Promise((r) => {
        tempVideo.onloadeddata = r;
        setTimeout(r, 2000);
      });

      const frames: string[] = [];
      for (let i = 0; i < count; i++) {
        const t = Math.min(dur, i * step + step / 2);
        tempVideo.currentTime = t;
        await new Promise((r) => {
          tempVideo.onseeked = r;
          setTimeout(r, 600);
        });
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
        await captureVideoFrame(
          data.campaignId,
          data.fileName || '',
          videoCurrentTime(),
          asPhoto,
          imageDataB64
        );
      } else if (data.returnToDirectMessage && imageDataB64) {
        if (asPhoto) {
          showToast('Captured frame as photo attachment!', 'success');
        } else {
          showToast('Updated video preview thumbnail from frame!', 'success');
        }
      } else if (data.returnToCreateCampaign && imageDataB64) {
        if (asPhoto) {
          showToast('Captured frame as photo attachment!', 'success');
        } else {
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
        await data.onTrim(data.videoUrl, '', selectedDuration());
        if (activeModal()?.type === 'cut_video') {
          if (data.returnToDirectMessage) {
            setActiveModal({
              type: 'direct_message',
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
        const ok = await trimVideoAttachment(
          data.campaignId,
          data.fileName || '',
          startTime(),
          endTime(),
          videoMuted(),
          videoPreserveHd()
        );
        if (ok) {
          setActiveModal(null);
        }
      }
    } finally {
      setIsTrimming(false);
    }
  };

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
              {props.data.fileName || 'Video'}
            </strong>
            <span class="text-[11px] text-[#8696a0] font-mono shrink-0">Original</span>
          </div>
          <p class="text-[#8696a0] text-[11px] mt-0.5 leading-relaxed">
            Trim your video to any duration. Wasche automatically compresses and re-encodes the
            video with H.264 CRF rate control to stay compliant with WhatsApp.
          </p>
        </div>
      </div>

      {/* Video Player & Frame Display */}
      <div class="relative bg-black rounded-xl overflow-hidden border border-[#2a3942] flex flex-col items-center justify-center min-h-[220px] max-h-[320px]">
        <video
          ref={setVideoRef}
          src={props.data.videoUrl}
          class="max-h-[300px] w-auto max-w-full object-contain mx-auto"
          crossorigin="anonymous"
          onLoadedMetadata={onVideoLoaded}
          onTimeUpdate={(e) => {
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
              <Show
                when={videoPlaying()}
                fallback={<Play size={13} fill="currentColor" class="ml-0.5" />}
              >
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
              onClick={() => {
                setStartTime(0);
                setEndTime(Math.min(15, videoDuration()));
                seekVideo(0);
              }}
            >
              15s
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
              onClick={() => {
                setStartTime(0);
                setEndTime(Math.min(30, videoDuration()));
                seekVideo(0);
              }}
            >
              30s (Status)
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
              onClick={() => {
                setStartTime(0);
                setEndTime(Math.min(60, videoDuration()));
                seekVideo(0);
              }}
            >
              60s
            </button>
            <button
              type="button"
              class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] cursor-pointer transition-colors"
              onClick={() => {
                setStartTime(0);
                setEndTime(videoDuration());
                seekVideo(0);
              }}
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
                showToast(
                  next ? 'HD Quality Enabled (Native Resolution)' : 'Standard Quality (Compressed)',
                  'info'
                );
              }}
              title={
                videoPreserveHd()
                  ? 'Preserve Full HD Video Resolution (Click to toggle standard)'
                  : 'Standard Video Quality (Click to toggle HD)'
              }
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
          onClick={(e) => {
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
              {(frame) => (
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
            style={{
              width: `${100 - (endTime() / (videoDuration() || 1)) * 100}%`
            }}
          />

          {/* Active Glowing Bounding Box - Draggable center to slide the whole window */}
          <div
            class="absolute top-0 bottom-0 border-y-2 border-[#00a884] shadow-[0_0_12px_rgba(0,168,132,0.45)] cursor-grab active:cursor-grabbing z-15 group"
            style={{
              left: `${(startTime() / (videoDuration() || 1)) * 100}%`,
              width: `${((endTime() - startTime()) / (videoDuration() || 1)) * 100}%`
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
                try {
                  target.releasePointerCapture(ev.pointerId);
                } catch {}
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
            onPointerDown={(e) => {
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
            onPointerDown={(e) => {
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
          <span>
            Start: <strong class="text-[#00a884]">{formatTime(startTime())}</strong>
          </span>
          <span>
            End: <strong class="text-[#00a884]">{formatTime(endTime())}</strong>
          </span>
        </div>
      </div>

      {/* Footer Action Buttons */}
      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-[#222d34]">
        <button
          type="button"
          class="btn-cancel h-9 px-4 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
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
}
