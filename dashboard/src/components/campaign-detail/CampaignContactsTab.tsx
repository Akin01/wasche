import { createSignal, createMemo, Show, For } from 'solid-js';
import { Checkbox } from '@kobalte/core/checkbox';
import { deleteRecipients, setActiveModal } from '../store';
import type { Recipient } from '../types';
import { Search, Plus, Trash2, Check, Filter, X, RotateCw } from '../../icons';

export default function CampaignContactsTab(props: {
  campaignId: number;
  recipients: Recipient[];
}) {
  const [searchQuery, setSearchQuery] = createSignal('');
  const [recipientStatusFilter, setRecipientStatusFilter] = createSignal<string>('all');
  const [selectedRecipientIds, setSelectedRecipientIds] = createSignal<number[]>([]);

  const filteredRecipients = createMemo(() => {
    let recs = props.recipients;
    const st = recipientStatusFilter().toLowerCase();
    if (st !== 'all') {
      recs = recs.filter((r) => r.status.toLowerCase() === st);
    }
    const q = searchQuery().toLowerCase().trim();
    if (q) {
      recs = recs.filter(
        (r) =>
          (r.display_name && r.display_name.toLowerCase().includes(q)) ||
          r.phone_number.includes(q) ||
          r.jid.includes(q)
      );
    }
    return recs;
  });

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRecipientIds(filteredRecipients().map((r) => r.id));
    } else {
      setSelectedRecipientIds([]);
    }
  };

  const toggleSelectRecipient = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedRecipientIds((prev) => [...prev, id]);
    } else {
      setSelectedRecipientIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const handleDeleteSelectedRecipients = () => {
    const ids = selectedRecipientIds();
    if (ids.length === 0) return;
    setActiveModal({
      type: 'confirm',
      title: 'Remove Target Contacts',
      message: `Are you sure you want to remove ${ids.length} selected contact(s) from this campaign?`,
      onConfirm: async () => {
        await deleteRecipients(props.campaignId, ids);
        setSelectedRecipientIds([]);
      }
    });
  };

  return (
    <div class="card rounded-2xl p-0 overflow-hidden">
      <div class="p-3.5 px-6 border-b border-border flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3 flex-wrap flex-1">
          <div class="relative w-64 sm:w-72">
            <Search size={14} class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search contacts by name or number..."
              class="w-full bg-[#111b21] border border-border-light rounded-lg pl-8 pr-7 h-8 text-xs text-text-main placeholder-text-muted focus:outline-none focus:border-accent"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <Show when={searchQuery()}>
              <button
                type="button"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
                onClick={() => setSearchQuery('')}
              >
                <X size={12} />
              </button>
            </Show>
          </div>

          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs text-text-muted mr-1 flex items-center gap-1">
              <Filter size={11} />
              <span>Status:</span>
            </span>
            <For
              each={[
                { key: 'all', label: 'All' },
                { key: 'queued', label: 'Queued' },
                { key: 'sent', label: 'Sent' },
                { key: 'failed', label: 'Failed' }
              ]}
            >
              {(item) => {
                const count = () =>
                  item.key === 'all'
                    ? props.recipients.length
                    : props.recipients.filter((r) => r.status.toLowerCase() === item.key).length;
                const isSelected = () => recipientStatusFilter() === item.key;
                return (
                  <button
                    type="button"
                    style={{
                      background: isSelected() ? 'rgba(0,168,132,0.15)' : 'transparent',
                      border: isSelected() ? '1px solid rgba(0,168,132,0.45)' : '1px solid #2a3942',
                      color: isSelected() ? '#00a884' : '#8696a0'
                    }}
                    class="h-7 px-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all hover:text-text-main hover:border-text-muted flex items-center gap-1"
                    onClick={() => setRecipientStatusFilter(item.key)}
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
          when={selectedRecipientIds().length > 0}
          fallback={
            <button
              class="btn-accent h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
              onClick={() => setActiveModal({ type: 'add_contacts', campaignId: props.campaignId })}
            >
              <Plus size={13} />
              <span>Add</span>
            </button>
          }
        >
          <button
            class="btn-danger h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer animate-fade"
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
                  onChange={(checked) => toggleSelectAll(checked)}
                >
                  <Checkbox.Input class="sr-only" />
                  <Checkbox.Control class="w-4 h-4 rounded border border-border-light bg-card flex items-center justify-center cursor-pointer">
                    <Checkbox.Indicator>
                      <Check size={11} class="text-accent" />
                    </Checkbox.Indicator>
                  </Checkbox.Control>
                </Checkbox>
              </th>
              <th style={{ width: '45px' }}>#</th>
              <th>Contact Name</th>
              <th>Phone Number</th>
              <th>WhatsApp JID</th>
            </tr>
          </thead>
          <tbody>
            <Show
              when={filteredRecipients().length > 0}
              fallback={
                <tr>
                  <td colspan="5" class="text-center py-12 text-text-muted text-xs">
                    <Show
                      when={searchQuery() || recipientStatusFilter() !== 'all'}
                      fallback="No target contacts in this campaign. Click 'Add' to populate your queue."
                    >
                      <div class="flex flex-col items-center justify-center gap-2.5">
                        <span>No contacts match your search or filter criteria.</span>
                        <button
                          type="button"
                          style={{
                            background: 'rgba(0,168,132,0.12)',
                            border: '1px solid rgba(0,168,132,0.3)',
                            color: '#00a884'
                          }}
                          class="h-6 px-3 text-[11px] font-semibold rounded-md flex items-center gap-1.5 cursor-pointer transition-all hover:bg-[#00a884]/20 hover:border-[#00a884]/50 shadow-none"
                          onClick={() => {
                            setSearchQuery('');
                            setRecipientStatusFilter('all');
                          }}
                        >
                          <RotateCw size={11} stroke-width={2.5} />
                          <span>Reset Filters</span>
                        </button>
                      </div>
                    </Show>
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
                          onChange={(ch) => toggleSelectRecipient(r.id, ch)}
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
                          const rJid = () =>
                            r.jid && r.jid.includes('@')
                              ? r.jid
                              : `${r.phone_number.replace(/\D/g, '')}@s.whatsapp.net`;
                          return (
                            <div class="flex items-center gap-2.5">
                              <div class="relative w-7 h-7 shrink-0">
                                <img
                                  src={`/api/contacts/${encodeURIComponent(rJid())}/avatar-image`}
                                  alt={r.display_name || 'Recipient'}
                                  loading="lazy"
                                  referrerpolicy="no-referrer"
                                  class="w-7 h-7 rounded-full object-cover border border-[#2a3942] shrink-0"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const next = e.currentTarget
                                      .nextElementSibling as HTMLElement | null;
                                    if (next) next.style.display = 'flex';
                                  }}
                                />
                                <div
                                  style={{ display: 'none' }}
                                  class="w-7 h-7 rounded-full bg-[#202c33] border border-[#2a3942] items-center justify-center text-xs font-bold text-[#00a884] shrink-0"
                                >
                                  {(r.display_name || r.phone_number || 'U')
                                    .charAt(0)
                                    .toUpperCase()}
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
                        <span class="text-xs font-mono text-[#00a884]">{r.phone_number}</span>
                      </td>
                      <td>
                        <span class="text-xs font-mono text-[#8696a0]">
                          {r.jid && r.jid.includes('@')
                            ? r.jid
                            : `${r.phone_number.replace(/\D/g, '')}@s.whatsapp.net`}
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
  );
}
