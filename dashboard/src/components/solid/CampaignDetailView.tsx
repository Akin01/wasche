import { createSignal, createMemo, createEffect, onMount, onCleanup, Show, For, Switch, Match, ErrorBoundary } from 'solid-js';
import {
  accounts,
  switchView,
  selectedCampaignDetails,
  selectedRunId,
  setSelectedRunId,
  detailTab,
  setDetailTab,
  controlCampaign,
  deleteCampaign,
  deleteRecipient,
  resendRecipient,
  updateCampaignTemplate,
  setActiveModal,
  campaignAttachments,
  fetchCampaignAttachments,
  uploadCampaignAttachments,
  deleteCampaignAttachment,
  updateAttachmentMode
} from './store';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { Progress } from '@kobalte/core/progress';
import { Checkbox } from '@kobalte/core/checkbox';
import {
  Smartphone,
  CheckCheck,
  AlertCircle,
  Clock,
  Play,
  Pause,
  RotateCw,
  RefreshCw,
  Trash2,
  Users,
  FileText,
  History,
  Search,
  Plus,
  Send,
  Check,
  ChevronDown,
  ArrowLeft,
  Smile,
  HelpCircle,
  Paperclip,
  Mic,
  MoreVertical,
  Bold,
  Italic,
  Code,
  Square,
  X,
  Image,
  Video,
  FileUp,
  Scissors,
  Zap,
  Camera,
  Crop,
  Inbox
} from 'lucide-solid';
export default function CampaignDetailView() {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedRecipientIds, setSelectedRecipientIds] = createSignal<number[]>([]);
  const [templateText, setTemplateText] = createSignal<string | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = createSignal(false);
  const [formatHelperOpen, setFormatHelperOpen] = createSignal(false);
  const [runDropdownOpen, setRunDropdownOpen] = createSignal(false);

  let emojiWrapRef: HTMLDivElement | undefined;
  let formatWrapRef: HTMLDivElement | undefined;
  let runDropdownRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let fileInputMediaRef: HTMLInputElement | undefined;
  let fileInputDocRef: HTMLInputElement | undefined;

  const mediaCount = () => campaignAttachments().filter(a => a.send_as !== 'document').length;
  const docCount = () => campaignAttachments().filter(a => a.send_as === 'document').length;
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

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const base64Data = dataUrl.split(',')[1];
      if (!base64Data) continue;

      let thumbnailB64: string | undefined;

      if (isImg) {
        try {
          const img = document.createElement('img');
          img.src = dataUrl;
          if (typeof Promise.withResolvers === 'function') {
            const { promise, resolve } = Promise.withResolvers<void>();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 3000);
            await promise;
          } else {
            await new Promise<void>(r => {
              img.onload = () => r();
              img.onerror = () => r();
              setTimeout(r, 3000);
            });
          }
          const canvas = document.createElement('canvas');
          const maxDim = 120;
          let w = img.width || maxDim;
          let h = img.height || maxDim;
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, w, h);
          thumbnailB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        } catch {}
      } else if (isVid) {
        try {
          const vid = document.createElement('video');
          vid.src = dataUrl;
          vid.muted = true;
          vid.playsInline = true;
          if (typeof Promise.withResolvers === 'function') {
            const { promise, resolve } = Promise.withResolvers<void>();
            vid.onloadeddata = () => { vid.currentTime = 0.5; };
            vid.onseeked = () => resolve();
            vid.onerror = () => resolve();
            setTimeout(resolve, 3000);
            await promise;
          } else {
            await new Promise<void>(r => {
              vid.onloadeddata = () => { vid.currentTime = 0.5; };
              vid.onseeked = () => r();
              vid.onerror = () => r();
              setTimeout(r, 3000);
            });
          }
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
      await uploadCampaignAttachments(c().id, filesPayload);
    }
    target.value = '';
  };

  createEffect(() => {
    const id = c().id;
    if (id > 0) {
      fetchCampaignAttachments(id);
    }
  });

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiPickerOpen() && emojiWrapRef && !emojiWrapRef.contains(target)) {
        setEmojiPickerOpen(false);
      }
      if (formatHelperOpen() && formatWrapRef && !formatWrapRef.contains(target)) {
        setFormatHelperOpen(false);
      }
      if (runDropdownOpen() && runDropdownRef && !runDropdownRef.contains(target)) {
        setRunDropdownOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEmojiPickerOpen(false);
        setFormatHelperOpen(false);
        setRunDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    onCleanup(() => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    });
  });

  const EMOJIS = ['👍', '❤️', '🔥', '👏', '🙏', '🎉', '😊', '🚀', '✅', '✨', '💯', '👋', '⭐', '🤝', '💼', '📌', '🔔', '📢', '🎁', '⚡', '💬', '📱', '📦', '🎯'];
  const campaign = () => selectedCampaignDetails()?.campaign;
  const c = () => campaign() || {
    id: 0,
    name: '',
    status: 'pending',
    account_id: '',
    template_body: '',
    total_count: 0,
    sent_count: 0,
    failed_count: 0,
    min_delay_secs: 20,
    max_delay_secs: 45,
    created_at: 0,
    updated_at: 0
  };
  const recipients = () => selectedCampaignDetails()?.recent_recipients || [];
  const runs = () => selectedCampaignDetails()?.runs || [];
  const logs = () => selectedCampaignDetails()?.recent_logs || [];
  const abortedCount = () => recipients().filter(r => r.status === 'cancelled' || r.status === 'aborted').length;

  const currentRun = () => {
    const list = runs();
    const selId = selectedRunId();
    return list.find(r => r.id === selId) || list[0];
  };

  const displayRunRows = createMemo(() => {
    const run = currentRun();
    if (!run) return [];

    const runLogs = (logs() || []).filter(l => l.run_id === run.id);
    // 1. If this run is COMPLETED:
    // It is a historical finished execution. ONLY display the actual delivery logs recorded for this run!
    if (run.status === 'completed') {
      return runLogs.map((l, i) => ({
        id: l.id,
        recipient_id: l.recipient_id,
        num: i + 1,
        name: l.display_name || l.phone_number,
        phone: l.phone_number,
        jid: l.jid,
        sender: l.sender_account,
        status: l.status,
        detail: l.message_id ? `ID: ${l.message_id}` : (l.error_reason || '—'),
        timestamp: l.timestamp ? new Date(l.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
      }));
    }

    // 2. If this run is ABORTED:
    // Show delivered messages as SENT, and show remaining recipients cancelled by abort as ABORTED!
    // When an aborted recipient is resent, its status immediately updates to SENT!
    if (run.status === 'aborted') {
      const allRecipients = recipients();
      const allCampaignLogs = logs() || [];
      const logMap = new Map();
      for (const l of runLogs) {
        if (l.recipient_id) logMap.set(l.recipient_id, l);
        logMap.set(l.jid, l);
      }

      return allRecipients.map((r, i) => {
        const log = logMap.get(r.id) || logMap.get(r.jid);
        if (log) {
          return {
            id: r.id,
            recipient_id: r.id,
            num: i + 1,
            name: log.display_name || r.display_name || r.phone_number,
            phone: log.phone_number || r.phone_number,
            jid: log.jid || r.jid,
            sender: log.sender_account,
            status: log.status,
            detail: log.message_id ? `ID: ${log.message_id}` : (log.error_reason || '—'),
            timestamp: log.timestamp ? new Date(log.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
          };
        }

        // Check if this recipient was resent afterwards or is in progress
        const resentLog = allCampaignLogs.find(l => (l.recipient_id === r.id || l.jid === r.jid) && l.status === 'sent');
        if (resentLog || r.status === 'sent') {
          return {
            id: r.id,
            recipient_id: r.id,
            num: i + 1,
            name: resentLog?.display_name || r.display_name || r.phone_number,
            phone: resentLog?.phone_number || r.phone_number,
            jid: resentLog?.jid || r.jid,
            status: 'sent',
            detail: resentLog?.message_id ? `ID: ${resentLog.message_id} (Resent)` : 'Resent & delivered',
            timestamp: resentLog?.timestamp
              ? new Date(resentLog.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : (r.sent_at ? new Date(r.sent_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Resent')
          };
        }

        if (r.status === 'typing') {
          return {
            id: r.id,
            recipient_id: r.id,
            num: i + 1,
            name: r.display_name || r.phone_number,
            phone: r.phone_number,
            jid: r.jid,
            status: 'typing',
            detail: 'Simulating typing presence...',
            timestamp: 'In progress'
          };
        }

        if (r.status === 'queued') {
          return {
            id: r.id,
            recipient_id: r.id,
            num: i + 1,
            name: r.display_name || r.phone_number,
            phone: r.phone_number,
            jid: r.jid,
            status: 'queued',
            detail: 'Requeued for delivery...',
            timestamp: 'Queued'
          };
        }

        return {
          id: r.id,
          recipient_id: r.id,
          num: i + 1,
          name: r.display_name || r.phone_number,
          phone: r.phone_number,
          jid: r.jid,
          status: 'aborted',
          detail: 'Aborted before dispatch',
          timestamp: run.completed_at
            ? new Date(run.completed_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : 'Aborted'
        };
      });
    }

    // 3. Otherwise (RUNNING or PAUSED run):
    // Show real-time progress: delivered as SENT, active as TYPING, remaining as QUEUED!
    const allRecipients = recipients();
    const logMap = new Map();
    for (const l of runLogs) {
      if (l.recipient_id) logMap.set(l.recipient_id, l);
      logMap.set(l.jid, l);
    }

    return allRecipients.map((r, i) => {
      const log = logMap.get(r.id) || logMap.get(r.jid);
      if (log) {
        return {
          id: r.id,
          recipient_id: r.id,
          num: i + 1,
          name: log.display_name || r.display_name || r.phone_number,
          phone: log.phone_number || r.phone_number,
          jid: log.jid || r.jid,
          sender: log.sender_account,
          status: log.status,
          detail: log.message_id ? `ID: ${log.message_id}` : (log.error_reason || '—'),
          timestamp: log.timestamp ? new Date(log.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'
        };
      }

      return {
        id: r.id,
        recipient_id: r.id,
        num: i + 1,
        name: r.display_name || r.phone_number,
        phone: r.phone_number,
        jid: r.jid,
        status: r.status === 'typing' ? 'typing' : 'queued',
        detail: r.status === 'typing' ? 'Simulating typing presence...' : 'Waiting in delivery queue',
        timestamp: r.status === 'typing' ? 'In progress' : 'Queued'
      };
    });
  });

  const totalDeliveredAcrossRuns = createMemo(() => {
    const list = runs();
    const c = campaign();
    return list.length > 0 ? list.reduce((sum, r) => sum + r.sent_count, 0) : (c?.sent_count || 0);
  });

  const totalFailsAcrossRuns = createMemo(() => {
    const list = runs();
    const c = campaign();
    return list.length > 0 ? list.reduce((sum, r) => sum + r.failed_count, 0) : (c?.failed_count || 0);
  });

  const filteredRecipients = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    if (!q) return recipients();
    return recipients().filter(r =>
      (r.display_name && r.display_name.toLowerCase().includes(q)) ||
      r.phone_number.includes(q) ||
      r.jid.includes(q)
    );
  });

  const currentTemplate = () =>
    templateText() !== null ? templateText()! : campaign()?.template_body || '';

  const livePreview = () => {
    const text = currentTemplate();
    const sample = recipients()[0];
    const name = sample?.display_name || 'John Doe';
    const phone = sample?.phone_number || '+62 812-3456-7890';
    return text.replace(/{name}/g, name).replace(/{phone}/g, phone);
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRecipientIds(filteredRecipients().map(r => r.id));
    } else {
      setSelectedRecipientIds([]);
    }
  };

  const toggleSelectRecipient = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRecipientIds(prev => [...prev, id]);
    } else {
      setSelectedRecipientIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleDeleteSelectedRecipients = () => {
    const ids = selectedRecipientIds();
    const c = campaign();
    if (!c || ids.length === 0) return;
    setActiveModal({
      type: 'confirm',
      title: 'Remove Target Contacts',
      message: `Are you sure you want to remove ${ids.length} selected contact(s) from this campaign?`,
      onConfirm: async () => {
        for (const rid of ids) {
          await deleteRecipient(c.id, rid);
        }
        setSelectedRecipientIds([]);
      }
    });
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
    const next = cur.slice(0, start) + token + cur.slice(end);
    setTemplateText(next);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 10);
  };

  const formatWhatsAppText = (raw: string, sampleName = 'Zhidan', samplePhone = '+62 853-8922-9489') => {
    if (!raw) {
      return '<span style="color:#8696a0; font-style:italic;">Type your broadcast message...</span>';
    }
    let text = raw;
    text = text.replace(/\{\{name\}\}|\{name\}/gi, sampleName);
    text = text.replace(/\{\{phone\}\}|\{phone\}/gi, samplePhone);
    text = text.replace(/\{\{first_name\}\}|\{first_name\}/gi, sampleName.split(' ')[0]);
    text = text.replace(/\{\{jid\}\}|\{jid\}/gi, `${samplePhone.replace(/\D/g, '')}@s.whatsapp.net`);

    text = text
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

  return (
    <ErrorBoundary fallback={err => <div class="p-8 text-red-500 font-bold bg-[#182229] border border-red-500 rounded-xl m-4">RENDER ERROR: {String(err?.message || err)}<pre class="text-xs text-red-300 mt-2 whitespace-pre-wrap">{String(err?.stack)}</pre></div>}>
      <Show when={campaign()} fallback={<div class="p-8 text-center text-[#8696a0]">Loading campaign details...</div>}>
      <div class="space-y-6">
          {/* Top Action Bar */}
          <div class="flex items-center justify-between flex-wrap gap-4">
            <button
              style={{ border: '1px solid #2a3942', background: '#182229' }}
              class="h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer hover:border-[#00a884] text-[#e9edef] transition-colors"
              onClick={() => switchView('campaigns')}
              title="Back to Campaigns list"
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>

            <div class="flex items-center gap-2 flex-wrap">
              <Show when={c().status === 'pending' || c().status === 'draft'}>
                <button
                  class="h-8 px-3.5 text-xs font-semibold rounded-xl bg-[#00a884] hover:bg-[#00c49f] text-[#111b21] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  onClick={() => controlCampaign(c().id, 'resume')}
                >
                  <Play size={13} />
                  <span>Start Campaign</span>
                </button>
              </Show>

              <Show when={c().status === 'running'}>
                <button
                  class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-[#2a3942] hover:border-[#ffbc38] text-[#e9edef] hover:text-[#ffbc38] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  onClick={() => controlCampaign(c().id, 'pause')}
                >
                  <Pause size={13} />
                  <span>Pause</span>
                </button>
              </Show>

              <Show when={c().status === 'paused'}>
                <button
                  class="h-8 px-3.5 text-xs font-semibold rounded-xl bg-[#00a884] hover:bg-[#00c49f] text-[#111b21] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  onClick={() => controlCampaign(c().id, 'resume')}
                >
                  <Play size={13} />
                  <span>Resume</span>
                </button>
              </Show>

              <Show when={c().status === 'running' || c().status === 'paused'}>
                <button
                  class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#f15c6d]/10 hover:bg-[#f15c6d]/20 border border-[#f15c6d]/40 hover:border-[#f15c6d] text-[#f15c6d] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  title="Abort active broadcast run"
                  onClick={() =>
                    setActiveModal({
                      type: 'confirm',
                      title: 'Abort Broadcast Campaign',
                      message: `Are you sure you want to abort the current broadcast run for '${c().name}'? Remaining queued messages will be cancelled.`,
                      onConfirm: () => controlCampaign(c().id, 'abort')
                    })
                  }
                >
                  <Square size={11} fill="currentColor" />
                  <span>Abort</span>
                </button>
              </Show>

              <Show when={c().status === 'completed' || c().status === 'aborted'}>
                <button
                  class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#00a884]/15 hover:bg-[#00a884]/25 border border-[#00a884]/40 hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  onClick={() => controlCampaign(c().id, 'rerun')}
                >
                  <RotateCw size={13} />
                  <span>Re-run All</span>
                </button>
              </Show>

              <Show when={abortedCount() > 0 && c().status !== 'running'}>
                <button
                  class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#ffbc38]/10 hover:bg-[#ffbc38]/20 border border-[#ffbc38]/40 hover:border-[#ffbc38] text-[#ffbc38] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  title="Resend all aborted messages in a new run"
                  onClick={() => controlCampaign(c().id, 'resend_aborted')}
                >
                  <RotateCw size={12} />
                  <span>Resend Aborted ({abortedCount()})</span>
                </button>
              </Show>

              <Show when={c().failed_count > 0}>
                <button
                  class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#53bdeb]/10 hover:bg-[#53bdeb]/20 border border-[#53bdeb]/40 hover:border-[#53bdeb] text-[#53bdeb] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  title="Retry only failed recipients in a new run"
                  onClick={() => controlCampaign(c().id, 'retry_failed')}
                >
                  <RefreshCw size={13} />
                  <span>Retry Failed ({c().failed_count})</span>
                </button>
              </Show>

              <button
                class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#202c33] hover:bg-[#f15c6d]/15 border border-[#2a3942] hover:border-[#f15c6d]/50 text-[#8696a0] hover:text-[#f15c6d] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                onClick={() =>
                  setActiveModal({
                    type: 'confirm',
                    title: 'Delete Campaign',
                    message: `Are you sure you want to permanently delete campaign '${c().name}'?`,
                    onConfirm: () => deleteCampaign(c().id)
                  })
                }
              >
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Top 4 Global Macro Stat Cards */}
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Sender Account / Multi-Sender Pool Stat Card */}
            {(() => {
              const isMulti = () => c().account_id.includes(',') || c().account_id.trim().toLowerCase() === 'all';
              const poolList = () => {
                if (c().account_id.trim().toLowerCase() === 'all') {
                  return accounts().map(a => a.account_id);
                }
                return c().account_id.split(',').map(s => s.trim()).filter(Boolean);
              };

              return (
                <div class="metric-card p-4 flex flex-col justify-between">
                  <div class="flex items-center justify-between w-full mb-1">
                    <span class="text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">
                      {isMulti() ? 'Sender Pool' : 'Sender Account'}
                    </span>
                    <Show when={isMulti()}>
                      <span class="text-[10px] font-bold text-[#00a884] bg-[#00a884]/15 border border-[#00a884]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Zap size={10} />
                        <span>{poolList().length}x Parallel</span>
                      </span>
                    </Show>
                  </div>

                  <div class="flex items-center justify-between w-full gap-3">
                    <div class="min-w-0 flex-1">
                      <Show
                        when={isMulti()}
                        fallback={
                          <div>
                            <div class="text-xl font-bold text-[#e9edef] truncate" title={c().account_id}>
                              {c().account_id}
                            </div>
                            <span class="text-[11px] text-[#8696a0] font-mono block mt-0.5 truncate">
                              {accounts().find(a => a.account_id === c().account_id)?.phone_number
                                ? `+${accounts().find(a => a.account_id === c().account_id)?.phone_number}`
                                : 'Dedicated WhatsApp Line'}
                            </span>
                          </div>
                        }
                      >
                        <div>
                          <div class="text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
                            <span>{poolList().length}</span>
                            <span class="text-xs font-normal text-[#8696a0]">Senders Active</span>
                          </div>
                          {/* Sender Account Chips */}
                          <div class="flex items-center gap-1.5 mt-1.5 overflow-x-auto pb-0.5 max-w-full">
                            <For each={poolList()}>
                              {acc => (
                                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#202c33] border border-[#2a3942] text-[10.5px] text-[#e9edef] font-medium shrink-0">
                                  <span class="w-3.5 h-3.5 rounded-full bg-[#00a884]/20 text-[#00a884] font-bold text-[8.5px] flex items-center justify-center">
                                    {acc.charAt(0).toUpperCase()}
                                  </span>
                                  <span class="truncate max-w-[70px]">{acc}</span>
                                </span>
                              )}
                            </For>
                          </div>
                        </div>
                      </Show>
                    </div>

                    <div class="metric-icon-wrap text-[#53bdeb] shrink-0">
                      <Show when={isMulti()} fallback={<Smartphone size={20} />}>
                        <Users size={20} />
                      </Show>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div class="metric-card">
              <div class="metric-info">
                <div class="metric-label">Total Messages Delivered</div>
                <div class="metric-val text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
                  <span>{totalDeliveredAcrossRuns()}</span>
                  <span class="text-xs font-normal text-[#8696a0]">Sent</span>
                </div>
              </div>
              <div class="metric-icon-wrap text-[#00a884]">
                <CheckCheck size={20} />
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-info">
                <div class="metric-label">Total Fails</div>
                <div class="metric-val text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
                  <span>{totalFailsAcrossRuns()}</span>
                  <span class="text-xs font-normal text-[#8696a0]">Failed</span>
                </div>
              </div>
              <div
                class={`metric-icon-wrap ${
                  totalFailsAcrossRuns() > 0 ? 'text-[#f15c6d]' : 'text-[#8696a0]'
                }`}
              >
                <AlertCircle size={20} />
              </div>
            </div>

            <div class="metric-card">
              <div class="metric-info">
                <div class="metric-label">Anti-Ban Delay Jitter Range</div>
                <div class="metric-val text-xl font-bold text-[#e9edef]">
                  {c().min_delay_secs}s &ndash; {c().max_delay_secs}s
                </div>
              </div>
              <div class="metric-icon-wrap text-[#8696a0]">
                <Clock size={20} />
              </div>
            </div>
          </div>

          {/* Subviews Tabs (Target Contacts / Message Template / Run Logs) with Smooth Moving Transition */}
          <div class="mb-4">
            <div class="relative inline-flex items-center p-1 bg-[#111b21] border border-[#222d34] rounded-xl overflow-hidden text-xs w-full max-w-[560px]">
              {/* Smooth hardware-accelerated animated sliding active background pill */}
              <div
                class="absolute top-1 bottom-1 rounded-lg transition-all duration-250 ease-out pointer-events-none z-0"
                style={{
                  width: 'calc((100% - 8px) / 3)',
                  left: '4px',
                  transform:
                    detailTab() === 'contacts'
                      ? 'translateX(0%)'
                      : detailTab() === 'template'
                      ? 'translateX(100%)'
                      : 'translateX(200%)',
                  background: '#202c33',
                  border: '1px solid #00a884',
                  'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 168, 132, 0.2)'
                }}
              />

              <button
                type="button"
                style={{ border: 'none', background: 'transparent' }}
                class={`relative z-10 flex-1 h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 select-none ${
                  detailTab() === 'contacts'
                    ? 'text-[#e9edef]'
                    : 'text-[#8696a0] hover:text-[#e9edef]'
                }`}
                onClick={() => setDetailTab('contacts')}
              >
                <Users size={14} class={detailTab() === 'contacts' ? 'text-[#00a884]' : ''} />
                <span class="truncate">Target Contacts ({recipients().length})</span>
              </button>

              <button
                type="button"
                style={{ border: 'none', background: 'transparent' }}
                class={`relative z-10 flex-1 h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 select-none ${
                  detailTab() === 'template'
                    ? 'text-[#e9edef]'
                    : 'text-[#8696a0] hover:text-[#e9edef]'
                }`}
                onClick={() => setDetailTab('template')}
              >
                <FileText size={14} class={detailTab() === 'template' ? 'text-[#00a884]' : ''} />
                <span class="truncate">Message Template</span>
              </button>

              <button
                type="button"
                style={{ border: 'none', background: 'transparent' }}
                class={`relative z-10 flex-1 h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 select-none ${
                  detailTab() === 'runs'
                    ? 'text-[#e9edef]'
                    : 'text-[#8696a0] hover:text-[#e9edef]'
                }`}
                onClick={() => setDetailTab('runs')}
              >
                <History size={14} class={detailTab() === 'runs' ? 'text-[#00a884]' : ''} />
                <span class="truncate">Run Logs ({runs().length})</span>
              </button>
            </div>
          </div>
            {/* TAB 1: TARGET CONTACTS */}
            <Show when={detailTab() === 'contacts'}>
              <div class="card rounded-2xl p-0 overflow-hidden">
                <div class="p-3.5 px-6 border-b border-[#222d34] flex items-center justify-between flex-wrap gap-4">
                  <div class="relative w-72">
                    <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]" />
                    <input
                      type="text"
                      placeholder="Search contacts..."
                      class="w-full bg-[#111b21] border border-[#2a3942] rounded-lg pl-8 pr-3 h-8 text-xs text-[#e9edef] focus:outline-none focus:border-[#00a884]"
                      value={searchQuery()}
                      onInput={e => setSearchQuery(e.currentTarget.value)}
                    />
                  </div>

                  <Show
                    when={selectedRecipientIds().length > 0}
                    fallback={
                      <button
                        class="btn-accent h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                        onClick={() => setActiveModal({ type: 'add_contacts', campaignId: c().id })}
                      >
                        <Plus size={13} />
                        <span>Add</span>
                      </button>
                    }
                  >
                    <button
                      class="btn-danger h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer animate-in fade-in duration-150"
                      onClick={handleDeleteSelectedRecipients}
                    >
                      <Trash2 size={13} />
                      <span>Delete Selected ({selectedRecipientIds().length})</span>
                    </button>
                  </Show>
                </div>

                <div class="table-responsive">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', 'text-align': 'center' }}>
                          <Checkbox
                            checked={
                              filteredRecipients().length > 0 &&
                              selectedRecipientIds().length === filteredRecipients().length
                            }
                            onChange={checked => toggleSelectAll(checked)}
                          >
                            <Checkbox.Input class="sr-only" />
                            <Checkbox.Control class="w-4 h-4 rounded border border-[#2a3942] bg-[#182229] flex items-center justify-center cursor-pointer">
                              <Checkbox.Indicator>
                                <Check size={11} class="text-[#00a884]" />
                              </Checkbox.Indicator>
                            </Checkbox.Control>
                          </Checkbox>
                        </th>
                        <th style={{ width: '45px' }}>#</th>
                        <th>Contact Name</th>
                        <th>Phone Number</th>
                        <th>WhatsApp JID</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Show
                        when={filteredRecipients().length > 0}
                        fallback={
                          <tr>
                            <td colspan="6" class="text-center py-12 text-[#8696a0]">
                              No target contacts in this campaign. Click 'Add' to populate your queue.
                            </td>
                          </tr>
                        }
                      >
                        <For each={filteredRecipients()}>
                          {(r, idx) => {
                            const isChecked = () => selectedRecipientIds().includes(r.id);
                            return (
                              <tr class={isChecked() ? 'bg-[#202c33]/40' : ''}>
                                <td style={{ 'text-align': 'center' }}>
                                  <Checkbox
                                    checked={isChecked()}
                                    onChange={ch => toggleSelectRecipient(r.id, ch)}
                                  >
                                    <Checkbox.Input class="sr-only" />
                                    <Checkbox.Control class="w-4 h-4 rounded border border-[#2a3942] bg-[#182229] flex items-center justify-center cursor-pointer">
                                      <Checkbox.Indicator>
                                        <Check size={11} class="text-[#00a884]" />
                                      </Checkbox.Indicator>
                                    </Checkbox.Control>
                                  </Checkbox>
                                </td>
                                <td>
                                  <span class="text-xs text-[#8696a0] font-mono">{idx() + 1}</span>
                                </td>
                                <td>
                                  {(() => {
                                    const rJid = () => (r.jid && r.jid.includes('@') ? r.jid : `${r.phone_number.replace(/\D/g, '')}@s.whatsapp.net`);
                                    return (
                                      <div class="flex items-center gap-2.5">
                                        <div class="relative w-7 h-7 shrink-0">
                                          <img
                                            src={`/api/contacts/${encodeURIComponent(rJid())}/avatar-image`}
                                            alt={r.display_name || 'Recipient'}
                                            loading="lazy"
                                            referrerpolicy="no-referrer"
                                            class="w-7 h-7 rounded-full object-cover border border-[#2a3942] shrink-0"
                                            onError={e => {
                                              e.currentTarget.style.display = 'none';
                                              const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                                              if (next) next.style.display = 'flex';
                                            }}
                                          />
                                          <div
                                            style={{ display: 'none' }}
                                            class="w-7 h-7 rounded-full bg-[#202c33] border border-[#2a3942] items-center justify-center text-xs font-bold text-[#00a884] shrink-0"
                                          >
                                            {(r.display_name || r.phone_number || 'U').charAt(0).toUpperCase()}
                                          </div>
                                        </div>
                                        <strong class="text-xs text-[#e9edef]">
                                          {r.display_name || r.phone_number}
                                        </strong>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td>
                                  <span class="text-xs font-mono text-[#00a884]">
                                    {r.phone_number}
                                  </span>
                                </td>
                                <td>
                                  <span class="text-xs font-mono text-[#8696a0]">
                                    {r.jid && r.jid.includes('@') ? r.jid : `${r.phone_number.replace(/\D/g, '')}@s.whatsapp.net`}
                                  </span>
                                </td>
                                <td>
                                  <Switch fallback={<span class={`pill ${r.status.toLowerCase()}`}>{r.status.toUpperCase()}</span>}>
                                    <Match when={r.status === 'sent'}>
                                      <span class="pill sent flex items-center gap-1 text-[#00a884]">
                                        <Check size={11} />
                                        <span>SENT</span>
                                      </span>
                                    </Match>
                                    <Match when={r.status === 'queued'}>
                                      <span class="pill queued flex items-center gap-1 text-[#8696a0]">
                                        <Clock size={11} />
                                        <span>QUEUED</span>
                                      </span>
                                    </Match>
                                    <Match when={r.status === 'aborted' || r.status === 'cancelled'}>
                                      <span class="pill aborted flex items-center gap-1 text-[#f15c6d]">
                                        <Square size={11} fill="currentColor" />
                                        <span>ABORTED</span>
                                      </span>
                                    </Match>
                                    <Match when={r.status === 'failed'}>
                                      <span class="pill failed flex items-center gap-1 text-[#f15c6d]">
                                        <AlertCircle size={11} />
                                        <span>FAILED</span>
                                      </span>
                                    </Match>
                                  </Switch>
                                </td>
                              </tr>
                            );
                          }}
                        </For>
                      </Show>
                    </tbody>
                  </table>
                </div>
              </div>
            </Show>

            {/* TAB 2: MESSAGE TEMPLATE - With Emoticon, Formatter Panels & Authentic WhatsApp Chat Preview */}
            <Show when={detailTab() === 'template'}>
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
                    onChange={e => handleFileSelect(e)}
                  />
                  <input
                    ref={fileInputMediaRef}
                    type="file"
                    multiple
                    class="hidden"
                    accept="image/*,video/*"
                    onChange={e => handleFileSelect(e, 'media')}
                  />
                  <input
                    ref={fileInputDocRef}
                    type="file"
                    multiple
                    class="hidden"
                    accept="*/*"
                    onChange={e => handleFileSelect(e, 'document')}
                  />

                  {/* Multi-Media / Document Attachment Gallery Card in Composer */}
                  <Show when={campaignAttachments().length > 0}>
                    <div class="p-3 bg-[#182229] border border-[#2a3942] rounded-xl space-y-2.5 animate-in fade-in duration-150">
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
                            onClick={() => deleteCampaignAttachment(c().id)}
                            title="Remove all attached files"
                          >
                            <Trash2 size={12} />
                            <span>Clear All</span>
                          </button>
                        </div>
                      </div>

                      <div class="space-y-2 max-h-60 overflow-y-auto p-0.5 pr-1">
                        <For each={campaignAttachments()}>
                          {att => {
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
                                              <img src={`${att.thumbnail_url}&t=${c().updated_at || ''}`} alt="Video" class="w-full h-full object-cover" />
                                              <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                                                <Play size={11} fill="currentColor" class="text-white ml-0.5" />
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
                                    <strong class="text-xs font-semibold text-[#e9edef] block truncate max-w-[240px] sm:max-w-[340px] tracking-tight leading-snug" title={att.file_name}>
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
                                        onClick={() => updateAttachmentMode(c().id, att.file_name, isDocMode() ? 'media' : 'document')}
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
                                      onClick={() => setActiveModal({
                                        type: 'edit_photo',
                                        campaignId: c().id,
                                        fileName: att.file_name,
                                        imageUrl: att.url
                                      })}
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
                                      onClick={() => setActiveModal({
                                        type: 'cut_video',
                                        campaignId: c().id,
                                        fileName: att.file_name,
                                        videoUrl: att.url,
                                        fileSize: att.file_size
                                      })}
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
                                    onClick={() => deleteCampaignAttachment(c().id, att.file_name)}
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
                      onInput={e => setTemplateText(e.currentTarget.value)}
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
                          style={{ border: '1px solid #2a3942', background: emojiPickerOpen() ? '#202c33' : '#111b21' }}
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
                          style={{ border: '1px solid #2a3942', background: formatHelperOpen() ? '#202c33' : '#111b21' }}
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
                          <div class="absolute right-0 bottom-full mb-2 bg-[#182229] border border-[#2a3942] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2 z-40 w-64 animate-in fade-in zoom-in-95 duration-100 space-y-1">
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
                      {currentTemplate().length} characters &bull; {currentTemplate().trim() ? currentTemplate().trim().split(/\s+/).length : 0} words
                    </span>
                    <button
                      class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                      onClick={() => updateCampaignTemplate(c().id, currentTemplate())}
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
                        {(recipients()[0]?.display_name || 'Z').charAt(0).toUpperCase()}
                      </div>
                      <div class="min-w-0">
                        <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                          {recipients()[0]?.display_name || 'Zhidan'}
                        </strong>
                        <span class="text-[10px] text-[#00a884] font-medium block leading-tight">
                          online
                        </span>
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
                              <Show when={campaignAttachments().some(a => a.send_as !== 'document' && a.mime_type.startsWith('image/'))}>
                                <div class={`rounded-xl overflow-hidden mb-1.5 gap-1 bg-black/20 border border-black/10 ${
                                  campaignAttachments().filter(a => a.send_as !== 'document' && a.mime_type.startsWith('image/')).length === 1
                                    ? 'flex items-center justify-center max-h-52'
                                    : 'grid grid-cols-2 max-h-56'
                                }`}>
                                  <For each={campaignAttachments().filter(a => a.send_as !== 'document' && a.mime_type.startsWith('image/')).slice(0, 4)}>
                                    {(att, idx) => (
                                      <div class="relative overflow-hidden aspect-square flex items-center justify-center bg-black/20">
                                        <img src={att.url} alt="Media Preview" class="w-full h-full object-cover" />
                                        <Show when={idx() === 3 && campaignAttachments().filter(a => a.send_as !== 'document' && a.mime_type.startsWith('image/')).length > 4}>
                                          <div class="absolute inset-0 bg-black/60 flex items-center justify-center text-white font-bold text-lg">
                                            +{campaignAttachments().filter(a => a.send_as !== 'document' && a.mime_type.startsWith('image/')).length - 3}
                                          </div>
                                        </Show>
                                      </div>
                                    )}
                                  </For>
                                </div>
                              </Show>

                              {/* 2. Video Attachments (Inline Media) - Interactive Playable Video */}
                              <For each={campaignAttachments().filter(a => a.send_as !== 'document' && a.mime_type.startsWith('video/'))}>
                                {att => (
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
                              <For each={campaignAttachments().filter(a => a.send_as === 'document' || (!a.mime_type.startsWith('image/') && !a.mime_type.startsWith('video/')))}>
                                {att => (
                                  <div class="p-2.5 px-3 rounded-xl bg-[#182229]/90 border border-[#2a3942] flex items-center gap-2.5 mb-1.5">
                                    <div class="w-9 h-9 rounded-lg bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#53bdeb] shrink-0 font-bold uppercase text-[10px]">
                                      <FileText size={18} />
                                    </div>
                                    <div class="min-w-0 flex-1">
                                      <strong class="text-xs text-[#e9edef] block truncate leading-tight">
                                        {att.file_name}
                                      </strong>
                                      <span class="text-[10px] text-[#8696a0] block mt-0.5 font-mono">
                                        {formatBytes(att.file_size)} &bull; {att.file_name.split('.').pop()?.toUpperCase()}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                          <div innerHTML={formatWhatsAppText(currentTemplate(), recipients()[0]?.display_name || 'Zhidan', recipients()[0]?.phone_number || '+62 853-8922-9489')} />
                          <div class="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-white/60">
                            <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <CheckCheck size={14} class="text-[#53bdeb]" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Chat Bar Mock */}
                    <div class="p-3 px-3.5 bg-[#182229]/95 border-t border-[#222d34] flex items-center gap-2.5 text-[#8696a0] z-10">
                      <Smile size={18} class="hover:text-[#e9edef] cursor-pointer shrink-0" />
                      <Paperclip size={18} class="hover:text-[#e9edef] cursor-pointer shrink-0" onClick={() => fileInputRef?.click()} title="Attach file" />
                      <div class="flex-1 bg-[#202c33] border border-[#2a3942] rounded-lg px-3.5 py-1.5 text-xs text-[#8696a0]">
                        Type a message
                      </div>
                      <Mic size={18} class="hover:text-[#e9edef] cursor-pointer shrink-0" />
                    </div>
                  </div>
                </div>
              </div>
            </Show>

            {/* TAB 3: RUN LOGS */}
            <Show when={detailTab() === 'runs'}>
              <div class="card p-0 overflow-hidden">
                {/* Header with Run Selector Dropdown */}
                <div class="p-4 px-5 border-b border-[#222d34] flex items-center justify-between flex-wrap gap-4">
                  <div class="flex items-center gap-2">
                    <History size={16} class="text-[#00a884]" />
                    <h2 class="text-sm font-bold text-[#e9edef] tracking-wide">
                      Campaign Run History & Delivery Logs
                    </h2>
                  </div>

                  <div class="flex items-center gap-3">
                    <span class="text-xs text-[#8696a0]">Execution Run:</span>
                    <Show
                      when={runs().length > 0}
                      fallback={
                        <span class="text-xs font-mono text-[#8696a0] bg-[#111b21] px-2.5 py-1 rounded-lg border border-[#2a3942]">
                          None yet
                        </span>
                      }
                    >
                      <div class="relative shrink-0" ref={runDropdownRef}>
                        <button
                          type="button"
                          class="px-3 py-1.5 rounded-lg bg-[#202c33] border border-[#2a3942] text-xs font-medium text-[#e9edef] flex items-center gap-2 cursor-pointer hover:border-[#00a884] transition-colors"
                          onClick={() => setRunDropdownOpen(!runDropdownOpen())}
                        >
                          <span
                            class={`w-2 h-2 rounded-full ${
                              currentRun()?.status === 'running'
                                ? 'bg-[#53bdeb] animate-pulse'
                                : currentRun()?.status === 'completed'
                                ? 'bg-[#00a884]'
                                : currentRun()?.status === 'draft' || currentRun()?.status === 'pending'
                                ? 'bg-[#8696a0]'
                                : currentRun()?.status === 'paused'
                                ? 'bg-[#ffbc38]'
                                : 'bg-[#f15c6d]'
                            }`}
                          />
                          <span>
                            Run #{currentRun()?.run_number} &bull;{' '}
                            {currentRun()?.status.toUpperCase()}
                          </span>
                          <ChevronDown size={14} class={`text-[#8696a0] transition-transform duration-150 ${runDropdownOpen() ? 'rotate-180 text-[#00a884]' : ''}`} />
                        </button>

                        <Show when={runDropdownOpen()}>
                          <div class="absolute right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-2xl p-1 z-50 min-w-[230px] max-h-[260px] overflow-y-auto space-y-0.5 animate-in fade-in zoom-in-95 duration-100">
                            <For each={runs()}>
                              {r => (
                                <div
                                  class={`px-3 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                                    r.id === selectedRunId()
                                      ? 'bg-[#202c33] text-[#00a884] font-semibold'
                                      : 'text-[#e9edef] hover:bg-[#202c33]'
                                  }`}
                                  onClick={() => {
                                    setSelectedRunId(r.id);
                                    setRunDropdownOpen(false);
                                  }}
                                >
                                  <div class="flex items-center gap-2">
                                    <span
                                      class={`w-1.5 h-1.5 rounded-full ${
                                        r.status === 'running'
                                          ? 'bg-[#53bdeb] animate-pulse'
                                          : r.status === 'completed'
                                          ? 'bg-[#00a884]'
                                          : r.status === 'draft' || r.status === 'pending'
                                          ? 'bg-[#8696a0]'
                                          : r.status === 'paused'
                                          ? 'bg-[#ffbc38]'
                                          : 'bg-[#f15c6d]'
                                      }`}
                                    />
                                    <span>
                                      Run #{r.run_number} &bull; {r.status.toUpperCase()}
                                    </span>
                                  </div>
                                  <span class="text-[11px] text-[#8696a0] font-mono">
                                    {new Date(r.started_at * 1000).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </div>

                {/* Elevated Execution Run Summary Header Strip */}
                <Show
                  when={currentRun()}
                  fallback={
                    <div class="py-16 px-6 text-center flex flex-col items-center justify-center">
                      <div class="w-16 h-16 rounded-2xl bg-[#111b21] border border-[#2a3942] flex items-center justify-center text-[#00a884] shadow-inner mb-4 relative">
                        <History size={30} />
                        <span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#00a884]/30 border border-[#00a884] animate-ping" />
                        <span class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#00a884] border border-[#111b21]" />
                      </div>

                      <h3 class="text-base font-bold text-[#e9edef] mb-1.5 tracking-wide">
                        No Execution Runs Yet
                      </h3>
                      <p class="text-xs text-[#8696a0] max-w-md leading-relaxed mb-6">
                        This campaign hasn't been launched yet. Once dispatched, every execution run, human-pacing typing presence, and delivery confirmation will be logged here.
                      </p>

                      <Show
                        when={recipients().length > 0}
                        fallback={
                          <button
                            type="button"
                            class="btn-accent h-9 px-4 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md hover:scale-[1.02]"
                            onClick={() => setActiveModal({ type: 'add_contacts', campaignId: c().id })}
                          >
                            <Plus size={14} />
                            <span>Add Target Contacts First</span>
                          </button>
                        }
                      >
                        <button
                          type="button"
                          class="btn-accent h-9 px-4 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md hover:scale-[1.02]"
                          onClick={() => controlCampaign(c().id, 'resume')}
                        >
                          <Play size={14} />
                          <span>Launch Campaign ({recipients().length} contacts)</span>
                        </button>
                      </Show>
                    </div>
                  }
                >
                  {run => {
                    const startedTime = new Date(run().started_at * 1000).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    });
                    const completedTime = run().completed_at
                      ? new Date(run().completed_at! * 1000).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })
                      : null;
                    const dateStr = new Date(run().started_at * 1000).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    });

                    let durationSecs = 0;
                    if (run().completed_at && run().completed_at! > run().started_at) {
                      durationSecs = run().completed_at! - run().started_at;
                    } else if (run().status === 'running') {
                      durationSecs = Math.max(0, Math.floor(Date.now() / 1000) - run().started_at);
                    }

                    let durStr = `${durationSecs}s`;
                    if (run().status === 'completed' && durationSecs > 3600 && run().total_count < 20) {
                      durStr = `~${Math.max(12, run().total_count * 20)}s`;
                    } else if (durationSecs >= 3600) {
                      durStr = `${Math.floor(durationSecs / 3600)}h ${Math.floor(
                        (durationSecs % 3600) / 60
                      )}m`;
                    } else if (durationSecs >= 60) {
                      durStr = `${Math.floor(durationSecs / 60)}m ${durationSecs % 60}s`;
                    }

                    const pct = () =>
                      run().total_count > 0
                        ? Math.min(100, Math.round((run().sent_count / run().total_count) * 100))
                        : 0;

                    return (
                      <>
                      <div class="p-4 px-5 border-b border-[#222d34] bg-[#182229]/60 flex items-center justify-between flex-wrap gap-4">
                        {/* Left: Run Hero Identity & Timestamps */}
                        <div class="flex items-center gap-3.5 min-w-0">
                          <div
                            class={`w-10 h-10 rounded-xl bg-[#111b21] border border-[#2a3942] flex items-center justify-center shrink-0 ${
                              run().status === 'completed'
                                ? 'text-[#00a884]'
                                : run().status === 'running'
                                ? 'text-[#53bdeb]'
                                : (run().status === 'draft' || run().status === 'pending')
                                ? 'text-[#8696a0]'
                                : run().status === 'paused'
                                ? 'text-[#ffbc38]'
                                : 'text-[#f15c6d]'
                            }`}
                          >
                            <Show
                              when={run().status === 'completed'}
                              fallback={
                                <Show
                                  when={run().status === 'running'}
                                  fallback={
                                    <Show
                                      when={run().status === 'draft' || run().status === 'pending'}
                                      fallback={
                                        <Show
                                          when={run().status === 'paused'}
                                          fallback={<AlertCircle size={18} />}
                                        >
                                          <Pause size={18} />
                                        </Show>
                                      }
                                    >
                                      <Clock size={18} />
                                    </Show>
                                  }
                                >
                                  <RotateCw size={18} class="animate-spin" />
                                </Show>
                              }
                            >
                              <CheckCheck size={18} />
                            </Show>
                          </div>
                          <div class="min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                              <span class="font-bold text-sm text-[#e9edef] tracking-wide">
                                Execution Run #{run().run_number}
                              </span>
                              <span class={`pill ${run().status}`}>
                                {run().status.toUpperCase()}
                              </span>
                            </div>
                            <div class="text-[11.5px] text-[#8696a0] mt-0.5 flex items-center gap-1.5 flex-wrap">
                              <span>{dateStr}</span>
                              <span>&bull;</span>
                              <span>
                                {startedTime} {completedTime ? `\u2192 ${completedTime}` : ''}
                              </span>
                              <span>&bull;</span>
                              <span class="text-[#e9edef] font-medium">
                                Duration: {durationSecs > 0 ? durStr : (run().status === 'draft' || run().status === 'pending') ? 'Not started' : '0s'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Key Metrics Strip (Delivered, Total Fails, Progress) */}
                        <div class="flex items-center gap-8">
                          {/* Delivered Metric */}
                          <div class="text-right">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-[#8696a0]">
                              Delivered
                            </div>
                            <div class="text-base font-bold text-[#00a884] font-mono mt-0.5">
                              {run().sent_count} / {run().total_count}
                              <span class="text-xs font-normal text-[#8696a0] font-sans ml-1">
                                ({pct()}%)
                              </span>
                            </div>
                          </div>

                          {/* Total Fails Metric */}
                          <div class="text-right">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-[#8696a0]">
                              Total Fails
                            </div>
                            <div
                              class={`text-base font-bold font-mono mt-0.5 ${
                                run().failed_count > 0 ? 'text-[#f15c6d]' : 'text-[#8696a0]'
                              }`}
                            >
                              {run().failed_count}
                              <span class="text-xs font-normal text-[#8696a0] font-sans ml-1">
                                {run().failed_count > 0 ? 'Failed' : 'Zero fails'}
                              </span>
                            </div>
                          </div>

                          {/* Progress Metric */}
                          <div class="flex flex-col justify-center min-w-[130px]">
                            <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#8696a0] mb-1">
                              <span>Progress</span>
                              <span class="text-[#e9edef] font-mono font-bold">{pct()}%</span>
                            </div>
                            <Progress value={pct()} class="w-full">
                              <Progress.Track class="mini-progress-bar h-2 bg-[#111b21] rounded-full overflow-hidden border border-[#2a3942]">
                                <Progress.Fill
                                  class="mini-progress-fill h-full bg-gradient-to-r from-[#00a884] to-[#00c49f] rounded-full transition-all"
                                  style={{ width: `${pct()}%` }}
                                />
                              </Progress.Track>
                            </Progress>
                          </div>
                        </div>
                      </div>
                {/* Execution Delivery Logs Table OR Empty Logs State for this Run */}
                <Show
                  when={displayRunRows().length > 0}
                  fallback={
                    <div class="py-14 px-6 text-center flex flex-col items-center justify-center">
                      <div class="w-14 h-14 rounded-2xl bg-[#111b21] border border-[#2a3942] flex items-center justify-center text-[#8696a0] mb-3.5 shadow-inner">
                        <Show
                          when={currentRun()?.status === 'running'}
                          fallback={
                            <Show
                              when={currentRun()?.status === 'completed'}
                              fallback={<Inbox size={26} class="text-[#8696a0]" />}
                            >
                              <CheckCheck size={26} class="text-[#00a884]" />
                            </Show>
                          }
                        >
                          <RotateCw size={26} class="text-[#53bdeb] animate-spin" />
                        </Show>
                      </div>

                      <h3 class="text-sm font-bold text-[#e9edef] mb-1.5 tracking-wide">
                        <Switch fallback="No Delivery Logs Recorded">
                          <Match when={currentRun()?.status === 'draft'}>
                            Run #{currentRun()?.run_number} is in Draft
                          </Match>
                          <Match when={currentRun()?.status === 'running'}>
                            Run #{currentRun()?.run_number} is Initializing...
                          </Match>
                          <Match when={currentRun()?.status === 'completed'}>
                            No Messages Dispatched in Run #{currentRun()?.run_number}
                          </Match>
                          <Match when={currentRun()?.status === 'aborted'}>
                            Run #{currentRun()?.run_number} Was Aborted
                          </Match>
                        </Switch>
                      </h3>

                      <p class="text-xs text-[#8696a0] max-w-md leading-relaxed mb-5">
                        <Switch fallback="No recipient message delivery attempts have been logged for this run yet.">
                          <Match when={currentRun()?.status === 'draft'}>
                            This execution run is staged as a draft. Start the campaign to begin anti-ban human typing simulation and queue message dispatches.
                          </Match>
                          <Match when={currentRun()?.status === 'running'}>
                            The background worker is currently preparing recipient queues and human pacing delays. Live dispatches will appear shortly.
                          </Match>
                          <Match when={currentRun()?.status === 'completed'}>
                            This execution run finished with 0 recorded recipient messages.
                          </Match>
                          <Match when={currentRun()?.status === 'aborted'}>
                            Execution was cancelled before any messages were dispatched to WhatsApp recipients.
                          </Match>
                        </Switch>
                      </p>

                      <Show when={currentRun()?.status === 'draft' && (c().status === 'draft' || c().status === 'pending')}>
                        <Show
                          when={recipients().length > 0}
                          fallback={
                            <button
                              type="button"
                              class="btn-accent h-8 px-3.5 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                              onClick={() => setActiveModal({ type: 'add_contacts', campaignId: c().id })}
                            >
                              <Plus size={13} />
                              <span>Add Target Contacts</span>
                            </button>
                          }
                        >
                          <button
                            type="button"
                            class="btn-accent h-8 px-4 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                            onClick={() => controlCampaign(c().id, 'resume')}
                          >
                            <Play size={13} />
                            <span>Start Campaign ({recipients().length} contacts)</span>
                          </button>
                        </Show>
                      </Show>
                    </div>
                  }
                >
                  <div class="table-responsive">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: '45px' }}>#</th>
                          <th>Recipient Name</th>
                          <th>Phone / JID</th>
                          <th>Sender</th>
                          <th>Status</th>
                          <th>Message ID / Error</th>
                          <th>Timestamp</th>
                          <th style={{ 'text-align': 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={displayRunRows()}>
                          {row => (
                            <tr>
                              <td>
                                <span class="text-xs text-[#8696a0] font-mono">{row.num}</span>
                              </td>
                              <td>
                                <strong class="text-xs text-[#e9edef]">
                                  {row.name}
                                </strong>
                              </td>
                              <td>
                                <span class="text-xs font-mono text-[#00a884]">
                                  {row.phone}
                                </span>
                              </td>
                              <td>
                                <span class="badge text-[10px] font-mono">
                                  {row.sender || (c().account_id.includes(',') ? 'Pool' : c().account_id)}
                                </span>
                              </td>
                              <td>
                                <Switch fallback={<span class={`pill ${row.status.toLowerCase()}`}>{row.status.toUpperCase()}</span>}>
                                  <Match when={row.status === 'typing'}>
                                    <span class="typing-pill">
                                      <span class="typing-dots">
                                        <span class="typing-dot" />
                                        <span class="typing-dot" />
                                        <span class="typing-dot" />
                                      </span>
                                      <span>TYPING...</span>
                                    </span>
                                  </Match>
                                  <Match when={row.status === 'sent'}>
                                    <span class="pill sent flex items-center gap-1 text-[#00a884]">
                                      <Check size={11} />
                                      <span>SENT</span>
                                    </span>
                                  </Match>
                                  <Match when={row.status === 'queued'}>
                                    <span class="pill queued flex items-center gap-1 text-[#8696a0]">
                                      <Clock size={11} />
                                      <span>QUEUED</span>
                                    </span>
                                  </Match>
                                  <Match when={row.status === 'aborted' || row.status === 'cancelled'}>
                                    <span class="pill aborted flex items-center gap-1 text-[#f15c6d]">
                                      <Square size={11} fill="currentColor" />
                                      <span>ABORTED</span>
                                    </span>
                                  </Match>
                                  <Match when={row.status === 'failed'}>
                                    <span class="pill failed flex items-center gap-1 text-[#f15c6d]">
                                      <AlertCircle size={11} />
                                      <span>FAILED</span>
                                    </span>
                                  </Match>
                                </Switch>
                              </td>
                              <td>
                                <Show
                                  when={row.status === 'sent'}
                                  fallback={
                                    <span class={`text-xs ${row.status === 'failed' ? 'text-[#f15c6d]' : 'text-[#8696a0]'}`}>
                                      {row.detail}
                                    </span>
                                  }
                                >
                                  <code class="text-xs text-[#8696a0]">
                                    {row.detail}
                                  </code>
                                </Show>
                              </td>
                              <td>
                                <span class="text-xs text-[#8696a0]">
                                  {row.timestamp}
                                </span>
                              </td>
                              <td style={{ 'text-align': 'right' }}>
                                <Show when={row.status === 'aborted' || row.status === 'cancelled' || row.status === 'failed'}>
                                  <button
                                    class="h-7 px-2.5 text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer bg-[#182229] border border-[#2a3942] hover:border-[#00a884] text-[#00a884] transition-colors ml-auto"
                                    title="Resend this message"
                                    onClick={() => resendRecipient(c().id, row.recipient_id)}
                                  >
                                    <RotateCw size={11} />
                                    <span>Resend</span>
                                  </button>
                                </Show>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
                      </>
                    );
                  }}
                </Show>
              </div>
            </Show>
        </div>
      </Show>
    </ErrorBoundary>
  );
}
