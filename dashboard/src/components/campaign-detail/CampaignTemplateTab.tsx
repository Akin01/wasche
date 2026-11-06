import { createSignal, onSettled, Show, For } from 'solid-js';
import {
  campaignAttachments,
  uploadCampaignAttachments,
  deleteCampaignAttachment,
  updateAttachmentMode,
  updateCampaignTemplate,
  showToast,
  setActiveModal
} from '../store';
import type { Recipient } from '../types';
import {
  FileText,
  Paperclip,
  Smile,
  HelpCircle,
  Mic,
  MoreVertical,
  Scissors,
  Camera,
  Crop,
  CheckCheck,
  X,
  Video,
  Trash2,
  Play,
  Send,
  Search
} from '../../icons';

export default function CampaignTemplateTab(props: {
  campaignId: number;
  campaignName: string;
  initialTemplate: string;
  recipients: Recipient[];
}) {
  const [templateText, setTemplateText] = createSignal<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = createSignal(false);
  const [formatHelperOpen, setFormatHelperOpen] = createSignal(false);
  let emojiWrapRef: HTMLDivElement | undefined;
  let formatWrapRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let fileInputMediaRef: HTMLInputElement | undefined;
  let fileInputDocRef: HTMLInputElement | undefined;

  const currentTemplate = () =>
    templateText() !== null ? templateText()! : props.initialTemplate || '';

  const mediaCount = () => campaignAttachments().filter((a) => a.send_as !== 'document').length;
  const docCount = () => campaignAttachments().filter((a) => a.send_as === 'document').length;

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  const handleFileSelect = async (e: Event, forcedMode?: 'media' | 'document') => {
    const target = e.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    if (files.length === 0) return;

    const filesPayload: Array<{
      fileName: string;
      fileDataB64: string;
      mimeType: string;
      thumbnailDataB64?: string;
      sendAs?: 'media' | 'document';
    }> = [];

    for (const file of files) {
      if (file.size > 30 * 1024 * 1024) {
        showToast(`'${file.name}' exceeds 30MB limit`, 'error');
        continue;
      }

      const fileName = file.name;
      const mimeType = file.type || 'application/octet-stream';
      const isImg = mimeType.startsWith('image/');
      const isVid = mimeType.startsWith('video/');

      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Data = btoa(binary);

      let thumbnailB64: string | undefined;
      if (isImg) {
        try {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          const { promise, resolve } = Promise.withResolvers<void>();
          img.onload = () => resolve();
          await promise;
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 100;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, 160, 100);
          thumbnailB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        } catch {}
      } else if (isVid) {
        try {
          const vid = document.createElement('video');
          vid.src = URL.createObjectURL(file);
          const { promise: pLoaded, resolve: rLoaded } = Promise.withResolvers<void>();
          vid.onloadeddata = () => rLoaded();
          setTimeout(rLoaded, 600);
          await pLoaded;
          vid.currentTime = 0.5;
          const { promise: pSeeked, resolve: rSeeked } = Promise.withResolvers<void>();
          vid.onseeked = () => rSeeked();
          setTimeout(rSeeked, 600);
          await pSeeked;
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 100;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(vid, 0, 0, 160, 100);
          thumbnailB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        } catch {}
      }

      const sendAs = forcedMode || (isImg || isVid ? 'media' : 'document');
      filesPayload.push({
        fileName,
        fileDataB64: base64Data,
        mimeType,
        thumbnailDataB64: thumbnailB64,
        sendAs
      });
    }

    if (filesPayload.length > 0) {
      await uploadCampaignAttachments(props.campaignId, filesPayload);
    }
    target.value = '';
  };

  const wrapSelectedText = (wrapper: string) => {
    const textarea = document.getElementById('solidTemplateTextarea') as HTMLTextAreaElement | null;
    const cur = currentTemplate();
    if (!textarea) return;
    const start = textarea.selectionStart ?? cur.length;
    const end = textarea.selectionEnd ?? cur.length;
    const selected = cur.slice(start, end) || 'text';
    const wrapped = `${wrapper}${selected}${wrapper}`;
    const next = cur.slice(0, start) + wrapped + cur.slice(end);
    setTemplateText(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + wrapper.length, start + wrapper.length + selected.length);
    }, 10);
  };

  const insertToken = (token: string) => {
    const textarea = document.getElementById('solidTemplateTextarea') as HTMLTextAreaElement | null;
    const cur = currentTemplate();
    if (!textarea) {
      setTemplateText(cur + token);
      return;
    }
    const start = textarea.selectionStart ?? cur.length;
    const end = textarea.selectionEnd ?? cur.length;
    const nextText = cur.slice(0, start) + token + cur.slice(end);
    setTemplateText(nextText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 10);
  };

  const formatWhatsAppText = (
    raw: string,
    sampleName = 'Zhidan',
    samplePhone = '+62 853-8922-9489'
  ) => {
    if (!raw) {
      return '<span style="color:#8696a0; font-style:italic;">Type your broadcast message...</span>';
    }
    let text = raw;
    text = text.replace(/\{\{name\}\}|\{name\}/gi, sampleName);
    text = text.replace(/\{\{phone\}\}|\{phone\}/gi, samplePhone);
    text = text.replace(/\{\{first_name\}\}|\{first_name\}/gi, sampleName.split(' ')[0]);
    text = text.replace(
      /\{\{jid\}\}|\{jid\}/gi,
      `${samplePhone.replace(/\D/g, '')}@s.whatsapp.net`
    );
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text = text.replace(
      /```([\s\S]*?)```/g,
      '<code style="background:rgba(0,0,0,0.35); padding:2px 6px; border-radius:4px; font-family:monospace; font-size:11.5px; display:inline-block; margin:2px 0;">$1</code>'
    );
    text = text.replace(
      /`([^`\n]+)`/g,
      '<code style="background:rgba(0,0,0,0.35); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:11.5px;">$1</code>'
    );
    text = text.replace(
      /(?<!\w)\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?!\w)/g,
      '<strong style="font-weight:700;">$1</strong>'
    );
    text = text.replace(
      /(?<!\w)_([^\s_](?:[\s\S]*?[^\s_])?)_(?!\w)/g,
      '<em style="font-style:italic;">$1</em>'
    );
    text = text.replace(
      /(?<!\w)~([^\s~](?:[\s\S]*?[^\s~])?)~(?!\w)/g,
      '<del style="text-decoration:line-through; opacity:0.85;">$1</del>'
    );
    text = text.replace(/\r?\n/g, '<br/>');
    return text;
  };

  const EMOJIS = [
    '👍',
    '❤️',
    '🔥',
    '👏',
    '🙏',
    '🎉',
    '😊',
    '🚀',
    '✅',
    '✨',
    '💯',
    '👋',
    '⭐',
    '🤝',
    '💼',
    '📌',
    '🔔',
    '📢',
    '🎁',
    '⚡',
    '💬',
    '📱',
    '📦',
    '🎯'
  ];

  onSettled(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiPickerOpen() && emojiWrapRef && !emojiWrapRef.contains(target)) {
        setEmojiPickerOpen(false);
      }
      if (formatHelperOpen() && formatWrapRef && !formatWrapRef.contains(target)) {
        setFormatHelperOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEmojiPickerOpen(false);
        setFormatHelperOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Column: Template Composer Card */}
      <div class="card rounded-2xl p-5 space-y-4 bg-[#111b21] border border-[#222d34]">
        <div class="flex items-center justify-between border-b border-[#222d34] pb-3">
          <div>
            <span class="text-xs font-bold uppercase tracking-wider text-[#e9edef] block">
              Template Composer
            </span>
            <span class="text-[11px] text-[#8696a0] block mt-0.5">
              Customize message with tags and formatting
            </span>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              style={{ border: 'none', background: '#182229' }}
              class="h-7 px-2.5 rounded-lg text-xs font-mono text-[#00a884] hover:bg-[#202c33] cursor-pointer transition-colors"
              onClick={() => insertToken('{name}')}
              title="Insert {name}"
            >
              + {'{name}'}
            </button>
            <button
              type="button"
              style={{ border: 'none', background: '#182229' }}
              class="h-7 px-2.5 rounded-lg text-xs font-mono text-[#00a884] hover:bg-[#202c33] cursor-pointer transition-colors"
              onClick={() => insertToken('{phone}')}
              title="Insert {phone}"
            >
              + {'{phone}'}
            </button>
          </div>
        </div>

        {/* Hidden inputs: one for Photos & Videos (Media) and one for Documents/Raw Attachments */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          class="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          onChange={(e) => handleFileSelect(e)}
        />
        <input
          ref={fileInputMediaRef}
          type="file"
          multiple
          class="hidden"
          accept="image/*,video/*"
          onChange={(e) => handleFileSelect(e, 'media')}
        />
        <input
          ref={fileInputDocRef}
          type="file"
          multiple
          class="hidden"
          accept="*/*"
          onChange={(e) => handleFileSelect(e, 'document')}
        />

        {/* Multi-Media / Document Attachment Gallery Card in Composer */}
        <Show when={campaignAttachments().length > 0}>
          <div class="p-3 bg-[#182229] border border-[#2a3942] rounded-xl space-y-2.5 animate-fade">
            <div class="flex items-center justify-between text-xs pb-2 border-b border-[#222d34] flex-wrap gap-2">
              <span class="font-bold text-[#e9edef] flex items-center gap-2 text-xs">
                <Paperclip size={14} class="text-[#00a884]" />
                <span>Attached Files</span>
                <span class="px-2 py-0.5 rounded-full text-[10.5px] font-mono font-bold bg-[#00a884]/20 text-[#00a884] border border-[#00a884]/35">
                  {campaignAttachments().length}
                </span>
              </span>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#00a884]/15 hover:bg-[#00a884]/25 text-[#00a884] border border-[#00a884]/35 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                  onClick={() => fileInputMediaRef?.click()}
                  title="Attach photos and videos to send as inline media"
                >
                  <Camera size={12} class="text-[#00a884]" />
                  <span>+ Media</span>
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded-lg text-xs font-medium bg-[#53bdeb]/15 hover:bg-[#53bdeb]/25 text-[#53bdeb] border border-[#53bdeb]/35 flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                  onClick={() => fileInputDocRef?.click()}
                  title="Attach any raw document file (PDF, docx, zip, etc.)"
                >
                  <Paperclip size={12} class="text-[#53bdeb]" />
                  <span>+ Attachment</span>
                </button>
                <button
                  type="button"
                  class="px-2 py-1 rounded-lg text-xs font-medium bg-[#202c33] hover:bg-[#ef4444]/15 border border-[#2a3942] hover:border-[#ef4444]/40 text-[#8696a0] hover:text-[#ef4444] flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  onClick={() => deleteCampaignAttachment(props.campaignId)}
                  title="Remove all attached files"
                >
                  <Trash2 size={12} />
                  <span>Clear All</span>
                </button>
              </div>
            </div>

            <div class="space-y-2 max-h-60 overflow-y-auto p-0.5 pr-1">
              <For each={campaignAttachments()}>
                {(att) => {
                  const isImg = () => att.mime_type.startsWith('image/');
                  const isVid = () => att.mime_type.startsWith('video/');
                  const isDocMode = () => att.send_as === 'document';
                  return (
                    <div class="p-2.5 px-3 bg-[#141f26] hover:bg-[#18262f] border border-[#2a3942] hover:border-[#00a884]/40 rounded-xl flex items-center justify-between gap-3 text-xs transition-all shadow-xs group">
                      <div class="flex items-center gap-3 min-w-0 flex-1">
                        {/* Media Thumbnail */}
                        <div class="w-11 h-11 rounded-lg bg-[#202c33] border border-[#2a3942] overflow-hidden flex items-center justify-center shrink-0 shadow-xs">
                          <Show
                            when={isImg()}
                            fallback={
                              <Show
                                when={isVid()}
                                fallback={
                                  <div class="text-[#53bdeb] font-bold uppercase text-[10px] flex items-center justify-center">
                                    <FileText size={18} />
                                  </div>
                                }
                              >
                                <div class="relative w-full h-full flex items-center justify-center">
                                  <Show
                                    when={att.thumbnail_url}
                                    fallback={<Video size={16} class="text-[#53bdeb]" />}
                                  >
                                    <img
                                      src={`${att.thumbnail_url}&t=${props.campaignId || ''}`}
                                      alt="Video"
                                      class="w-full h-full object-cover"
                                    />
                                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <Play
                                        size={11}
                                        fill="currentColor"
                                        class="text-white ml-0.5"
                                      />
                                    </div>
                                  </Show>
                                </div>
                              </Show>
                            }
                          >
                            <img src={att.url} alt="Attached" class="w-full h-full object-cover" />
                          </Show>
                        </div>

                        {/* File Name & Delivery Details */}
                        <div class="min-w-0 flex-1">
                          <strong
                            class="text-xs font-semibold text-[#e9edef] block truncate max-w-[240px] sm:max-w-[340px] tracking-tight leading-snug"
                            title={att.file_name}
                          >
                            {att.file_name}
                          </strong>
                          <div class="flex items-center gap-2 mt-1 flex-wrap">
                            <span class="text-[11px] text-[#8696a0] font-mono">
                              {formatBytes(att.file_size)}
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
                              onClick={() =>
                                updateAttachmentMode(
                                  props.campaignId,
                                  att.file_name,
                                  isDocMode() ? 'media' : 'document'
                                )
                              }
                            >
                              <Show when={isDocMode()} fallback={<Video size={10} />}>
                                <FileText size={10} />
                              </Show>
                              <span>{isDocMode() ? 'Document' : 'Media'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Actions: Edit Photo, Cut/Trim, Delete */}
                      <div class="flex items-center gap-2 shrink-0">
                        <Show when={isImg()}>
                          <button
                            type="button"
                            class="h-7 px-2.5 rounded-lg bg-[#202c33] hover:bg-[#00a884]/20 border border-[#2a3942] hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 text-xs font-medium transition-all shadow-xs cursor-pointer active:scale-95"
                            title="Open WhatsApp Photo Studio (Crop, Doodle, Text, Filters)"
                            onClick={() =>
                              setActiveModal({
                                type: 'edit_photo',
                                campaignId: props.campaignId,
                                fileName: att.file_name,
                                imageUrl: att.url
                              })
                            }
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
                            onClick={() =>
                              setActiveModal({
                                type: 'cut_video',
                                campaignId: props.campaignId,
                                fileName: att.file_name,
                                videoUrl: att.url,
                                fileSize: att.file_size
                              })
                            }
                          >
                            <Scissors size={12} />
                            <span>Cut / Trim</span>
                          </button>
                        </Show>
                        <button
                          type="button"
                          class="w-7 h-7 rounded-lg bg-[#202c33] hover:bg-[#ef4444]/20 border border-[#2a3942] hover:border-[#ef4444]/40 text-[#8696a0] hover:text-[#ef4444] flex items-center justify-center p-0 transition-colors cursor-pointer"
                          title={`Remove ${att.file_name}`}
                          aria-label={`Remove ${att.file_name}`}
                          onClick={() => deleteCampaignAttachment(props.campaignId, att.file_name)}
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

        {/* Textarea with bottom-right emoticon and formatting overlay */}
        <div class="relative w-full">
          <textarea
            id="solidTemplateTextarea"
            class="w-full h-[420px] min-h-[380px] bg-[#0b141a] border border-[#2a3942] rounded-xl p-3.5 pb-11 text-xs text-[#e9edef] focus:outline-none focus:border-[#00a884] font-sans leading-relaxed resize-y transition-all"
            value={currentTemplate()}
            onInput={(e) => setTemplateText(e.currentTarget.value)}
            placeholder="Type your WhatsApp message template here... Use {name} or {phone} for personalization."
          />

          {/* Floating Overlay Buttons on Bottom Right (Media, Document, Emoji, Formatting) */}
          <div class="absolute right-3 bottom-3 flex items-center gap-1.5 z-20">
            {/* 1. Media Floating Button */}
            <button
              type="button"
              style={{
                border: mediaCount() > 0 ? '1px solid #00a884' : '1px solid #2a3942',
                background: mediaCount() > 0 ? '#202c33' : '#111b21'
              }}
              class={`w-7 h-7 rounded-lg flex items-center justify-center p-0 transition-colors cursor-pointer relative ${
                mediaCount() > 0
                  ? 'text-[#00a884]'
                  : 'text-[#8696a0] hover:text-[#00a884] hover:border-[#00a884]'
              }`}
              title={
                mediaCount() > 0
                  ? `${mediaCount()} attached media file(s) (Click to attach more)`
                  : 'Attach Photo or Video (Inline Media)'
              }
              onClick={() => fileInputMediaRef?.click()}
            >
              <Camera size={14} class={mediaCount() > 0 ? 'text-[#00a884]' : ''} />
              <Show when={mediaCount() > 0}>
                <span class="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 bg-[#00a884] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center font-mono ring-2 ring-[#111b21]">
                  {mediaCount()}
                </span>
              </Show>
            </button>

            {/* 2. Document / Raw Attachment Floating Button */}
            <button
              type="button"
              style={{
                border: docCount() > 0 ? '1px solid #53bdeb' : '1px solid #2a3942',
                background: docCount() > 0 ? '#202c33' : '#111b21'
              }}
              class={`w-7 h-7 rounded-lg flex items-center justify-center p-0 transition-colors cursor-pointer relative ${
                docCount() > 0
                  ? 'text-[#53bdeb]'
                  : 'text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb]'
              }`}
              title={
                docCount() > 0
                  ? `${docCount()} attached document(s) (Click to attach more)`
                  : 'Attach Document or Raw File'
              }
              onClick={() => fileInputDocRef?.click()}
            >
              <Paperclip size={14} class={docCount() > 0 ? 'text-[#53bdeb]' : ''} />
              <Show when={docCount() > 0}>
                <span class="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 bg-[#53bdeb] text-[#111b21] text-[9px] font-bold rounded-full flex items-center justify-center font-mono ring-2 ring-[#111b21]">
                  {docCount()}
                </span>
              </Show>
            </button>

            <div class="w-[1px] h-3.5 bg-[#2a3942] mx-0.5" />
            {/* 1. Emoji Popover */}
            <div class="relative" ref={emojiWrapRef}>
              <button
                type="button"
                style={{
                  border: '1px solid #2a3942',
                  background: emojiPickerOpen() ? '#202c33' : '#111b21'
                }}
                class="w-7 h-7 rounded-lg text-[#8696a0] hover:text-[#ffbc38] hover:border-[#ffbc38] flex items-center justify-center p-0 transition-colors cursor-pointer"
                title="Insert Emoji"
                onClick={() => {
                  setEmojiPickerOpen(!emojiPickerOpen());
                  setFormatHelperOpen(false);
                }}
              >
                <Smile size={14} class="text-[#ffbc38]" />
              </button>

              <Show when={emojiPickerOpen()}>
                <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-popover p-2.5 z-40 w-64 animate-popover">
                  <div class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0] mb-2 pb-1 border-b border-[#222d34]">
                    Quick Emojis
                  </div>
                  <div class="grid grid-cols-6 gap-1 max-h-40 overflow-y-auto p-0.5">
                    <For each={EMOJIS}>
                      {(em) => (
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent' }}
                          class="w-7 h-7 flex items-center justify-center text-base rounded-lg hover:bg-[#202c33] cursor-pointer transition-transform hover:scale-125 p-0"
                          onClick={() => {
                            insertToken(em);
                            setEmojiPickerOpen(false);
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

            {/* 2. Formatting Shortcuts Popover */}
            <div class="relative" ref={formatWrapRef}>
              <button
                type="button"
                style={{
                  border: '1px solid #2a3942',
                  background: formatHelperOpen() ? '#202c33' : '#111b21'
                }}
                class="w-7 h-7 rounded-lg text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb] flex items-center justify-center p-0 transition-colors cursor-pointer"
                title="WhatsApp Formatting"
                onClick={() => {
                  setFormatHelperOpen(!formatHelperOpen());
                  setEmojiPickerOpen(false);
                }}
              >
                <HelpCircle size={14} class="text-[#53bdeb]" />
              </button>

              <Show when={formatHelperOpen()}>
                <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-popover p-2 z-40 w-64 animate-popover space-y-1">
                  <div class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0] mb-1.5 px-1 pb-1 border-b border-[#222d34]">
                    WhatsApp Formatting
                  </div>
                  <div
                    class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                    onClick={() => {
                      wrapSelectedText('*');
                      setFormatHelperOpen(false);
                    }}
                  >
                    <code class="text-[#00a884] font-mono font-semibold">*text*</code>
                    <strong class="text-[#e9edef]">Bold</strong>
                  </div>
                  <div
                    class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                    onClick={() => {
                      wrapSelectedText('_');
                      setFormatHelperOpen(false);
                    }}
                  >
                    <code class="text-[#00a884] font-mono font-semibold">_text_</code>
                    <em class="text-[#e9edef]">Italic</em>
                  </div>
                  <div
                    class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                    onClick={() => {
                      wrapSelectedText('~');
                      setFormatHelperOpen(false);
                    }}
                  >
                    <code class="text-[#00a884] font-mono font-semibold">~text~</code>
                    <span class="line-through text-[#e9edef]">Strikethrough</span>
                  </div>
                  <div
                    class="flex items-center justify-between p-1.5 px-2 rounded-lg hover:bg-[#202c33] cursor-pointer text-xs transition-colors"
                    onClick={() => {
                      wrapSelectedText('```');
                      setFormatHelperOpen(false);
                    }}
                  >
                    <code class="text-[#00a884] font-mono font-semibold">```code```</code>
                    <span class="font-mono text-[11px] text-[#e9edef]">Monospace</span>
                  </div>
                </div>
              </Show>
            </div>
          </div>
        </div>

        {/* Footer with Character / Word Count & Save Button */}
        <div class="flex items-center justify-between pt-1 px-1 text-xs text-[#8696a0]">
          <span>
            {currentTemplate().length} characters &bull;{' '}
            {currentTemplate().trim() ? currentTemplate().trim().split(/\s+/).length : 0} words
          </span>
          <button
            class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
            onClick={() => updateCampaignTemplate(props.campaignId, currentTemplate())}
          >
            <Send size={13} />
            <span>Save Template</span>
          </button>
        </div>
      </div>

      {/* Right Column: Authentic WhatsApp Chat Live Preview Card */}
      <div class="card rounded-2xl p-0 overflow-hidden flex flex-col bg-[#111b21] border border-[#222d34] shadow-lg">
        {/* WhatsApp Chat Window Header Mock */}
        <div class="p-3 px-4 bg-[#182229] border-b border-[#222d34] flex items-center justify-between">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-xs font-bold text-[#00a884] shrink-0">
              {(props.recipients[0]?.display_name || 'Z').charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                {props.recipients[0]?.display_name || 'Zhidan'}
              </strong>
              <span class="text-[10px] text-[#00a884] font-medium block leading-tight">online</span>
            </div>
          </div>
          <div class="flex items-center gap-2.5 text-[#8696a0]">
            <Search size={14} class="hover:text-[#e9edef] cursor-pointer" />
            <MoreVertical size={14} class="hover:text-[#e9edef] cursor-pointer" />
          </div>
        </div>

        {/* WhatsApp Chat Wallpaper Body */}
        <div
          style={{
            'background-color': '#0b141a',
            'background-image': "url('/wa-doodle.svg')",
            'background-repeat': 'repeat',
            'background-size': '374px 666px'
          }}
          class="flex-1 flex flex-col justify-between min-h-[380px] relative overflow-hidden"
        >
          {/* Message Stream Area - mt-auto pushes bubble directly to bottom */}
          <div class="flex-1 flex flex-col justify-between p-4 pb-2 z-10">
            {/* Centered Date Badge */}
            <div class="self-center my-1 px-3 py-0.5 rounded-md bg-[#182229]/90 border border-[#2a3942] text-[10.5px] text-[#8696a0] font-medium shadow-xs">
              TODAY
            </div>

            {/* WhatsApp Outgoing Speech Bubble (mt-auto pushes right to bottom above chat bar) */}
            <div class="max-w-[85%] self-end mt-auto mb-1">
              <div class="bg-[#005c4b] text-[#e9edef] p-2.5 px-3 rounded-2xl rounded-tr-xs shadow-md text-xs leading-relaxed break-words">
                {/* Attached Media / Document in Live WhatsApp Chat Preview */}
                {/* Attached Multi-Media / Documents in Live WhatsApp Chat Preview */}
                <Show when={campaignAttachments().length > 0}>
                  <div class="mb-2">
                    {/* 1. Photos Album / Grid */}
                    <Show
                      when={campaignAttachments().some(
                        (a) => a.send_as !== 'document' && a.mime_type.startsWith('image/')
                      )}
                    >
                      <div
                        class={`rounded-xl overflow-hidden mb-1.5 gap-1 bg-black/20 border border-black/10 ${
                          campaignAttachments().filter(
                            (a) => a.send_as !== 'document' && a.mime_type.startsWith('image/')
                          ).length === 1
                            ? 'flex items-center justify-center max-h-52'
                            : 'grid grid-cols-2 max-h-56'
                        }`}
                      >
                        <For
                          each={campaignAttachments()
                            .filter(
                              (a) => a.send_as !== 'document' && a.mime_type.startsWith('image/')
                            )
                            .slice(0, 4)}
                        >
                          {(att, idx) => (
                            <div class="relative overflow-hidden aspect-square flex items-center justify-center bg-black/20">
                              <img
                                src={att.url}
                                alt="Media Preview"
                                class="w-full h-full object-cover"
                              />
                              <Show
                                when={
                                  idx() === 3 &&
                                  campaignAttachments().filter(
                                    (a) =>
                                      a.send_as !== 'document' && a.mime_type.startsWith('image/')
                                  ).length > 4
                                }
                              >
                                <div class="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg">
                                  +
                                  {campaignAttachments().filter(
                                    (a) =>
                                      a.send_as !== 'document' && a.mime_type.startsWith('image/')
                                  ).length - 3}
                                </div>
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>

                    {/* 2. Video Attachments (Inline Media) - Interactive Playable Video */}
                    <For
                      each={campaignAttachments().filter(
                        (a) => a.send_as !== 'document' && a.mime_type.startsWith('video/')
                      )}
                    >
                      {(att) => (
                        <div class="relative rounded-xl overflow-hidden max-h-56 bg-black/50 flex items-center justify-center border border-black/20 mb-1.5 shadow-md">
                          <video
                            src={att.url}
                            poster={att.thumbnail_url || undefined}
                            controls
                            preload="metadata"
                            playsinline
                            class="w-full h-auto max-h-52 rounded-xl object-contain bg-black cursor-pointer"
                          />
                        </div>
                      )}
                    </For>

                    {/* 3. Document / Raw File Attachments */}
                    <For
                      each={campaignAttachments().filter(
                        (a) =>
                          a.send_as === 'document' ||
                          (!a.mime_type.startsWith('image/') && !a.mime_type.startsWith('video/'))
                      )}
                    >
                      {(att) => (
                        <div class="p-2.5 px-3 rounded-xl bg-[#182229]/90 border border-[#2a3942] flex items-center gap-2.5 mb-1.5">
                          <div class="w-9 h-9 rounded-lg bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#53bdeb] shrink-0 font-bold uppercase text-[10px]">
                            <FileText size={18} />
                          </div>
                          <div class="min-w-0 flex-1">
                            <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                              {att.file_name}
                            </strong>
                            <span class="text-[10px] text-[#8696a0] block mt-0.5 font-mono">
                              {formatBytes(att.file_size)} &bull;{' '}
                              {att.file_name.split('.').pop()?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
                <div
                  innerHTML={formatWhatsAppText(
                    currentTemplate(),
                    props.recipients[0]?.display_name || 'Zhidan',
                    props.recipients[0]?.phone_number || '+62 853-8922-9489'
                  )}
                />
                <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-white/60">
                  <span>
                    {new Date().toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                  <CheckCheck size={14} class="text-[#53bdeb]" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Chat Bar Mock */}
          <div class="p-3 px-3.5 bg-[#182229]/95 border-t border-[#222d34] flex items-center gap-2.5 text-[#8696a0] z-10">
            <Smile size={18} class="hover:text-[#e9edef] cursor-pointer shrink-0" />
            <Paperclip
              size={18}
              class="hover:text-[#e9edef] cursor-pointer shrink-0"
              onClick={() => fileInputRef?.click()}
              title="Attach file"
            />
            <div class="flex-1 bg-[#202c33] border border-[#2a3942] rounded-lg px-3.5 py-1.5 text-xs text-[#8696a0]">
              Type a message
            </div>
            <Mic size={18} class="hover:text-[#e9edef] cursor-pointer shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
