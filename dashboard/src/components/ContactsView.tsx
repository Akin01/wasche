import { createSignal, onMount, onCleanup, Show, For } from 'solid-js';
import {
  contacts,
  contactsTotal,
  contactsLoading,
  contactsHasMore,
  contactsSearchQuery,
  setContactsSearchQuery,
  selectedAccountForContacts,
  setSelectedAccountForContacts,
  accounts,
  fetchContacts,
  syncContacts,
  setActiveModal
} from './store';
import { Select } from '@kobalte/core/select';
import { getAccountStatusState } from './types';
import {
  Users,
  Search,
  RefreshCw,
  Send,
  Smartphone,
  ChevronDown,
  Check
} from 'lucide-solid';
export default function ContactsView() {
  let searchTimer: any;
  const handleSearch = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const q = e.currentTarget.value;
    setContactsSearchQuery(q);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      fetchContacts(q, selectedAccountForContacts());
    }, 250);
  };

  const handleTableScroll = (e: Event) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 140) {
      if (!contactsLoading() && contactsHasMore()) {
        fetchContacts(contactsSearchQuery(), selectedAccountForContacts(), true);
      }
    }
  };

  const [accountDropdownOpen, setAccountDropdownOpen] = createSignal(false);
  let dropdownWrapRef: HTMLDivElement | undefined;

  onMount(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownWrapRef && !dropdownWrapRef.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    onCleanup(() => {
      document.removeEventListener('mousedown', handleOutsideClick);
    });
  });

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

  const handleAccountChange = (acc: string) => {
    setSelectedAccountForContacts(acc);
    fetchContacts(contactsSearchQuery(), acc);
  };
  return (
    <div class="space-y-6">
      {/* Header and Controls Card */}
      <div class="card p-4 px-5 flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884]">
            <Users size={20} />
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#e9edef] tracking-wide">
              WhatsApp Contacts Archive
            </h2>
            <p class="text-xs text-[#8696a0]">
              Synced address book contacts and JID mappings across your linked WhatsApp accounts.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5 flex-wrap">
          {/* Search Input */}
          <div class="search-input-wrap">
            <Search size={14} class="search-icon" />
            <input
              type="text"
              placeholder="Search contacts..."
              class="search-input"
              value={contactsSearchQuery()}
              onInput={handleSearch}
            />
          </div>

          {/* Account Filter */}
          {/* Account Filter Custom Dropdown */}
          <div class="relative shrink-0" ref={dropdownWrapRef}>
            <button
              type="button"
              style={{ border: '1px solid #2a3942', background: '#182229' }}
              class="h-8 px-3 rounded-lg text-xs text-[#e9edef] flex items-center justify-between gap-2.5 cursor-pointer hover:border-[#00a884] transition-colors focus:outline-none focus:border-[#00a884] min-w-[155px]"
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen())}
            >
              <div class="flex items-center gap-2 truncate">
                {selectedAccountForContacts() === 'all' ? (
                  <Users size={13} class="text-[#00a884] shrink-0" />
                ) : (
                  <Smartphone size={13} class="text-[#00a884] shrink-0" />
                )}
                <span class="font-medium text-[#e9edef] truncate">
                  {selectedAccountForContacts() === 'all' ? 'All Accounts' : selectedAccountForContacts()}
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
                    const isSelected = () => opt.value === selectedAccountForContacts();
                    const isAll = opt.value === 'all';
                    return (
                      <div
                        class={`px-2.5 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                          isSelected()
                            ? 'bg-[#202c33] text-[#00a884]'
                            : 'text-[#e9edef] hover:bg-[#202c33]'
                        }`}
                        onClick={() => {
                          handleAccountChange(opt.value);
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
          {/* Sync Button */}
          <button
            class="btn-secondary h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
            onClick={() => syncContacts()}
            title="Sync WhatsApp contacts archive"
          >
            <RefreshCw size={13} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Contacts Table */}
      <div class="card p-0 overflow-hidden">
        <div class="p-3 px-5 border-b border-[#222d34] flex items-center justify-between text-xs text-[#8696a0]">
          <span>
            Showing {contacts().length} of {contactsTotal()} contacts
          </span>
          <Show when={contactsLoading()}>
            <span class="text-[#00a884] flex items-center gap-1">
              <RefreshCw size={12} class="animate-spin" /> Loading contacts...
            </span>
          </Show>
        </div>

        <div
          class="table-responsive max-h-[calc(100vh-270px)] min-h-[400px] overflow-y-auto"
          onScroll={handleTableScroll}
        >
          <table class="data-table">
            <thead class="sticky top-0 bg-[#111b21] z-10 shadow-xs">
              <tr>
                <th style={{ width: '50px' }}>#</th>
                <th>Contact Name</th>
                <th>Phone Number</th>
                <th>WhatsApp JID</th>
                <th style={{ 'text-align': 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={contacts().length > 0}
                fallback={
                  <tr>
                    <td colspan="5" class="text-center py-12 text-[#8696a0]">
                      {contactsLoading() ? 'Loading contacts...' : 'No contacts found.'}
                    </td>
                  </tr>
                }
              >
                <For each={contacts()}>
                  {(c, idx) => (
                    <tr>
                      <td>
                        <span class="text-xs text-[#8696a0] font-mono">{idx() + 1}</span>
                      </td>
                      <td>
                        <div class="flex items-center gap-2.5">
                          <div class="relative w-8 h-8 shrink-0">
                            <img
                              src={c.avatar_url || `/api/contacts/${encodeURIComponent(c.jid || c.id || '')}/avatar-image`}
                              alt={c.full_name || 'Contact'}
                              loading="lazy"
                              referrerpolicy="no-referrer"
                              class="w-8 h-8 rounded-full object-cover shrink-0 border border-[#2a3942]"
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
                          <div>
                            <strong class="text-xs text-[#e9edef] block">
                              {c.full_name || c.first_name || c.push_name || c.business_name || 'Unknown Contact'}
                            </strong>
                            <Show when={c.business_name}>
                              <span class="text-[10px] text-[#8696a0]">{c.business_name}</span>
                            </Show>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="text-xs font-mono text-[#00a884]">
                          {c.phone_number
                            ? (c.phone_number.startsWith('+') ? c.phone_number : `+${c.phone_number}`)
                            : 'No phone number'}
                        </span>
                      </td>
                      <td>
                        <span class="text-xs font-mono text-[#8696a0]">{c.jid}</span>
                      </td>
                      <td style={{ 'text-align': 'right' }}>
                        <button
                          class="token-chip-btn"
                          title="Send Direct WhatsApp Message"
                          onClick={() =>
                            setActiveModal({
                              type: 'direct_message',
                              jid: c.jid,
                              name: c.full_name || c.phone_number || c.jid
                            })
                          }
                        >
                          <Send size={13} />
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>

        {/* Infinite Scroll Status */}
        <Show when={contactsLoading() && contacts().length > 0}>
          <div class="p-3 text-center text-xs text-[#00a884] flex items-center justify-center gap-1.5 border-t border-[#222d34]">
            <RefreshCw size={12} class="animate-spin" />
            <span>Loading more contacts...</span>
          </div>
        </Show>
        <Show when={!contactsHasMore() && contacts().length > 0}>
          <div class="p-3 text-center text-xs text-[#8696a0] border-t border-[#222d34]">
            All {contactsTotal()} contacts loaded
          </div>
        </Show>
      </div>
    </div>
  );
}
