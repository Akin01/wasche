import { createSignal, createMemo, For, Show } from 'solid-js';
import { campaigns, switchView, controlCampaign, renameCampaign, setActiveModal } from './store';
import { Progress } from '@kobalte/core/progress';
import { Checkbox } from '@kobalte/core/checkbox';
import {
  Layers,
  Play,
  CheckCircle,
  Pencil,
  Trash2,
  Send,
  Radio,
  Plus,
  Check,
  X,
  Search
} from 'lucide-solid';

export default function CampaignsView() {
  const [selectedCampaignIds, setSelectedCampaignIds] = createSignal<number[]>([]);
  const [editingId, setEditingId] = createSignal<number | null>(null);
  const [editingName, setEditingName] = createSignal<string>('');

  const [searchQuery, setSearchQuery] = createSignal('');

  const filteredCampaigns = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    if (!q) return campaigns();
    return campaigns().filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.account_id.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  });
  const activeCount = () => campaigns().filter((c) => c.status === 'running').length;
  const completedCount = () => campaigns().filter((c) => c.status === 'completed').length;
  const totalSent = () =>
    campaigns().reduce(
      (acc, c) =>
        acc +
        (c.total_sent_all_runs !== undefined && c.total_sent_all_runs !== null
          ? c.total_sent_all_runs
          : c.sent_count),
      0
    );

  const toggleSelectCampaign = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedCampaignIds((prev) => [...prev, id]);
    } else {
      setSelectedCampaignIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleSaveInlineEdit = async (id: number) => {
    const newName = editingName().trim();
    if (newName) {
      await renameCampaign(id, newName);
    }
    setEditingId(null);
  };

  const handleMultiDelete = () => {
    const ids = selectedCampaignIds();
    if (ids.length === 0) return;
    setActiveModal({
      type: 'confirm',
      title: 'Delete Selected Campaigns',
      message: `Are you sure you want to permanently delete ${ids.length} selected campaign(s)? All associated recipient queues and delivery logs will be deleted. This cannot be undone.`,
      onConfirm: async () => {
        for (const id of ids) {
          await controlCampaign(id, 'delete');
        }
        setSelectedCampaignIds([]);
      }
    });
  };

  return (
    <div class="space-y-6">
      {/* Top 4 Macro Summary Cards */}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="metric-card">
          <div class="metric-info">
            <div class="metric-label">Total Campaigns</div>
            <div class="metric-val text-xl font-bold text-[#e9edef]">{campaigns().length}</div>
          </div>
          <div class="metric-icon-wrap text-[#53bdeb]">
            <Layers size={20} />
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <div class="metric-label">Running Campaigns</div>
            <div class="metric-val text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
              <span>{activeCount()}</span>
              <span class="text-xs font-normal text-[#8696a0]">Active</span>
            </div>
          </div>
          <div class="metric-icon-wrap text-[#00a884]">
            <Play size={20} />
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <div class="metric-label">Total Messages Sent</div>
            <div class="metric-val text-xl font-bold text-[#e9edef] flex items-baseline gap-1.5">
              <span>{totalSent()}</span>
              <span class="text-xs font-normal text-[#8696a0]">Sent</span>
            </div>
          </div>
          <div class="metric-icon-wrap text-[#00a884]">
            <Send size={20} />
          </div>
        </div>

        <div class="metric-card">
          <div class="metric-info">
            <div class="metric-label">Completed Campaigns</div>
            <div class="metric-val text-xl font-bold text-[#e9edef]">{completedCount()}</div>
          </div>
          <div class="metric-icon-wrap text-[#8696a0]">
            <CheckCircle size={20} />
          </div>
        </div>
      </div>

      {/* Table Header outside card: 0px left/right padding, flush with cards and table */}
      <div class="flex items-center justify-between flex-wrap gap-4 px-0">
        <div class="flex items-center gap-2.5">
          <Radio size={16} class="text-[#00a884]" />
          <h2 class="text-sm font-bold text-[#e9edef] tracking-wide">All Broadcast Campaigns</h2>
          <span class="text-xs px-2 py-0.5 rounded-full bg-[#182229] border border-[#2a3942] text-[#8696a0] font-mono">
            {filteredCampaigns().length}
          </span>
        </div>

        <div class="flex items-center gap-3">
          {/* Search Input Bar */}
          <div class="relative w-56 sm:w-64">
            <Search size={13} class="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8696a0]" />
            <input
              type="text"
              placeholder="Search campaigns..."
              class="w-full bg-[#111b21] border border-[#2a3942] rounded-lg pl-8 pr-7 h-8 text-xs text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition-colors"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <Show when={searchQuery()}>
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef] cursor-pointer"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            </Show>
          </div>

          {/* Create or Multi-Delete Button */}
          <Show
            when={selectedCampaignIds().length > 0}
            fallback={
              <button
                class="btn-accent h-8 px-3 text-xs font-medium flex items-center gap-1.5 rounded-lg cursor-pointer"
                onClick={() => setActiveModal({ type: 'create_campaign' })}
              >
                <Plus size={13} />
                <span>Create</span>
              </button>
            }
          >
            <button
              class="btn-danger h-8 px-3 text-xs font-medium flex items-center gap-1.5 rounded-lg cursor-pointer animate-fade"
              onClick={handleMultiDelete}
            >
              <Trash2 size={13} />
              <span>Delete ({selectedCampaignIds().length})</span>
            </button>
          </Show>
        </div>
      </div>

      {/* Campaigns Table Card */}
      <div class="card p-0 overflow-hidden">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                {/* Multi-Select All Checkbox Column */}
                <th style={{ width: '40px', 'text-align': 'center' }}>
                  <Checkbox
                    checked={
                      filteredCampaigns().length > 0 &&
                      filteredCampaigns().every((c) => selectedCampaignIds().includes(c.id))
                    }
                    onChange={(checked) => {
                      if (checked) {
                        setSelectedCampaignIds(filteredCampaigns().map((c) => c.id));
                      } else {
                        setSelectedCampaignIds([]);
                      }
                    }}
                  >
                    <Checkbox.Input class="sr-only" />
                    <Checkbox.Control class="w-4 h-4 rounded border border-[#2a3942] bg-[#182229] flex items-center justify-center cursor-pointer">
                      <Checkbox.Indicator>
                        <Check size={11} class="text-[#00a884]" />
                      </Checkbox.Indicator>
                    </Checkbox.Control>
                  </Checkbox>
                </th>
                <th style={{ width: '50px' }}>#</th>
                <th>Campaign Name</th>
                <th>Sender Account</th>
                <th>Status</th>
                <th style={{ 'min-width': '160px' }}>Delivery Progress</th>
                <th>Sent / Total</th>
                <th>Anti-Ban Delay</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={filteredCampaigns().length > 0}
                fallback={
                  <tr>
                    <td colspan="8" class="text-center py-12 text-[#8696a0]">
                      <Show
                        when={searchQuery()}
                        fallback="No broadcast campaigns found. Click '+ Create Campaign' to get started."
                      >
                        No broadcast campaigns match "{searchQuery()}".
                      </Show>
                    </td>
                  </tr>
                }
              >
                <For each={filteredCampaigns()}>
                  {(c) => {
                    const isChecked = () => selectedCampaignIds().includes(c.id);
                    const pct = () =>
                      c.total_count > 0
                        ? Math.min(100, Math.round((c.sent_count / c.total_count) * 100))
                        : 0;

                    return (
                      <tr class={isChecked() ? 'bg-[#202c33]/40' : ''}>
                        {/* Row Selection Checkbox */}
                        <td style={{ 'text-align': 'center' }}>
                          <Checkbox
                            checked={isChecked()}
                            onChange={(ch) => toggleSelectCampaign(c.id, ch)}
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
                          <span class="code-badge">#{c.id}</span>
                        </td>

                        {/* Campaign Name with Inline Pencil Editing */}
                        <td>
                          <Show
                            when={editingId() === c.id}
                            fallback={
                              <div class="flex items-center gap-2 group">
                                <button
                                  type="button"
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0',
                                    'text-align': 'left'
                                  }}
                                  class="clickable-row text-sm font-bold text-[#e9edef] hover:text-[#00a884] cursor-pointer"
                                  onClick={() => switchView('campaign-detail', c.id)}
                                >
                                  {c.name}
                                </button>
                                <button
                                  style={{
                                    border: 'none',
                                    background: 'transparent',
                                    padding: '0'
                                  }}
                                  class="text-[#8696a0] hover:text-[#00a884] opacity-50 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5 flex items-center"
                                  title="Rename Campaign inline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(c.id);
                                    setEditingName(c.name);
                                  }}
                                >
                                  <Pencil size={13} />
                                </button>
                              </div>
                            }
                          >
                            <div
                              class="flex items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                class="bg-[#111b21] border border-[#00a884] rounded-lg px-2.5 py-1 text-xs text-[#e9edef] focus:outline-none focus:ring-1 focus:ring-[#00a884] min-w-[200px]"
                                value={editingName()}
                                onInput={(e) => setEditingName(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveInlineEdit(c.id);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                autofocus
                              />
                              <button
                                style={{ border: 'none', background: 'transparent' }}
                                class="text-[#00a884] hover:text-[#06cf9c] cursor-pointer p-1"
                                title="Save Name"
                                onClick={() => handleSaveInlineEdit(c.id)}
                              >
                                <Check size={14} />
                              </button>
                              <button
                                style={{ border: 'none', background: 'transparent' }}
                                class="text-[#8696a0] hover:text-[#e9edef] cursor-pointer p-1"
                                title="Cancel"
                                onClick={() => setEditingId(null)}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </Show>
                        </td>

                        <td>
                          <span class="badge">{c.account_id}</span>
                        </td>

                        <td>
                          <span class={`pill ${c.status}`}>{c.status}</span>
                        </td>

                        <td>
                          <Progress value={pct()} class="w-full">
                            <Progress.Track class="mini-progress-bar h-2 bg-[#202c33] rounded-full overflow-hidden border border-[#2a3942]">
                              <Progress.Fill
                                class="mini-progress-fill h-full bg-linear-to-r from-[#00a884] to-[#00c49f] rounded-full transition-all"
                                style={{ width: `${pct()}%` }}
                              />
                            </Progress.Track>
                          </Progress>
                          <span class="text-[11px] text-[#8696a0] mt-1 block">
                            {c.sent_count}/{c.total_count} ({pct()}%)
                          </span>
                        </td>

                        <td>
                          <code class="text-xs">
                            {c.sent_count} / {c.total_count}
                          </code>
                          <Show when={(c.total_sent_all_runs ?? 0) > c.sent_count}>
                            <span
                              class="text-[10px] text-[#8696a0] block font-mono mt-0.5"
                              title="Total messages sent across all historical runs of this campaign"
                            >
                              {c.total_sent_all_runs} across runs
                            </span>
                          </Show>
                        </td>

                        <td>
                          <span class="text-xs text-[#8696a0]">
                            {c.min_delay_secs}s &ndash; {c.max_delay_secs}s
                          </span>
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
    </div>
  );
}
