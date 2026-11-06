import { createSignal, createMemo, onSettled, Show, For, Switch, Match } from 'solid-js';
import {
  selectedRunId,
  setSelectedRunId,
  resendRecipient,
  controlCampaign,
  setActiveModal
} from '../store';
import type { CampaignRun, DeliveryLog, Recipient } from '../types';
import {
  History,
  ChevronDown,
  CheckCheck,
  Check,
  RotateCw,
  AlertCircle,
  Inbox,
  Pause,
  Clock,
  Search,
  Filter,
  X,
  Play,
  Plus,
  Square
} from '../../icons';
import { Progress } from '@kobalte/core/progress';

export default function CampaignRunLogsTab(props: {
  campaignId: number;
  campaignName: string;
  campaignAccountId: string;
  campaignStatus: string;
  runs: CampaignRun[];
  recipients: Recipient[];
  logs: DeliveryLog[];
}) {
  const [logSearchQuery, setLogSearchQuery] = createSignal('');
  const [logStatusFilter, setLogStatusFilter] = createSignal<string>('all');
  const [runDropdownOpen, setRunDropdownOpen] = createSignal(false);
  let runDropdownRef: HTMLDivElement | undefined;

  const currentRun = () => {
    const list = props.runs;
    const selId = selectedRunId();
    return list.find((r) => r.id === selId) || list[0];
  };

  const displayRunRows = createMemo(() => {
    const run = currentRun();
    if (!run) return [];

    const runLogs = (props.logs || []).filter((l) => l.run_id === run.id);
    const isRunning =
      props.campaignStatus === 'running' ||
      props.campaignStatus === 'paused' ||
      run.status === 'running' ||
      run.status === 'paused';

    // 1. When the campaign is running (or paused):
    // Display ALL recipients in the campaign queue so user can observe real-time
    // status changes (queued -> typing -> sent / failed / retrying) across all messages.
    if (isRunning) {
      const allRecipients = props.recipients || [];
      const logMap = new Map();
      for (const l of runLogs) {
        if (l.recipient_id && !logMap.has(l.recipient_id)) logMap.set(l.recipient_id, l);
        if (!logMap.has(l.jid)) logMap.set(l.jid, l);
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
            sender: log.sender_account || props.campaignAccountId,
            status: log.status,
            detail: log.message_id ? `ID: ${log.message_id}` : log.error_reason || '—',
            timestamp: log.timestamp
              ? new Date(log.timestamp * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : '—'
          };
        }

        const st = r.status?.toLowerCase() || 'queued';
        let detail = 'Waiting in delivery queue';
        let timestamp = 'Queued';

        if (st === 'typing') {
          detail = 'Simulating typing presence...';
          timestamp = 'In progress';
        } else if (st === 'sent') {
          detail = 'Sent & delivered';
          timestamp = r.sent_at
            ? new Date(r.sent_at * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            : 'Sent';
        } else if (st === 'failed') {
          detail = r.error_reason || 'Delivery failed';
          timestamp = 'Failed';
        } else if (st === 'retrying') {
          detail = 'Retrying delivery...';
          timestamp = 'Retrying';
        }

        return {
          id: r.id,
          recipient_id: r.id,
          num: i + 1,
          name: r.display_name || r.phone_number,
          phone: r.phone_number,
          jid: r.jid,
          sender: props.campaignAccountId,
          status: st,
          detail,
          timestamp
        };
      });
    }

    // 2. If this run is COMPLETED or FAILED (historical finished execution):
    if (run.status === 'completed' || run.status === 'failed') {
      const seen = new Set<string>();
      const finalLogs = [];
      for (const l of runLogs) {
        const key = l.recipient_id ? `rec_${l.recipient_id}` : l.jid;
        if (!seen.has(key)) {
          seen.add(key);
          finalLogs.push(l);
        }
      }
      return finalLogs.map((l, i) => ({
        id: l.id,
        recipient_id: l.recipient_id,
        num: i + 1,
        name: l.display_name || l.phone_number,
        phone: l.phone_number,
        jid: l.jid,
        sender: l.sender_account,
        status: l.status,
        detail: l.message_id ? `ID: ${l.message_id}` : l.error_reason || '—',
        timestamp: l.timestamp
          ? new Date(l.timestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          : '—'
      }));
    }
    if (run.status === 'aborted') {
      const allRecipients = props.recipients;
      const allCampaignLogs = props.logs || [];
      const logMap = new Map();
      for (const l of runLogs) {
        if (l.recipient_id && !logMap.has(l.recipient_id)) logMap.set(l.recipient_id, l);
        if (!logMap.has(l.jid)) logMap.set(l.jid, l);
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
            detail: log.message_id ? `ID: ${log.message_id}` : log.error_reason || '—',
            timestamp: log.timestamp
              ? new Date(log.timestamp * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : '—'
          };
        }

        const resentLog = allCampaignLogs.find(
          (l) => (l.recipient_id === r.id || l.jid === r.jid) && l.status === 'sent'
        );
        if (resentLog || r.status === 'sent') {
          return {
            id: r.id,
            recipient_id: r.id,
            num: i + 1,
            name: resentLog?.display_name || r.display_name || r.phone_number,
            phone: resentLog?.phone_number || r.phone_number,
            jid: r.jid,
            sender: resentLog?.sender_account || props.campaignAccountId,
            status: 'sent',
            detail: resentLog?.message_id ? `ID: ${resentLog.message_id}` : 'Resent & delivered',
            timestamp: resentLog?.timestamp
              ? new Date(resentLog.timestamp * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : 'Resent'
          };
        }

        const inProgress = r.status === 'queued' || r.status === 'typing';
        if (inProgress) {
          return {
            id: r.id,
            recipient_id: r.id,
            num: i + 1,
            name: r.display_name || r.phone_number,
            phone: r.phone_number,
            jid: r.jid,
            sender: props.campaignAccountId,
            status: r.status === 'typing' ? 'typing' : 'queued',
            detail:
              r.status === 'typing' ? 'Simulating typing presence...' : 'Waiting in delivery queue',
            timestamp: r.status === 'typing' ? 'In progress' : 'Queued'
          };
        }

        return {
          id: r.id,
          recipient_id: r.id,
          num: i + 1,
          name: r.display_name || r.phone_number,
          phone: r.phone_number,
          jid: r.jid,
          sender: props.campaignAccountId,
          status: 'aborted',
          detail: 'Aborted before dispatch',
          timestamp: 'Aborted'
        };
      });
    }

    const allRecipients = props.recipients;
    const logMap = new Map();
    for (const l of runLogs) {
      if (l.recipient_id && !logMap.has(l.recipient_id)) logMap.set(l.recipient_id, l);
      if (!logMap.has(l.jid)) logMap.set(l.jid, l);
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
          detail: log.message_id ? `ID: ${log.message_id}` : log.error_reason || '—',
          timestamp: log.timestamp
            ? new Date(log.timestamp * 1000).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            : '—'
        };
      }

      return {
        id: r.id,
        recipient_id: r.id,
        num: i + 1,
        name: r.display_name || r.phone_number,
        phone: r.phone_number,
        jid: r.jid,
        sender: props.campaignAccountId,
        status: r.status === 'typing' ? 'typing' : 'queued',
        detail:
          r.status === 'typing' ? 'Simulating typing presence...' : 'Waiting in delivery queue',
        timestamp: r.status === 'typing' ? 'In progress' : 'Queued'
      };
    });
  });

  const filteredRunRows = createMemo(() => {
    let rows = displayRunRows();
    const st = logStatusFilter().toLowerCase();
    if (st !== 'all') {
      rows = rows.filter((r) => r.status.toLowerCase() === st);
    }
    const q = logSearchQuery().toLowerCase().trim();
    if (q) {
      rows = rows.filter(
        (r) =>
          (r.name && r.name.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q)) ||
          (r.jid && r.jid.toLowerCase().includes(q)) ||
          (r.detail && r.detail.toLowerCase().includes(q)) ||
          (r.sender && r.sender.toLowerCase().includes(q))
      );
    }
    return rows;
  });

  onSettled(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (runDropdownOpen() && runDropdownRef && !runDropdownRef.contains(target)) {
        setRunDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRunDropdownOpen(false);
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
    <div class="space-y-4">
      {/* Header with Run Selector Dropdown (Outside card layout) */}
      <div class="flex items-center justify-between flex-wrap gap-4 px-0">
        <div class="flex items-center gap-2">
          <History size={16} class="text-[#00a884]" />
          <h2 class="text-sm font-bold text-[#e9edef] tracking-wide">
            Campaign Run History & Delivery Logs
          </h2>
        </div>

        <div class="flex items-center gap-2.5">
          <span class="text-xs text-[#8696a0]">Execution Run:</span>
          <Show
            when={props.runs.length > 0}
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
                      : currentRun()?.status === props.campaignStatus
                        ? 'bg-[#00a884]'
                        : currentRun()?.status === 'draft' || currentRun()?.status === 'pending'
                          ? 'bg-[#8696a0]'
                          : currentRun()?.status === 'paused'
                            ? 'bg-[#ffbc38]'
                            : 'bg-[#f15c6d]'
                  }`}
                />
                <span>
                  Run #{currentRun()?.run_number} &bull; {currentRun()?.status.toUpperCase()}
                </span>
                <ChevronDown
                  size={14}
                  class={`text-[#8696a0] transition-transform duration-150 ${runDropdownOpen() ? 'rotate-180 text-[#00a884]' : ''}`}
                />
              </button>

              <Show when={runDropdownOpen()}>
                <div class="absolute right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-dropdown p-1 z-50 min-w-[230px] max-h-[260px] overflow-y-auto space-y-0.5 animate-popover">
                  <For each={props.runs}>
                    {(r) => (
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
                                : r.status === props.campaignStatus
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
          <div class="card p-0 overflow-hidden">
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
                This campaign hasn't been launched yet. Once dispatched, every execution run,
                human-pacing typing presence, and delivery confirmation will be logged here.
              </p>

              <Show
                when={props.recipients.length > 0}
                fallback={
                  <button
                    type="button"
                    class="btn-accent h-9 px-4 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md hover:scale-[1.02]"
                    onClick={() =>
                      setActiveModal({ type: 'add_contacts', campaignId: props.campaignId })
                    }
                  >
                    <Plus size={14} />
                    <span>Add Target Contacts First</span>
                  </button>
                }
              >
                <button
                  type="button"
                  class="btn-accent h-9 px-4 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-md hover:scale-[1.02]"
                  onClick={() => controlCampaign(props.campaignId, 'resume')}
                >
                  <Play size={14} />
                  <span>Launch Campaign ({props.recipients.length} contacts)</span>
                </button>
              </Show>
            </div>
          </div>
        }
      >
        {(run) => {
          const startedTime = () =>
            new Date(run().started_at * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
          const completedTime = () =>
            run().completed_at
              ? new Date(run().completed_at! * 1000).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                })
              : null;
          const dateStr = () =>
            new Date(run().started_at * 1000).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });

          const durationSecs = () => {
            if (run().completed_at && run().completed_at! > run().started_at) {
              return run().completed_at! - run().started_at;
            } else if (run().status === 'running') {
              return Math.max(0, Math.floor(Date.now() / 1000) - run().started_at);
            }
            return 0;
          };

          const durStr = () => {
            const secs = durationSecs();
            if (run().status === props.campaignStatus && secs > 3600 && run().total_count < 20) {
              return `~${Math.max(12, run().total_count * 20)}s`;
            } else if (secs >= 3600) {
              return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
            } else if (secs >= 60) {
              return `${Math.floor(secs / 60)}m ${secs % 60}s`;
            }
            return `${secs}s`;
          };
          const pct = () =>
            run().total_count > 0
              ? Math.min(100, Math.round((run().sent_count / run().total_count) * 100))
              : 0;

          return (
            <>
              {/* 2. Standalone Elevated Execution Run Summary Card */}
              <div class="card p-4 px-5">
                <div class="flex items-center justify-between flex-wrap gap-4">
                  {/* Left: Run Hero Identity & Timestamps */}
                  <div class="flex items-center gap-3.5 min-w-0">
                    <div
                      class={`w-10 h-10 rounded-xl bg-[#111b21] border border-[#2a3942] flex items-center justify-center shrink-0 ${
                        run().status === props.campaignStatus
                          ? 'text-[#00a884]'
                          : run().status === 'running'
                            ? 'text-[#53bdeb]'
                            : run().status === 'draft' || run().status === 'pending'
                              ? 'text-[#8696a0]'
                              : run().status === 'paused'
                                ? 'text-[#ffbc38]'
                                : 'text-[#f15c6d]'
                      }`}
                    >
                      <Show
                        when={run().status === props.campaignStatus}
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
                        <span class={`pill ${run().status}`}>{run().status.toUpperCase()}</span>
                      </div>
                      <div class="text-[11.5px] text-[#8696a0] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{dateStr()}</span>
                        <span>&bull;</span>
                        <span>
                          {startedTime()} {completedTime() ? `\u2192 ${completedTime()}` : ''}
                        </span>
                        <span>&bull;</span>
                        <span class="text-[#e9edef] font-medium">
                          Duration:{' '}
                          {durationSecs() > 0
                            ? durStr()
                            : run().status === 'draft' || run().status === 'pending'
                              ? 'Not started'
                              : '0s'}
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
                            class="mini-progress-fill h-full bg-linear-to-r from-[#00a884] to-[#00c49f] rounded-full transition-all"
                            style={{ width: `${pct()}%` }}
                          />
                        </Progress.Track>
                      </Progress>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Standalone Execution Delivery Logs Table Card */}
              <div class="card p-0 overflow-hidden">
                {/* Search by Name/Number & Filter by Status Toolbar */}
                <div class="p-3 px-5 border-b border-[#222d34] flex items-center justify-between flex-wrap gap-3 bg-[#111b21]/40">
                  <div class="relative w-64 sm:w-72">
                    <Search
                      size={13}
                      class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8696a0]"
                    />
                    <input
                      type="text"
                      placeholder="Search by name or number..."
                      class="w-full bg-[#182229] border border-[#2a3942] rounded-lg pl-8 pr-7 h-8 text-xs text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition-colors"
                      value={logSearchQuery()}
                      onInput={(e) => setLogSearchQuery(e.currentTarget.value)}
                    />
                    <Show when={logSearchQuery()}>
                      <button
                        type="button"
                        class="absolute right-2 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef] cursor-pointer"
                        onClick={() => setLogSearchQuery('')}
                      >
                        <X size={12} />
                      </button>
                    </Show>
                  </div>

                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs text-[#8696a0] mr-1 flex items-center gap-1">
                      <Filter size={11} />
                      <span>Status:</span>
                    </span>
                    <For
                      each={[
                        { key: 'all', label: 'All' },
                        { key: 'sent', label: 'Sent' },
                        { key: 'failed', label: 'Failed' },
                        { key: 'retrying', label: 'Retrying' },
                        { key: 'typing', label: 'Typing' },
                        { key: 'queued', label: 'Queued' }
                      ]}
                    >
                      {(item) => {
                        const count = () =>
                          item.key === 'all'
                            ? displayRunRows().length
                            : displayRunRows().filter((r) => r.status.toLowerCase() === item.key)
                                .length;
                        const isSelected = () => logStatusFilter() === item.key;
                        const isCommon =
                          item.key === 'all' || item.key === 'sent' || item.key === 'failed';
                        if (!isCommon && count() === 0 && !isSelected()) return null;

                        return (
                          <button
                            type="button"
                            style={{
                              background: isSelected() ? 'rgba(0,168,132,0.15)' : 'transparent',
                              border: isSelected()
                                ? '1px solid rgba(0,168,132,0.45)'
                                : '1px solid #2a3942',
                              color: isSelected() ? '#00a884' : '#8696a0'
                            }}
                            class="h-7 px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all hover:text-[#e9edef] hover:border-[#8696a0] flex items-center gap-1"
                            onClick={() => setLogStatusFilter(item.key)}
                          >
                            <span>{item.label}</span>
                            <span class="text-[10px] font-mono opacity-80">({count()})</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </div>

                <Show
                  when={displayRunRows().length > 0}
                  fallback={
                    <div class="py-14 px-6 text-center flex flex-col items-center justify-center">
                      <div class="w-14 h-14 rounded-2xl bg-[#111b21] border border-[#2a3942] flex items-center justify-center text-[#8696a0] mb-3.5 shadow-inner">
                        <Show
                          when={currentRun()?.status === 'running'}
                          fallback={
                            <Show
                              when={currentRun()?.status === props.campaignStatus}
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
                          <Match when={currentRun()?.status === props.campaignStatus}>
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
                            This execution run is staged as a draft. Start the campaign to begin
                            anti-ban human typing simulation and queue message dispatches.
                          </Match>
                          <Match when={currentRun()?.status === 'running'}>
                            The background worker is currently preparing recipient queues and human
                            pacing delays. Live dispatches will appear shortly.
                          </Match>
                          <Match when={currentRun()?.status === props.campaignStatus}>
                            This execution run finished with 0 recorded recipient messages.
                          </Match>
                          <Match when={currentRun()?.status === 'aborted'}>
                            Execution was cancelled before any messages were dispatched to WhatsApp
                            recipients.
                          </Match>
                        </Switch>
                      </p>

                      <Show
                        when={
                          currentRun()?.status === 'draft' &&
                          (props.campaignStatus === 'draft' || props.campaignStatus === 'pending')
                        }
                      >
                        <Show
                          when={props.recipients.length > 0}
                          fallback={
                            <button
                              type="button"
                              class="btn-accent h-8 px-3.5 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                              onClick={() =>
                                setActiveModal({
                                  type: 'add_contacts',
                                  campaignId: props.campaignId
                                })
                              }
                            >
                              <Plus size={13} />
                              <span>Add Target Contacts</span>
                            </button>
                          }
                        >
                          <button
                            type="button"
                            class="btn-accent h-8 px-4 text-xs font-semibold rounded-lg flex items-center gap-2 cursor-pointer transition-colors shadow-xs"
                            onClick={() => controlCampaign(props.campaignId, 'resume')}
                          >
                            <Play size={13} />
                            <span>Start Campaign ({props.recipients.length} contacts)</span>
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
                        <Show when={filteredRunRows().length === 0}>
                          <tr>
                            <td colspan="8" class="text-center py-12 text-[#8696a0] text-xs">
                              <Show
                                when={logSearchQuery() || logStatusFilter() !== 'all'}
                                fallback="No delivery logs recorded for this run."
                              >
                                <div class="flex flex-col items-center justify-center gap-2.5">
                                  <span>No recipients match your search or filter criteria.</span>
                                  <button
                                    type="button"
                                    style={{
                                      background: 'rgba(0,168,132,0.12)',
                                      border: '1px solid rgba(0,168,132,0.3)',
                                      color: '#00a884'
                                    }}
                                    class="h-6 px-3 text-[11px] font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-all hover:bg-[#00a884]/20 hover:border-[#00a884]/50 shadow-none"
                                    onClick={() => {
                                      setLogSearchQuery('');
                                      setLogStatusFilter('all');
                                    }}
                                  >
                                    <RotateCw size={11} stroke-width={2.5} />
                                    <span>Reset Filters</span>
                                  </button>
                                </div>
                              </Show>
                            </td>
                          </tr>
                        </Show>
                        <For each={filteredRunRows()}>
                          {(row) => (
                            <tr>
                              <td>
                                <span class="text-xs text-[#8696a0] font-mono">{row.num}</span>
                              </td>
                              <td>
                                <strong class="text-xs text-[#e9edef]">{row.name}</strong>
                              </td>
                              <td>
                                <span class="text-xs font-mono text-[#00a884]">{row.phone}</span>
                              </td>
                              <td>
                                <span class="badge text-[10px] font-mono">
                                  {row.sender ||
                                    (props.campaignAccountId.includes(',')
                                      ? 'Pool'
                                      : props.campaignAccountId)}
                                </span>
                              </td>
                              <td>
                                <Switch
                                  fallback={
                                    <span class={`pill ${row.status.toLowerCase()}`}>
                                      {row.status.toUpperCase()}
                                    </span>
                                  }
                                >
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
                                  <Match
                                    when={row.status === 'aborted' || row.status === 'cancelled'}
                                  >
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
                                    <span
                                      class={`text-xs ${row.status === 'failed' ? 'text-[#f15c6d]' : 'text-[#8696a0]'}`}
                                    >
                                      {row.detail}
                                    </span>
                                  }
                                >
                                  <code class="text-xs text-[#8696a0]">{row.detail}</code>
                                </Show>
                              </td>
                              <td>
                                <span class="text-xs text-[#8696a0]">{row.timestamp}</span>
                              </td>
                              <td style={{ 'text-align': 'right' }}>
                                <Show
                                  when={
                                    row.status === 'aborted' ||
                                    row.status === 'cancelled' ||
                                    row.status === 'failed'
                                  }
                                >
                                  <button
                                    class="h-7 px-2.5 text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer bg-[#182229] border border-[#2a3942] hover:border-[#00a884] text-[#00a884] transition-colors ml-auto"
                                    title="Resend this message"
                                    onClick={() =>
                                      resendRecipient(props.campaignId, row.recipient_id)
                                    }
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
              </div>
            </>
          );
        }}
      </Show>
    </div>
  );
}
