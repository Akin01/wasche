import { createSignal, Show, For, onSettled } from 'solid-js';
import { Checkbox } from '@kobalte/core/checkbox';
import type { Contact } from '../types';
import { getAccountStatusState } from '../types';
import {
  accounts,
  contacts,
  contactsTotal,
  contactsLoading,
  contactsHasMore,
  fetchContacts,
  selectedCampaignDetails,
  addRecipients
} from '../store';
import { Search, Users, Smartphone, ChevronDown, Check, RefreshCw } from '../../icons';

export default function AddContactsModal(props: { campaignId: number; onClose: () => void }) {
  const [selectedContactsMap, setSelectedContactsMap] = createSignal<Record<string, Contact>>({});
  const [contactSearchFilter, setContactSearchFilter] = createSignal('');
  const [selectedAccountFilter, setSelectedAccountFilter] = createSignal('all');
  const [accountDropdownOpen, setAccountDropdownOpen] = createSignal(false);
  let dropdownWrapRef: HTMLDivElement | undefined;
  let searchTimer: any;

  onSettled(() => {
    if (contacts().length === 0) {
      fetchContacts('', 'all', false);
    }
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownWrapRef && !dropdownWrapRef.contains(target)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  });

  const onSearchInput = (val: string) => {
    setContactSearchFilter(val);
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      fetchContacts(val, selectedAccountFilter(), false);
    }, 250);
  };

  const onAccountSelect = (acc: string) => {
    setSelectedAccountFilter(acc);
    fetchContacts(contactSearchFilter(), acc, false);
  };

  const handleScroll = (e: Event) => {
    const target = e.currentTarget as HTMLElement;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 120) {
      if (!contactsLoading() && contactsHasMore()) {
        fetchContacts(contactSearchFilter(), selectedAccountFilter(), true);
      }
    }
  };

  const isAllSelected = () => {
    const list = contacts();
    return list.length > 0 && list.every((c) => !!selectedContactsMap()[c.jid]);
  };

  const toggleSelectAll = () => {
    const list = contacts();
    const map = { ...selectedContactsMap() };
    if (isAllSelected()) {
      for (const c of list) {
        delete map[c.jid];
      }
    } else {
      for (const c of list) {
        map[c.jid] = c;
      }
    }
    setSelectedContactsMap(map);
  };

  interface AccountOption {
    value: string;
    label: string;
    phone?: string;
    isOnline?: boolean;
  }

  const accountOptions = (): AccountOption[] => [
    { value: 'all', label: 'All Accounts' },
    ...accounts().map((a) => {
      const status = getAccountStatusState(a.status);
      return {
        value: a.account_id,
        label: a.account_id,
        phone: a.phone_number ? `+${a.phone_number}` : undefined,
        isOnline: status === 'Connected'
      };
    })
  ];

  const selectedCount = () => Object.keys(selectedContactsMap()).length;

  return (
    <div class="space-y-3.5">
      {/* Search and Account Filter Bar */}
      <div class="flex items-center gap-2.5">
        <div class="search-input-wrap flex-1">
          <Search size={14} class="search-icon" />
          <input
            type="text"
            placeholder="Search contacts archive by name, phone, or JID..."
            class="search-input"
            value={contactSearchFilter()}
            onInput={(e) => onSearchInput(e.currentTarget.value)}
          />
        </div>

        {/* Account Filter Custom Dropdown */}
        <div class="relative shrink-0" ref={dropdownWrapRef}>
          <button
            type="button"
            style={{ border: '1px solid #2a3942', background: '#111b21' }}
            class="h-8 px-3 rounded-lg text-xs text-[#e9edef] flex items-center justify-between gap-2.5 cursor-pointer hover:border-[#00a884] transition-colors focus:outline-none focus:border-[#00a884] min-w-[150px]"
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen())}
          >
            <div class="flex items-center gap-2 truncate">
              {selectedAccountFilter() === 'all' ? (
                <Users size={13} class="text-[#00a884] shrink-0" />
              ) : (
                <Smartphone size={13} class="text-[#00a884] shrink-0" />
              )}
              <span class="font-medium text-[#e9edef] truncate">
                {selectedAccountFilter() === 'all' ? 'All Accounts' : selectedAccountFilter()}
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
            <div class="absolute right-0 top-full mt-1.5 bg-[#182229] border border-[#2a3942] rounded-xl shadow-dropdown p-1.5 z-50 min-w-[230px] max-h-[240px] overflow-y-auto space-y-1 animate-popover">
              <For each={accountOptions()}>
                {(opt) => {
                  const isSelected = () => opt.value === selectedAccountFilter();
                  const isAll = opt.value === 'all';
                  return (
                    <div
                      class={`px-2.5 py-2 text-xs rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                        isSelected()
                          ? 'bg-[#202c33] text-[#00a884]'
                          : 'text-[#e9edef] hover:bg-[#202c33]'
                      }`}
                      onClick={() => {
                        onAccountSelect(opt.value);
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
      </div>

      {/* Quick Action & Count Strip */}
      <div class="flex items-center justify-between text-xs px-1 text-[#8696a0]">
        <div class="flex items-center gap-2">
          <span>
            Showing {contacts().length} of {contactsTotal()} contacts
          </span>
          <Show when={contactsLoading()}>
            <span class="text-[#00a884] flex items-center gap-1 text-[11px]">
              <RefreshCw size={11} class="animate-spin" /> Loading...
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            style={{ border: '1px solid #2a3942', background: '#182229' }}
            class="h-7 px-2.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer hover:border-[#00a884] hover:text-[#00a884] text-[#e9edef] transition-colors select-none"
            onClick={toggleSelectAll}
          >
            <Check size={12} class={isAllSelected() ? 'text-[#00a884]' : 'text-[#8696a0]'} />
            <span>{isAllSelected() ? 'Deselect All' : 'Select All'}</span>
          </button>
        </div>
      </div>

      {/* Contacts Infinite Scroll List */}
      <div
        class="max-h-[350px] overflow-y-auto border border-[#2a3942] rounded-xl divide-y divide-[#2a3942]/50 bg-[#111b21]"
        onScroll={handleScroll}
      >
        <Show
          when={contacts().length > 0}
          fallback={
            <div class="text-center py-12 text-[#8696a0] text-xs">
              {contactsLoading() ? 'Loading contacts from archive...' : 'No contacts found.'}
            </div>
          }
        >
          <For each={contacts()}>
            {(c) => {
              const isAlreadyAdded = () => {
                const existing = selectedCampaignDetails()?.recent_recipients || [];
                return existing.some(
                  (r) =>
                    (r.jid && r.jid === c.jid) ||
                    (r.phone_number && c.phone_number && r.phone_number === c.phone_number) ||
                    (r.phone_number && c.jid && c.jid.startsWith(r.phone_number.replace(/\D/g, '')))
                );
              };
              const isSelected = () => !!selectedContactsMap()[c.jid];
              return (
                <div
                  class={`p-2.5 px-3 flex items-center justify-between text-xs transition-colors ${
                    isAlreadyAdded()
                      ? 'opacity-40 cursor-not-allowed bg-[#141f26]'
                      : isSelected()
                        ? 'bg-[#202c33]/40 hover:bg-[#202c33]/80 cursor-pointer'
                        : 'hover:bg-[#202c33]/80 cursor-pointer'
                  }`}
                  onClick={() => {
                    if (isAlreadyAdded()) return;
                    const map = { ...selectedContactsMap() };
                    if (map[c.jid]) {
                      delete map[c.jid];
                    } else {
                      map[c.jid] = c;
                    }
                    setSelectedContactsMap(map);
                  }}
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <Show
                      when={!isAlreadyAdded()}
                      fallback={
                        <span class="text-[10px] text-[#8696a0] bg-[#182229] border border-[#2a3942] px-1.5 py-0.5 rounded-full font-medium shrink-0">
                          Added
                        </span>
                      }
                    >
                      <Checkbox checked={isSelected()} onChange={() => {}}>
                        <Checkbox.Input class="sr-only" />
                        <Checkbox.Control class="w-4 h-4 rounded border border-[#2a3942] bg-[#182229] flex items-center justify-center shrink-0">
                          <Checkbox.Indicator>
                            <Check size={11} class="text-[#00a884]" />
                          </Checkbox.Indicator>
                        </Checkbox.Control>
                      </Checkbox>
                    </Show>

                    {/* Profile Picture / Avatar with Lazy Loading & Fallback */}
                    <div class="relative w-8 h-8 shrink-0">
                      <img
                        src={
                          c.avatar_url ||
                          `/api/contacts/${encodeURIComponent(c.jid || c.id || '')}/avatar-image`
                        }
                        alt={c.full_name || 'Contact'}
                        loading="lazy"
                        referrerpolicy="no-referrer"
                        class="w-8 h-8 rounded-full object-cover border border-[#2a3942] shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                          if (next) next.style.display = 'flex';
                        }}
                      />
                      <div
                        style={{ display: 'none' }}
                        class="w-8 h-8 rounded-full bg-[#202c33] border border-[#2a3942] items-center justify-center text-xs font-bold text-[#00a884] shrink-0"
                      >
                        {(c.full_name || c.first_name || c.push_name || c.phone_number || 'U')
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                    </div>

                    {/* Name and Phone Details */}
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <strong class="text-xs text-[#e9edef] block truncate">
                          {c.full_name || c.first_name || c.push_name || 'Unknown Contact'}
                        </strong>
                        <Show when={c.business_name}>
                          <span class="text-[10px] text-[#8696a0] px-1.5 py-0.2 rounded bg-[#202c33] border border-[#2a3942] shrink-0">
                            {c.business_name}
                          </span>
                        </Show>
                      </div>
                      <div class="flex items-center gap-1.5 mt-0.5">
                        <span class="text-xs font-mono text-[#00a884]">
                          {c.phone_number
                            ? c.phone_number.startsWith('+')
                              ? c.phone_number
                              : `+${c.phone_number}`
                            : c.jid.split('@')[0]}
                        </span>
                        <span class="text-[10.5px] font-mono text-[#8696a0] truncate">
                          &bull; {c.jid}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
        </Show>

        {/* Infinite Scroll Indicator at Bottom */}
        <Show when={contactsLoading() && contacts().length > 0}>
          <div class="p-3 text-center text-xs text-[#00a884] flex items-center justify-center gap-1.5">
            <RefreshCw size={12} class="animate-spin" /> Loading more contacts...
          </div>
        </Show>
        <Show when={!contactsHasMore() && contacts().length > 0}>
          <div class="p-2.5 text-center text-[11px] text-[#8696a0] border-t border-[#2a3942]/30">
            All {contactsTotal()} contacts loaded
          </div>
        </Show>
      </div>

      {/* Modal Footer */}
      <div class="flex justify-between items-center pt-3 border-t border-[#222d34]">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-[#e9edef]">{selectedCount()} selected</span>
          <Show when={selectedCount() > 0}>
            <button
              type="button"
              class="h-6 px-2.5 text-[11px] font-medium text-[#8696a0] hover:text-[#f15c6d] hover:border-[#f15c6d]/40 hover:bg-[#f15c6d]/10 rounded-md transition-colors cursor-pointer flex items-center justify-center"
              onClick={() => setSelectedContactsMap({})}
            >
              Clear selection
            </button>
          </Show>
        </div>
        <div class="flex items-center gap-2.5">
          <button
            class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
            onClick={props.onClose}
          >
            Cancel
          </button>
          <button
            class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
            disabled={selectedCount() === 0}
            onClick={() => {
              const selected = Object.values(selectedContactsMap()).filter(
                (c) =>
                  !selectedCampaignDetails()?.recent_recipients?.some(
                    (r) =>
                      r.jid === c.jid ||
                      (r.phone_number && c.phone_number && r.phone_number === c.phone_number)
                  )
              );
              const recipientsPayload = selected.map((c) => ({
                jid:
                  c.jid ||
                  (c.phone_number ? `${c.phone_number.replace(/\D/g, '')}@s.whatsapp.net` : ''),
                phone_number: c.phone_number || c.jid.split('@')[0],
                display_name: c.full_name || c.push_name || undefined
              }));
              setSelectedContactsMap({});
              setContactSearchFilter('');
              setSelectedAccountFilter('all');
              setAccountDropdownOpen(false);
              addRecipients(props.campaignId, recipientsPayload);
            }}
          >
            Add {selectedCount()} Contacts
          </button>
        </div>
      </div>
    </div>
  );
}
