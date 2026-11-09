import { createSignal, onSettled, Show, For } from 'solid-js';
import {
  accounts,
  campaigns,
  switchView,
  controlCampaign,
  deleteCampaign,
  addCampaignSender,
  removeCampaignSender,
  updateCampaignDelayRange,
  showToast,
  setActiveModal
} from '../store';
import { getAccountStatusState } from '../types';
import type { Campaign, CampaignRun, Recipient } from '../types';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  RotateCw,
  RefreshCw,
  Trash2,
  Zap,
  Plus,
  Check,
  X,
  Smartphone,
  Users,
  CheckCheck,
  AlertCircle,
  Pencil,
  Clock,
  FileText,
  History
} from '../../icons';

export default function CampaignMacroCards(props: {
  campaign: Campaign;
  runs: CampaignRun[];
  recipients: Recipient[];
  currentRun: CampaignRun | null;
  detailTab: 'contacts' | 'template' | 'runs';
  setDetailTab: (tab: 'contacts' | 'template' | 'runs') => void;
}) {
  const [senderDropdownOpen, setSenderDropdownOpen] = createSignal(false);
  const [editingDelay, setEditingDelay] = createSignal(false);
  const [minDelayInput, setMinDelayInput] = createSignal(props.campaign.min_delay_secs || 20);
  const [maxDelayInput, setMaxDelayInput] = createSignal(props.campaign.max_delay_secs || 45);
  let senderDropdownRef: HTMLDivElement | undefined;

  const currentRunDelivered = () =>
    props.currentRun ? props.currentRun.sent_count : props.campaign.sent_count;
  const currentRunFails = () =>
    props.currentRun ? props.currentRun.failed_count : props.campaign.failed_count;
  const abortedCount = () =>
    props.recipients.filter((r) => r.status === 'cancelled' || r.status === 'aborted').length;
  const getConflictingRunningCampaign = (acc: string) => {
    const clean = acc.trim().toLowerCase();
    for (const c of campaigns()) {
      if (c.status === 'running' && c.id !== props.campaign.id) {
        if (c.account_id.trim().toLowerCase() === 'all') {
          return c;
        }
        const cAccounts = c.account_id
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (cAccounts.includes(clean)) {
          return c;
        }
      }
    }
    return null;
  };

  onSettled(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (senderDropdownOpen() && senderDropdownRef && !senderDropdownRef.contains(target)) {
        setSenderDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSenderDropdownOpen(false);
        setEditingDelay(false);
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
    <>
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
          <Show when={props.campaign.status === 'pending' || props.campaign.status === 'draft'}>
            <button
              class="h-8 px-3.5 text-xs font-semibold rounded-xl bg-[#00a884] hover:bg-[#00c49f] text-[#111b21] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              onClick={() => controlCampaign(props.campaign.id, 'resume')}
            >
              <Play size={13} />
              <span>Start Campaign</span>
            </button>
          </Show>

          <Show when={props.campaign.status === 'running'}>
            <button
              class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#202c33] hover:bg-[#2a3942] border border-[#2a3942] hover:border-[#ffbc38] text-[#e9edef] hover:text-[#ffbc38] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              onClick={() => controlCampaign(props.campaign.id, 'pause')}
            >
              <Pause size={13} />
              <span>Pause</span>
            </button>
          </Show>

          <Show when={props.campaign.status === 'paused'}>
            <button
              class="h-8 px-3.5 text-xs font-semibold rounded-xl bg-[#00a884] hover:bg-[#00c49f] text-[#111b21] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              onClick={() => controlCampaign(props.campaign.id, 'resume')}
            >
              <Play size={13} />
              <span>Resume</span>
            </button>
          </Show>

          <Show when={props.campaign.status === 'running' || props.campaign.status === 'paused'}>
            <button
              class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#f15c6d]/10 hover:bg-[#f15c6d]/20 border border-[#f15c6d]/40 hover:border-[#f15c6d] text-[#f15c6d] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              title="Abort active broadcast run"
              onClick={() =>
                setActiveModal({
                  type: 'confirm',
                  title: 'Abort Broadcast Campaign',
                  message: `Are you sure you want to abort the current broadcast run for '${props.campaign.name}'? Remaining queued messages will be cancelled.`,
                  onConfirm: () => controlCampaign(props.campaign.id, 'abort')
                })
              }
            >
              <Square size={11} fill="currentColor" />
              <span>Abort</span>
            </button>
          </Show>

          <Show when={props.campaign.status === 'completed' || props.campaign.status === 'aborted'}>
            <button
              class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#00a884]/15 hover:bg-[#00a884]/25 border border-[#00a884]/40 hover:border-[#00a884] text-[#00a884] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              onClick={() => controlCampaign(props.campaign.id, 'rerun')}
            >
              <RotateCw size={13} />
              <span>Re-run All</span>
            </button>
          </Show>

          <Show when={abortedCount() > 0 && props.campaign.status !== 'running'}>
            <button
              class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#ffbc38]/10 hover:bg-[#ffbc38]/20 border border-[#ffbc38]/40 hover:border-[#ffbc38] text-[#ffbc38] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              title="Resend all aborted messages in a new run"
              onClick={() => controlCampaign(props.campaign.id, 'resend_aborted')}
            >
              <RotateCw size={12} />
              <span>Resend Aborted ({abortedCount()})</span>
            </button>
          </Show>

          <Show when={props.campaign.failed_count > 0}>
            <button
              class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#53bdeb]/10 hover:bg-[#53bdeb]/20 border border-[#53bdeb]/40 hover:border-[#53bdeb] text-[#53bdeb] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
              title="Retry only failed recipients in a new run"
              onClick={() => controlCampaign(props.campaign.id, 'retry_failed')}
            >
              <RefreshCw size={13} />
              <span>Retry Failed ({props.campaign.failed_count})</span>
            </button>
          </Show>

          <button
            class="h-8 px-3.5 text-xs font-medium rounded-xl bg-[#202c33] hover:bg-[#f15c6d]/15 border border-[#2a3942] hover:border-[#f15c6d]/50 text-[#8696a0] hover:text-[#f15c6d] flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
            onClick={() =>
              setActiveModal({
                type: 'confirm',
                title: 'Delete Campaign',
                message: `Are you sure you want to permanently delete campaign '${props.campaign.name}'?`,
                onConfirm: () => deleteCampaign(props.campaign.id)
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
          const poolList = () => {
            if (props.campaign.account_id.trim().toLowerCase() === 'all') {
              return accounts().map((a) => a.account_id);
            }
            return props.campaign.account_id
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
          };
          const isMulti = () => poolList().length > 1;

          return (
            <div class="metric-card p-4 flex flex-col justify-between relative">
              <div class="flex items-center justify-between w-full mb-1">
                <span class="text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">
                  {isMulti() ? 'Sender Pool' : 'Sender Account'}
                </span>
                <div class="flex items-center gap-1.5">
                  <Show when={isMulti()}>
                    <span class="text-[10px] font-bold text-[#00a884] bg-[#00a884]/15 border border-[#00a884]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Zap size={10} />
                      <span>{poolList().length}x Parallel</span>
                    </span>
                  </Show>
                  {/* Choose Senders Dropdown Popover */}
                  <div class="relative" ref={senderDropdownRef}>
                    <button
                      type="button"
                      style={{
                        background: 'rgba(0,168,132,0.12)',
                        border: '1px solid rgba(0,168,132,0.3)',
                        color: '#00a884'
                      }}
                      class="h-6 px-2.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all hover:bg-[#00a884]/20 hover:border-[#00a884]/50 shadow-none"
                      title="Choose sender accounts for campaign"
                      onClick={() => setSenderDropdownOpen(!senderDropdownOpen())}
                    >
                      <Plus size={11} stroke-width={2.5} />
                      <span>Sender</span>
                    </button>
                    <Show when={senderDropdownOpen()}>
                      <div class="absolute right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-dropdown p-2.5 z-50 min-w-[260px] max-w-[320px] max-h-[340px] overflow-y-auto space-y-2 animate-popover">
                        {/* Header */}
                        <div class="flex items-center justify-between pb-1.5 border-b border-[#222d34] px-0.5">
                          <span class="text-[10.5px] font-bold uppercase tracking-wider text-[#8696a0]">
                            Choose Senders ({poolList().length}/{accounts().length})
                          </span>
                          <Show when={accounts().length > 1}>
                            <button
                              type="button"
                              class="text-[10px] text-[#00a884] hover:text-[#00c49f] font-semibold cursor-pointer"
                              onClick={async () => {
                                for (const acc of accounts()) {
                                  if (!poolList().includes(acc.account_id)) {
                                    await addCampaignSender(props.campaign.id, acc.account_id);
                                  }
                                }
                              }}
                            >
                              Select All
                            </button>
                          </Show>
                        </div>

                        {/* Account List */}
                        <div class="space-y-1">
                          <Show
                            when={accounts().length > 0}
                            fallback={
                              <div class="py-4 text-center text-xs text-[#8696a0]">
                                No accounts connected. Go to Devices to connect WhatsApp accounts.
                              </div>
                            }
                          >
                            <For each={accounts()}>
                              {(acc) => {
                                const isSelected = () => poolList().includes(acc.account_id);
                                const status = () => getAccountStatusState(acc.status);
                                const isOnline = () => status() === 'Connected';

                                return (
                                  <div
                                    class={`p-2 rounded-lg flex items-center justify-between cursor-pointer text-xs transition-all border ${
                                      isSelected()
                                        ? 'bg-[#00a884]/10 border-[#00a884]/50 text-[#e9edef]'
                                        : 'bg-transparent border-transparent text-[#8696a0] hover:bg-[#202c33] hover:text-[#e9edef]'
                                    }`}
                                    onClick={async () => {
                                      if (isSelected()) {
                                        if (poolList().length > 1) {
                                          await removeCampaignSender(
                                            props.campaign.id,
                                            acc.account_id
                                          );
                                        } else {
                                          showToast(
                                            'At least one sender account must be selected',
                                            'info'
                                          );
                                        }
                                      } else {
                                        await addCampaignSender(props.campaign.id, acc.account_id);
                                      }
                                    }}
                                  >
                                    <div class="flex items-center gap-2 min-w-0">
                                      {/* Checkbox indicator */}
                                      <div
                                        class={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                          isSelected()
                                            ? 'bg-[#00a884] border-[#00a884] text-[#111b21]'
                                            : 'bg-[#111b21] border-[#2a3942]'
                                        }`}
                                      >
                                        <Show when={isSelected()}>
                                          <Check size={11} stroke-width={3} />
                                        </Show>
                                      </div>

                                      {/* Initial Avatar */}
                                      <div class="w-5 h-5 rounded-full bg-[#00a884]/20 text-[#00a884] font-bold text-[9px] flex items-center justify-center shrink-0">
                                        {acc.account_id.charAt(0).toUpperCase()}
                                      </div>

                                      {/* Name & Phone */}
                                      <div class="min-w-0">
                                        <div class="flex items-center gap-1.5 flex-wrap">
                                          <span class="font-medium text-xs text-[#e9edef] truncate">
                                            {acc.account_id}
                                          </span>
                                          <Show when={acc.is_active}>
                                            <span class="text-[9px] font-bold text-[#00a884] bg-[#00a884]/20 px-1 rounded">
                                              Active
                                            </span>
                                          </Show>
                                          <Show
                                            when={getConflictingRunningCampaign(acc.account_id)}
                                          >
                                            {(b) => (
                                              <span class="text-[9px] font-semibold text-[#ffbc38] bg-[#ffbc38]/15 border border-[#ffbc38]/30 px-1 rounded">
                                                Busy in #{b().id}
                                              </span>
                                            )}
                                          </Show>
                                        </div>
                                        <Show when={acc.phone_number}>
                                          <div class="text-[10px] font-mono text-[#8696a0] truncate">
                                            +{acc.phone_number}
                                          </div>
                                        </Show>
                                      </div>
                                    </div>

                                    {/* Status Dot */}
                                    <div class="flex items-center gap-1 shrink-0 ml-2">
                                      <span
                                        class={`w-1.5 h-1.5 rounded-full ${
                                          isOnline() ? 'bg-[#00a884] animate-pulse' : 'bg-[#8696a0]'
                                        }`}
                                      />
                                      <span class="text-[10px] text-[#8696a0] capitalize">
                                        {status()}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }}
                            </For>
                          </Show>
                        </div>

                        {/* Helpful hint when only 1 account exists */}
                        <Show when={accounts().length <= 1}>
                          <div class="pt-1.5 border-t border-[#222d34] text-[10.5px] text-[#8696a0] flex items-start gap-1.5 px-0.5">
                            <Smartphone size={13} class="text-[#00a884] shrink-0 mt-0.5" />
                            <span>
                              Pair more accounts in <strong>Devices</strong> to pool multiple
                              senders.
                            </span>
                          </div>
                        </Show>
                      </div>
                    </Show>
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-between w-full gap-3">
                <div class="min-w-0 flex-1">
                  <Show
                    when={isMulti()}
                    fallback={
                      <div>
                        <div
                          class="text-xl font-bold text-[#e9edef] truncate flex items-center gap-2"
                          title={props.campaign.account_id}
                        >
                          <span class="truncate">{props.campaign.account_id}</span>
                          <Show when={getConflictingRunningCampaign(props.campaign.account_id)}>
                            {(busy) => (
                              <span class="text-[10px] font-semibold text-[#ffbc38] bg-[#ffbc38]/15 border border-[#ffbc38]/30 px-1.5 py-0.5 rounded-md shrink-0">
                                Busy in #{busy().id}
                              </span>
                            )}
                          </Show>
                        </div>
                        <span class="text-[11px] text-[#8696a0] font-mono block mt-0.5 truncate">
                          {accounts().find((a) => a.account_id === props.campaign.account_id)
                            ?.phone_number
                            ? `+${accounts().find((a) => a.account_id === props.campaign.account_id)?.phone_number}`
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
                      {/* Sender Account Chips with Remove button */}
                      <div class="flex items-center gap-1.5 mt-1.5 overflow-x-auto pb-0.5 max-w-full">
                        <For each={poolList()}>
                          {(acc) => {
                            const busy = () => getConflictingRunningCampaign(acc);
                            return (
                              <span
                                class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10.5px] font-medium shrink-0 group ${
                                  busy()
                                    ? 'bg-[#ffbc38]/10 border-[#ffbc38]/40 text-[#ffbc38]'
                                    : 'bg-[#202c33] border-[#2a3942] text-[#e9edef]'
                                }`}
                              >
                                <span
                                  class={`w-3.5 h-3.5 rounded-full font-bold text-[8.5px] flex items-center justify-center ${
                                    busy()
                                      ? 'bg-[#ffbc38]/20 text-[#ffbc38]'
                                      : 'bg-[#00a884]/20 text-[#00a884]'
                                  }`}
                                >
                                  {acc.charAt(0).toUpperCase()}
                                </span>
                                <span class="truncate max-w-[70px]">{acc}</span>
                                <Show when={busy()}>
                                  {(b) => (
                                    <span class="text-[9px] font-semibold text-[#ffbc38]">
                                      (Busy in #{b().id})
                                    </span>
                                  )}
                                </Show>
                                <Show when={poolList().length > 1}>
                                  <button
                                    type="button"
                                    class="text-[#8696a0] hover:text-[#f15c6d] p-0.5 rounded transition-colors cursor-pointer"
                                    title={`Remove '${acc}' from campaign`}
                                    onClick={() => removeCampaignSender(props.campaign.id, acc)}
                                  >
                                    <X size={10} />
                                  </button>
                                </Show>
                              </span>
                            );
                          }}
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
            <div class="metric-label">
              {props.currentRun
                ? `Run #${props.currentRun?.run_number} Delivered`
                : 'Total Messages Delivered'}
            </div>
            <div class="metric-val text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
              <span>{currentRunDelivered()}</span>
              <span class="text-xs font-normal text-[#8696a0]">Sent</span>
            </div>
            <Show when={(props.campaign?.total_sent_all_runs ?? 0) > currentRunDelivered()}>
              <span
                class="text-[10px] text-[#8696a0] block font-mono mt-0.5"
                title="Total messages sent across all historical runs of this campaign"
              >
                {props.campaign?.total_sent_all_runs} across {props.runs.length} runs
              </span>
            </Show>
          </div>
          <div class="metric-icon-wrap text-[#00a884]">
            <CheckCheck size={20} />
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <div class="metric-label">
              {props.currentRun ? `Run #${props.currentRun?.run_number} Fails` : 'Total Fails'}
            </div>
            <div class="metric-val text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
              <span>{currentRunFails()}</span>
              <span class="text-xs font-normal text-[#8696a0]">Failed</span>
            </div>
          </div>
          <div
            class={`metric-icon-wrap ${
              currentRunFails() > 0 ? 'text-[#f15c6d]' : 'text-[#8696a0]'
            }`}
          >
            <AlertCircle size={20} />
          </div>
        </div>

        {/* 4. Anti-Ban Delay Jitter Range Card */}
        <div class="metric-card p-4 flex flex-col justify-between">
          <div class="flex items-center justify-between w-full mb-1">
            <span class="text-[11px] font-semibold uppercase tracking-wider text-[#8696a0]">
              Anti-Ban Delay Jitter
            </span>
            <Show
              when={!editingDelay()}
              fallback={
                <button
                  type="button"
                  style={{
                    background: '#202c33',
                    border: '1px solid #2a3942',
                    color: '#8696a0'
                  }}
                  class="h-6 px-2.5 text-[11px] font-medium rounded-lg flex items-center gap-1.5 cursor-pointer transition-all hover:text-[#e9edef] hover:border-[#8696a0] shadow-none"
                  onClick={() => setEditingDelay(false)}
                >
                  <X size={11} />
                  <span>Cancel</span>
                </button>
              }
            >
              <button
                type="button"
                style={{
                  background: 'rgba(0,168,132,0.12)',
                  border: '1px solid rgba(0,168,132,0.3)',
                  color: '#00a884'
                }}
                class="h-6 px-2.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-all hover:bg-[#00a884]/20 hover:border-[#00a884]/50 shadow-none"
                onClick={() => {
                  setMinDelayInput(props.campaign.min_delay_secs);
                  setMaxDelayInput(props.campaign.max_delay_secs);
                  setEditingDelay(true);
                }}
                title="Edit anti-ban delay jitter range"
              >
                <Pencil size={11} />
                <span>Edit</span>
              </button>
            </Show>
          </div>

          <div class="flex items-center justify-between w-full gap-3">
            <div class="min-w-0 flex-1">
              <Show
                when={editingDelay()}
                fallback={
                  <div>
                    <div class="metric-val text-xl font-bold text-[#e9edef]">
                      {props.campaign.min_delay_secs}s &ndash; {props.campaign.max_delay_secs}s
                    </div>
                    <span class="text-[11px] text-[#8696a0] block mt-0.5">
                      Human-randomized interval
                    </span>
                  </div>
                }
              >
                <div class="flex items-center gap-1.5 py-0.5 flex-wrap">
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="300"
                      class="w-14 bg-[#111b21] border border-[#2a3942] rounded-md px-1.5 py-1 text-xs text-[#e9edef] font-mono focus:outline-none focus:border-[#00a884]"
                      value={minDelayInput()}
                      onInput={(e) => setMinDelayInput(parseInt(e.currentTarget.value) || 1)}
                    />
                    <span class="text-xs text-[#8696a0]">s</span>
                  </div>
                  <span class="text-xs text-[#8696a0]">&ndash;</span>
                  <div class="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="600"
                      class="w-14 bg-[#111b21] border border-[#2a3942] rounded-md px-1.5 py-1 text-xs text-[#e9edef] font-mono focus:outline-none focus:border-[#00a884]"
                      value={maxDelayInput()}
                      onInput={(e) => setMaxDelayInput(parseInt(e.currentTarget.value) || 1)}
                    />
                    <span class="text-xs text-[#8696a0]">s</span>
                  </div>
                  <button
                    type="button"
                    style={{
                      background: '#00a884',
                      border: '1px solid #00a884',
                      color: '#111b21'
                    }}
                    class="h-7 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:bg-[#00c49f] shadow-none"
                    title="Save delay range"
                    onClick={async () => {
                      const min = minDelayInput();
                      const max = maxDelayInput();
                      if (min <= 0 || max <= 0) {
                        showToast('Delay must be at least 1 second', 'error');
                        return;
                      }
                      if (min > max) {
                        showToast('Minimum delay cannot exceed maximum delay', 'error');
                        return;
                      }
                      await updateCampaignDelayRange(props.campaign.id, min, max);
                      setEditingDelay(false);
                    }}
                  >
                    <Check size={12} stroke-width={2.5} />
                    <span>Save</span>
                  </button>
                </div>
              </Show>
            </div>

            <div class="metric-icon-wrap text-[#8696a0] shrink-0">
              <Clock size={20} />
            </div>
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
                props.detailTab === 'contacts'
                  ? 'translateX(0%)'
                  : props.detailTab === 'template'
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
              props.detailTab === 'contacts'
                ? 'text-[#e9edef]'
                : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => props.setDetailTab('contacts')}
          >
            <Users size={14} class={props.detailTab === 'contacts' ? 'text-[#00a884]' : ''} />
            <span class="truncate">Target Contacts ({props.recipients.length})</span>
          </button>

          <button
            type="button"
            style={{ border: 'none', background: 'transparent' }}
            class={`relative z-10 flex-1 h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 select-none ${
              props.detailTab === 'template'
                ? 'text-[#e9edef]'
                : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => props.setDetailTab('template')}
          >
            <FileText size={14} class={props.detailTab === 'template' ? 'text-[#00a884]' : ''} />
            <span class="truncate">Message Template</span>
          </button>

          <button
            type="button"
            style={{ border: 'none', background: 'transparent' }}
            class={`relative z-10 flex-1 h-8 px-2.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-colors duration-150 select-none ${
              props.detailTab === 'runs' ? 'text-[#e9edef]' : 'text-[#8696a0] hover:text-[#e9edef]'
            }`}
            onClick={() => props.setDetailTab('runs')}
          >
            <History size={14} class={props.detailTab === 'runs' ? 'text-[#00a884]' : ''} />
            <span class="truncate">Run Logs ({props.runs.length})</span>
          </button>
        </div>
      </div>
    </>
  );
}
