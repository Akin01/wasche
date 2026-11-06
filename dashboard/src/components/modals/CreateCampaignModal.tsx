import { createSignal, onSettled, Show, For } from 'solid-js';
import { accounts, showToast, fetchCampaigns, switchView, setActiveModal } from '../store';
import { getAccountStatusState } from '../types';
import {
  EMOJIS,
  formatWhatsAppText,
  campName,
  setCampName,
  campAccounts,
  setCampAccounts,
  campTemplate,
  setCampTemplate,
  campMinDelay,
  setCampMinDelay,
  campMaxDelay,
  setCampMaxDelay,
  campAttachmentsList,
  setCampAttachmentsList,
  campTab,
  setCampTab,
  wrapText,
  insertToken,
  processAttachmentFile
} from './shared';
import {
  Users,
  ChevronDown,
  Check,
  CheckCheck,
  Clock,
  Paperclip,
  Smile,
  HelpCircle,
  Image as ImageIcon,
  Video,
  Scissors,
  Zap,
  X,
  Type,
  Eye,
  Camera,
  Trash2,
  FileText,
  Play,
  Crop,
  Plus
} from '../../icons';

export default function CreateCampaignModal(props: {
  preserveState?: boolean;
  onClose: () => void;
}) {
  const [campEmojiOpen, setCampEmojiOpen] = createSignal(false);
  const [campFormatOpen, setCampFormatOpen] = createSignal(false);
  const [campAccountDropdownOpen, setCampAccountDropdownOpen] = createSignal(false);
  let campAccountDropdownRef: HTMLDivElement | undefined;
  let campEmojiWrapRef: HTMLDivElement | undefined;
  let campFormatWrapRef: HTMLDivElement | undefined;
  let campFileInputMediaRef: HTMLInputElement | undefined;
  let campFileInputDocRef: HTMLInputElement | undefined;

  const campMediaCount = () =>
    campAttachmentsList().filter(
      (a) =>
        a.sendAs === 'media' || a.mimeType.startsWith('image/') || a.mimeType.startsWith('video/')
    ).length;
  const campDocCount = () =>
    campAttachmentsList().filter(
      (a) =>
        a.sendAs === 'document' &&
        !a.mimeType.startsWith('image/') &&
        !a.mimeType.startsWith('video/')
    ).length;

  onSettled(() => {
    if (!props.preserveState) {
      setCampName('');
      setCampAccounts(accounts().map((a) => a.account_id));
      setCampTemplate('Hello {name}, this is an automated announcement.');
      setCampMinDelay('20');
      setCampMaxDelay('45');
      setCampAttachmentsList([]);
      setCampTab('editor');
    }
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (campAccountDropdownRef && !campAccountDropdownRef.contains(target))
        setCampAccountDropdownOpen(false);
      if (campEmojiWrapRef && !campEmojiWrapRef.contains(target)) setCampEmojiOpen(false);
      if (campFormatWrapRef && !campFormatWrapRef.contains(target)) setCampFormatOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  });

  return (
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
          onInput={(e) => setCampName(e.currentTarget.value)}
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
            campAccountDropdownOpen()
              ? 'border-[#00a884] shadow-[0_0_0_2px_rgba(0,168,132,0.15)]'
              : ''
          }`}
          onClick={() => setCampAccountDropdownOpen(!campAccountDropdownOpen())}
        >
          <div class="flex items-center gap-1.5 flex-wrap min-w-0 flex-1 py-0.5">
            <Show
              when={campAccounts().length > 0}
              fallback={<span class="text-[#8696a0]">Select sender accounts...</span>}
            >
              <Show
                when={campAccounts().length === accounts().length && accounts().length > 1}
                fallback={
                  <For each={campAccounts()}>
                    {(accId) => (
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
          <div class="absolute left-0 right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-dropdown p-2 z-[100] animate-popover space-y-2">
            {/* Header Actions: Select All, Active Only */}
            <div class="flex items-center justify-between pb-2 border-b border-[#222d34] px-1">
              <span class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0]">
                Select Senders ({campAccounts().length}/{accounts().length})
              </span>
              <div class="flex items-center gap-1.5">
                <button
                  type="button"
                  class="px-2 py-0.5 rounded text-[10.5px] font-semibold bg-[#202c33] hover:bg-[#2a3942] text-[#00a884] border border-[#00a884]/30 hover:border-[#00a884] transition-colors cursor-pointer flex items-center gap-1"
                  onClick={() => setCampAccounts(accounts().map((a) => a.account_id))}
                >
                  <Check size={10} stroke-width={2.5} />
                  <span>Select All</span>
                </button>
                <button
                  type="button"
                  class="px-2 py-0.5 rounded text-[10.5px] font-medium bg-[#111b21] hover:bg-[#202c33] text-[#8696a0] hover:text-[#e9edef] border border-[#2a3942] transition-colors cursor-pointer"
                  onClick={() => {
                    const active =
                      accounts().find((a) => a.is_active)?.account_id || accounts()[0]?.account_id;
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
                {(acc) => {
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
                            setCampAccounts(current.filter((id) => id !== acc.account_id));
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
                {campAccounts().length} Account{campAccounts().length > 1 ? 's' : ''} in
                Multi-Sender Pool
              </strong>
              <span class="text-[10px] font-mono font-bold text-[#00a884] bg-[#00a884]/15 px-2 py-0.5 rounded-full border border-[#00a884]/25">
                ~{campAccounts().length * 90} msgs/hr ({campAccounts().length}x Parallel Speed)
              </span>
            </div>
            <p class="text-[10.5px] text-[#8696a0] mt-0.5 leading-relaxed">
              Parallel multi-worker pipeline dispatches messages simultaneously across the selected
              accounts in the dropdown.
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
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                'box-shadow': 'none'
              }}
              class={`relative z-10 flex-1 py-1.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 ${
                campTab() === 'editor'
                  ? 'text-[#00a884] font-bold'
                  : 'text-[#8696a0] hover:text-[#e9edef] font-medium'
              }`}
              onClick={() => setCampTab('editor')}
            >
              <Type
                size={13}
                class={campTab() === 'editor' ? 'text-[#00a884]' : 'text-[#8696a0]'}
              />
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
                campTab() === 'preview'
                  ? 'text-[#00a884] font-bold'
                  : 'text-[#8696a0] hover:text-[#e9edef] font-medium'
              }`}
              onClick={() => setCampTab('preview')}
            >
              <Eye
                size={13}
                class={campTab() === 'preview' ? 'text-[#00a884]' : 'text-[#8696a0]'}
              />
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
          onChange={async (e) => {
            const files = Array.from(e.currentTarget.files || []);
            for (const file of files) {
              const att = await processAttachmentFile(file, 'media');
              if (att) {
                setCampAttachmentsList((prev) => [...prev, att]);
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
          onChange={async (e) => {
            const files = Array.from(e.currentTarget.files || []);
            for (const file of files) {
              const att = await processAttachmentFile(file, 'document');
              if (att) {
                setCampAttachmentsList((prev) => [...prev, att]);
              }
            }
            e.currentTarget.value = '';
          }}
        />

        {/* 1. EDITOR TAB VIEW */}
        <Show when={campTab() === 'editor'}>
          {/* Attached Files List if any */}
          <Show when={campAttachmentsList().length > 0}>
            <div class="mb-3 p-3 bg-[#141f26] border border-[#2a3942] rounded-xl space-y-2.5 animate-fade">
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
                                  setCampAttachmentsList((prev) =>
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
                                  returnToCreateCampaign: true,
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
                                    setCampAttachmentsList((prev) =>
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
                                  videoUrl:
                                    att.blobUrl ||
                                    (att.fileDataB64
                                      ? `data:${att.mimeType};base64,${att.fileDataB64}`
                                      : ''),
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
                                          const byteArray = Uint8Array.from(byteChars, (c) =>
                                            c.charCodeAt(0)
                                          );
                                          const blob = new Blob([byteArray], {
                                            type: 'video/mp4'
                                          });
                                          newBlobUrl = URL.createObjectURL(blob);
                                        } catch {}
                                        setCampAttachmentsList((prev) =>
                                          prev.map((item, i) =>
                                            i === idx()
                                              ? {
                                                  ...item,
                                                  fileDataB64: resData.file_data,
                                                  fileSize:
                                                    resData.file_size ||
                                                    Math.round((resData.file_data.length * 3) / 4),
                                                  thumbnailB64:
                                                    resData.thumbnail_data || item.thumbnailB64,
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
                              setCampAttachmentsList((prev) => prev.filter((_, i) => i !== idx()));
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
              onInput={(e) => setCampTemplate(e.currentTarget.value)}
              placeholder="Hello {name}, this is an automated announcement."
            />

            {/* Floating Bottom-Left Dynamic Personalization Tags */}
            <div class="absolute left-2.5 bottom-2.5 flex items-center gap-1.5 z-20">
              <button
                type="button"
                style={{ border: '1px solid #2a3942', background: '#182229' }}
                class="h-7 px-2.5 rounded-lg text-xs font-mono font-semibold text-[#00a884] hover:bg-[#202c33] hover:border-[#00a884] flex items-center gap-1 transition-colors cursor-pointer active:scale-95 shadow-xs"
                onClick={() =>
                  insertToken(
                    'createCampTemplateTextarea',
                    campTemplate,
                    setCampTemplate,
                    ' {name}'
                  )
                }
                title="Insert {name} personalization tag"
              >
                +{'{name}'}
              </button>
              <button
                type="button"
                style={{ border: '1px solid #2a3942', background: '#182229' }}
                class="h-7 px-2.5 rounded-lg text-xs font-mono font-semibold text-[#00a884] hover:bg-[#202c33] hover:border-[#00a884] flex items-center gap-1 transition-colors cursor-pointer active:scale-95 shadow-xs"
                onClick={() =>
                  insertToken(
                    'createCampTemplateTextarea',
                    campTemplate,
                    setCampTemplate,
                    ' {phone}'
                  )
                }
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
                  campMediaCount() > 0
                    ? 'text-[#00a884]'
                    : 'text-[#8696a0] hover:text-[#00a884] hover:border-[#00a884]'
                }`}
                title="Attach Photos or Videos (Inline Media)"
                onClick={() => campFileInputMediaRef?.click()}
              >
                <Camera
                  size={14}
                  class={campMediaCount() > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'}
                />
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
                  campDocCount() > 0
                    ? 'text-[#53bdeb]'
                    : 'text-[#8696a0] hover:text-[#53bdeb] hover:border-[#53bdeb]'
                }`}
                title="Attach Raw Documents or Files"
                onClick={() => campFileInputDocRef?.click()}
              >
                <Paperclip
                  size={14}
                  class={campDocCount() > 0 ? 'text-[#53bdeb]' : 'text-[#8696a0]'}
                />
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
                  style={{
                    border: '1px solid #2a3942',
                    background: campEmojiOpen() ? '#202c33' : '#111b21'
                  }}
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
                              insertToken(
                                'createCampTemplateTextarea',
                                campTemplate,
                                setCampTemplate,
                                em
                              );
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
                  style={{
                    border: '1px solid #2a3942',
                    background: campFormatOpen() ? '#202c33' : '#111b21'
                  }}
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
                  <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-popover p-2 z-40 w-64 animate-popover space-y-1">
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
                        wrapText(
                          'createCampTemplateTextarea',
                          campTemplate,
                          setCampTemplate,
                          '```'
                        );
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
              {campTemplate().length} characters •{' '}
              {campTemplate().trim() ? campTemplate().trim().split(/\s+/).length : 0} words
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
                    <Show
                      when={campAttachmentsList().some(
                        (a) => a.sendAs !== 'document' && a.mimeType.startsWith('image/')
                      )}
                    >
                      <div
                        class={`rounded-xl overflow-hidden mb-1 gap-1 bg-black/20 border border-black/10 ${
                          campAttachmentsList().filter(
                            (a) => a.sendAs !== 'document' && a.mimeType.startsWith('image/')
                          ).length === 1
                            ? 'flex items-center justify-center max-h-52'
                            : 'grid grid-cols-2 max-h-56'
                        }`}
                      >
                        <For
                          each={campAttachmentsList().filter(
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
                      each={campAttachmentsList().filter(
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
                      each={campAttachmentsList().filter(
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

                    {/* Formatted Template Text with {name} and {phone} interpolated and WhatsApp markdown */}
                    <Show when={campTemplate().trim().length > 0}>
                      <div
                        class="leading-relaxed m-0 text-xs break-words"
                        innerHTML={formatWhatsAppText(campTemplate(), 'Budi', '+62 812-3456-7890')}
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

      {/* 4. Anti-Ban Jitter Window */}
      <div class="bg-[#111b21] border border-[#2a3942] p-3 rounded-xl space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-xs font-semibold uppercase tracking-wider text-[#8696a0] flex items-center gap-1.5">
            <Clock size={13} class="text-[#00a884]" /> Anti-Ban Pacing Jitter Window
          </span>
          <span class="text-[10.5px] font-mono text-[#8696a0]">
            Avg: ~{((parseInt(campMinDelay()) || 20) + (parseInt(campMaxDelay()) || 45)) / 2}s /
            message
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
              onInput={(e) => setCampMinDelay(e.currentTarget.value)}
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
              onInput={(e) => setCampMaxDelay(e.currentTarget.value)}
            />
          </div>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
        <button
          class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
        >
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
              const accPayload =
                selectedAccs.length === 0
                  ? accounts()[0]?.account_id || 'default'
                  : selectedAccs.length === accounts().length
                    ? 'all'
                    : selectedAccs.join(', ');

              const res = await fetch('/api/campaigns/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name,
                  template_body: campTemplate(),
                  account_id: accPayload,
                  accounts: selectedAccs,
                  files: campAttachmentsList().map((a) => ({
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
  );
}
