import { createSignal, onSettled, Show, For } from 'solid-js';
import { accounts, showToast, setActiveModal, sendDirectMessage } from '../store';
import { Select } from '@kobalte/core/select';
import type { Account } from '../types';
import { getAccountStatusState } from '../types';
import {
  EMOJIS,
  formatWhatsAppText,
  dmJid,
  setDmJid,
  dmAccount,
  setDmAccount,
  dmMessage,
  setDmMessage,
  dmAttachmentsList,
  setDmAttachmentsList,
  dmTab,
  setDmTab,
  wrapText,
  insertToken,
  processAttachmentFile
} from './shared';
import {
  X,
  Send,
  Smile,
  Image as ImageIcon,
  Video,
  Scissors,
  CheckCheck,
  Paperclip,
  Check,
  Smartphone,
  ChevronDown,
  Type,
  Eye,
  Camera,
  Trash2,
  FileText,
  Play,
  Crop,
  HelpCircle,
  RefreshCw
} from '../../icons';

export default function DirectMessageModal(props: {
  preserveState?: boolean;
  jid?: string;
  accountId?: string;
  name?: string;
  onClose: () => void;
}) {
  const [isSendingDm, setIsSendingDm] = createSignal(false);
  const [dmEmojiOpen, setDmEmojiOpen] = createSignal(false);
  const [dmFormatOpen, setDmFormatOpen] = createSignal(false);
  let dmEmojiWrapRef: HTMLDivElement | undefined;
  let dmFormatWrapRef: HTMLDivElement | undefined;
  let dmFileInputMediaRef: HTMLInputElement | undefined;
  let dmFileInputDocRef: HTMLInputElement | undefined;

  const dmMediaCount = () =>
    dmAttachmentsList().filter(
      (a) =>
        a.sendAs === 'media' || a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')
    ).length;
  const dmDocCount = () =>
    dmAttachmentsList().filter(
      (a) =>
        a.sendAs === 'document' &&
        !a.mimeType.startsWith('image/') &&
        !a.mimeType.startsWith('video/')
    ).length;

  onSettled(() => {
    if (!props.preserveState) {
      setDmJid(props.jid || '');
      setDmAccount(props.accountId || accounts()[0]?.account_id || '');
      setDmMessage('');
      setDmAttachmentsList([]);
      setDmTab('editor');
    }
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dmEmojiWrapRef && !dmEmojiWrapRef.contains(target)) setDmEmojiOpen(false);
      if (dmFormatWrapRef && !dmFormatWrapRef.contains(target)) setDmFormatOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  });

  return (
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
          onInput={(e) => setDmJid(e.currentTarget.value)}
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
          value={accounts().find((a) => a.account_id === dmAccount())}
          onChange={(acc) => acc && setDmAccount(acc.account_id)}
          placeholder="Select WhatsApp Account"
          itemComponent={(props) => {
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
                      {props.item.rawValue.phone_number
                        ? `+${props.item.rawValue.phone_number}`
                        : status()}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span
                    class={`w-1.5 h-1.5 rounded-full ${isOnline() ? 'bg-[#00a884]' : 'bg-[#f15c6d]'}`}
                  />
                  <Select.ItemIndicator>
                    <Check size={13} class="text-[#00a884]" />
                  </Select.ItemIndicator>
                </div>
              </Select.Item>
            );
          }}
        >
          <Select.Trigger
            style={{
              border: '1px solid #2a3942',
              background: '#111b21',
              'justify-content': 'space-between'
            }}
            class="w-full h-8 px-3 rounded-lg text-xs text-[#e9edef] flex items-center justify-between cursor-pointer hover:border-[#00a884] transition-colors focus:outline-none focus:border-[#00a884]"
          >
            <div class="flex items-center gap-2 min-w-0">
              <Smartphone size={14} class="text-[#00a884] shrink-0" />
              <Select.Value<Account>>
                {(state) => (
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
            <Select.Content class="bg-[#182229] border border-[#2a3942] rounded-xl shadow-dropdown p-1.5 z-[100] min-w-[300px] max-h-[220px] overflow-y-auto space-y-1">
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
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                'box-shadow': 'none'
              }}
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
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                'box-shadow': 'none'
              }}
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
          onChange={async (e) => {
            const files = Array.from(e.currentTarget.files || []);
            for (const file of files) {
              const att = await processAttachmentFile(file, 'media');
              if (att) setDmAttachmentsList((prev) => [...prev, att]);
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
          onChange={async (e) => {
            const files = Array.from(e.currentTarget.files || []);
            for (const file of files) {
              const att = await processAttachmentFile(file, 'document');
              if (att) setDmAttachmentsList((prev) => [...prev, att]);
            }
            e.currentTarget.value = '';
          }}
        />

        {/* 1. EDITOR TAB VIEW */}
        <Show when={dmTab() === 'editor'}>
          {/* Multi-Media / Document Attachment Gallery Card in Direct Message */}
          <Show when={dmAttachmentsList().length > 0}>
            <div class="mb-3 p-3 bg-[#141f26] border border-[#2a3942] rounded-xl space-y-2.5 animate-fade">
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
                            <strong
                              class="text-xs font-semibold text-[#e9edef] block truncate max-w-[200px] sm:max-w-[300px] tracking-tight leading-snug"
                              title={att.fileName}
                            >
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
                                  setDmAttachmentsList((prev) =>
                                    prev.map((item, i) =>
                                      i === idx()
                                        ? {
                                            ...item,
                                            sendAs: item.sendAs === 'media' ? 'document' : 'media'
                                          }
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
                                  imageUrl: att.fileDataB64
                                    ? `data:${att.mimeType};base64,${att.fileDataB64}`
                                    : att.blobUrl || '',
                                  returnToDirectMessage: true,
                                  onSave: async (
                                    editedDataUrl: string,
                                    passedThumbB64?: string
                                  ) => {
                                    const base64 = editedDataUrl.split(',')[1];
                                    let thumbB64 = passedThumbB64;
                                    if (!thumbB64) {
                                      try {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = 120;
                                        canvas.height = 120;
                                        const img = document.createElement('img');
                                        img.src = editedDataUrl;
                                        await new Promise((r) => {
                                          img.onload = r;
                                          setTimeout(r, 500);
                                        });
                                        const ctx = canvas.getContext('2d');
                                        ctx?.drawImage(img, 0, 0, 120, 120);
                                        thumbB64 = canvas
                                          .toDataURL('image/jpeg', 0.8)
                                          .split(',')[1];
                                      } catch {}
                                    }
                                    setDmAttachmentsList((prev) =>
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
                                  videoUrl:
                                    att.blobUrl || `data:${att.mimeType};base64,${att.fileDataB64}`,
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
                                          const byteArray = Uint8Array.from(byteChars, (c) =>
                                            c.charCodeAt(0)
                                          );
                                          const blob = new Blob([byteArray], {
                                            type: 'video/mp4'
                                          });
                                          newBlobUrl = URL.createObjectURL(blob);
                                        } catch {}

                                        setDmAttachmentsList((prev) =>
                                          prev.map((item, i) =>
                                            i === idx()
                                              ? {
                                                  ...item,
                                                  fileName: resData.file_name || item.fileName,
                                                  fileDataB64: resData.file_data,
                                                  fileSize: resData.file_size || item.fileSize,
                                                  thumbnailB64:
                                                    resData.thumbnail_data || item.thumbnailB64,
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
                                      const msg =
                                        e?.name === 'AbortError'
                                          ? 'Trimming timed out'
                                          : e?.message || 'Network error';
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
                              setDmAttachmentsList((prev) => prev.filter((_, i) => i !== idx()));
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
              onInput={(e) => setDmMessage(e.currentTarget.value)}
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
                  dmMediaCount() > 0
                    ? 'text-[#00a884]'
                    : 'text-[#8696a0] hover:text-[#00a884] hover:border-[#00a884]'
                }`}
                title="Attach Photos or Videos (Inline Media)"
                onClick={() => dmFileInputMediaRef?.click()}
              >
                <Camera
                  size={14}
                  class={dmMediaCount() > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'}
                />
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
                  dmDocCount() > 0
                    ? 'text-[#53bdeb]'
                    : 'text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb]'
                }`}
                title="Attach Documents or Raw Files"
                onClick={() => dmFileInputDocRef?.click()}
              >
                <Paperclip
                  size={14}
                  class={dmDocCount() > 0 ? 'text-[#53bdeb]' : 'text-[#8696a0]'}
                />
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
                  style={{
                    border: '1px solid #2a3942',
                    background: dmEmojiOpen() ? '#202c33' : '#111b21'
                  }}
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
                  style={{
                    border: '1px solid #2a3942',
                    background: dmFormatOpen() ? '#202c33' : '#111b21'
                  }}
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
                  <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-popover p-2 z-40 w-64 animate-popover space-y-1">
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
              {dmMessage().length} characters •{' '}
              {dmMessage().trim() ? dmMessage().trim().split(/\s+/).length : 0} words
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
                    <Show
                      when={dmAttachmentsList().some(
                        (a) => a.sendAs !== 'document' && a.mimeType.startsWith('image/')
                      )}
                    >
                      <div
                        class={`rounded-xl overflow-hidden mb-1 gap-1 bg-black/20 border border-black/10 ${
                          dmAttachmentsList().filter(
                            (a) => a.sendAs !== 'document' && a.mimeType.startsWith('image/')
                          ).length === 1
                            ? 'flex items-center justify-center max-h-52'
                            : 'grid grid-cols-2 max-h-56'
                        }`}
                      >
                        <For
                          each={dmAttachmentsList().filter(
                            (a) => a.sendAs !== 'document' && a.mimeType.startsWith('image/')
                          )}
                        >
                          {(att) => (
                            <div class="relative overflow-hidden aspect-square flex items-center justify-center bg-black/20">
                              <img
                                src={
                                  att.fileDataB64
                                    ? `data:${att.mimeType};base64,${att.fileDataB64}`
                                    : att.blobUrl || ''
                                }
                                alt="Photo Preview"
                                class="w-full h-full object-cover"
                              />
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>

                    {/* Playable Video Preview directly inside WhatsApp Bubble */}
                    <For
                      each={dmAttachmentsList().filter(
                        (a) => a.sendAs !== 'document' && a.mimeType.startsWith('video/')
                      )}
                    >
                      {(att) => (
                        <div class="relative rounded-xl overflow-hidden max-h-52 bg-black flex items-center justify-center border border-black/20 mb-1 shadow-md">
                          <video
                            src={
                              att.fileDataB64
                                ? `data:${att.mimeType};base64,${att.fileDataB64}`
                                : att.blobUrl || ''
                            }
                            poster={
                              att.thumbnailB64
                                ? `data:image/jpeg;base64,${att.thumbnailB64}`
                                : undefined
                            }
                            controls
                            preload="metadata"
                            playsinline
                            class="w-full h-auto max-h-48 rounded-xl object-contain bg-black cursor-pointer"
                          />
                        </div>
                      )}
                    </For>

                    {/* Document / Raw File Attachments */}
                    <For
                      each={dmAttachmentsList().filter(
                        (a) =>
                          a.sendAs === 'document' ||
                          (!a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/'))
                      )}
                    >
                      {(att) => (
                        <div class="p-2 px-2.5 rounded-xl bg-[#182229]/90 border border-[#2a3942] flex items-center gap-2 mb-1">
                          <div class="w-8 h-8 rounded-lg bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#53bdeb] shrink-0 font-bold uppercase text-[10px]">
                            <FileText size={16} />
                          </div>
                          <div class="min-w-0 flex-1">
                            <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                              {att.fileName}
                            </strong>
                            <span class="text-[10px] text-[#8696a0] block mt-0.5 font-mono">
                              {(att.fileSize / 1024).toFixed(1)} KB &bull;{' '}
                              {att.fileName.split('.').pop()?.toUpperCase()}
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
                      <span>
                        {new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
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
          onClick={props.onClose}
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
                  ? atts.map((a) => ({
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
          <Show when={isSendingDm()} fallback={<Send size={13} class="shrink-0" />}>
            <RefreshCw size={13} class="shrink-0 animate-spin" />
          </Show>
          <span>{isSendingDm() ? 'Sending...' : 'Send Now'}</span>
        </button>
      </div>
    </div>
  );
}
