import { Show, For } from 'solid-js';
import {
  view,
  switchView,
  campaigns,
  accounts,
  contactsTotal,
  sidebarCollapsed,
  mobileSidebarOpen,
  setMobileSidebarOpen
} from './store';
import { getAccountStatusState } from './types';
import { Tooltip } from '@kobalte/core/tooltip';
import {
  Radio,
  Smartphone,
  Users,
  Check
} from 'lucide-solid';

export default function Sidebar() {
  const hasConnectedDevice = () =>
    accounts().some(a => getAccountStatusState(a.status) === 'Connected');
  const hasPairedDevice = () =>
    accounts().some(a => !!a.phone_number);
  return (
    <>
      {/* Mobile Drawer Overlay */}
      <Show when={mobileSidebarOpen()}>
        <div
          class="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs min-[901px]:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      </Show>

      {/* Main Sidebar */}
      <aside
        class={`bg-[#111b21] border-r border-[#222d34] flex flex-col h-full shrink-0 z-50 transition-all duration-200 select-none ${
          sidebarCollapsed() ? 'w-[68px]' : 'w-[250px]'
        } max-[900px]:fixed max-[900px]:top-0 max-[900px]:bottom-0 max-[900px]:left-0 ${
          mobileSidebarOpen() ? 'max-[900px]:translate-x-0' : 'max-[900px]:-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <a
          href="/campaign"
          class="h-16 border-b border-[#222d34] flex items-center px-4 shrink-0 gap-3 no-underline cursor-pointer"
          onClick={e => {
            e.preventDefault();
            switchView('campaigns');
          }}
        >
          <img src="/wasche.png" alt="Wasche" class="w-8 h-8 object-contain shrink-0" />
          <Show when={!sidebarCollapsed()}>
            <div class="min-w-0 flex-1">
              <span class="text-base font-bold text-[#e9edef] tracking-tight truncate block">
                Wasche
              </span>
            </div>
          </Show>
        </a>

        {/* Navigation Section */}
        <nav class="flex-1 p-3 flex flex-col gap-1 overflow-y-auto">
          {/* Section Title: Broadcast Hub */}
          <Show when={!sidebarCollapsed()}>
            <div
              style={{ 'font-size': '12.5px' }}
              class="px-2 pt-2 pb-1.5 font-bold uppercase tracking-wider text-[#8696a0]"
            >
              Broadcast Hub
            </div>
          </Show>

          {/* 1. Campaigns Nav Item */}
          <Tooltip openDelay={200} placement="right">
            <Tooltip.Trigger as="div" class="w-full block">
              <a
                href="/campaign"
                style={{
                  border: 'none',
                  'font-size': '14.5px',
                  background:
                    view() === 'campaigns' || view() === 'campaign-detail'
                      ? 'rgba(0, 168, 132, 0.15)'
                      : 'transparent'
                }}
                class={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all cursor-pointer no-underline ${
                  view() === 'campaigns' || view() === 'campaign-detail'
                    ? 'text-[#00a884] font-semibold'
                    : 'text-[#8696a0] hover:bg-[#202c33]/70 hover:text-[#e9edef]'
                }`}
                onClick={e => {
                  e.preventDefault();
                  switchView('campaigns');
                }}
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <Radio size={17} class="shrink-0" />
                  <Show when={!sidebarCollapsed()}>
                    <span class="truncate" style={{ 'font-size': '14.5px' }}>Campaigns</span>
                  </Show>
                </div>
                <Show when={!sidebarCollapsed()}>
                  <span class="text-[12px] font-mono px-2 py-0.5 rounded-full bg-[#202c33] text-[#8696a0]">
                    {campaigns().length}
                  </span>
                </Show>
              </a>
            </Tooltip.Trigger>
            <Show when={sidebarCollapsed()}>
              <Tooltip.Portal>
                <Tooltip.Content class="bg-[#182229] border border-[#2a3942] text-xs px-2.5 py-1 rounded-lg text-[#e9edef] z-50 shadow-xl">
                  Broadcast Campaigns ({campaigns().length})
                </Tooltip.Content>
              </Tooltip.Portal>
            </Show>
          </Tooltip>

          {/* 2. Devices Nav Item */}
          <Tooltip openDelay={200} placement="right">
            <Tooltip.Trigger as="div" class="w-full block">
              <a
                href="/devices"
                style={{
                  border: 'none',
                  'font-size': '14.5px',
                  background: view() === 'devices' ? 'rgba(0, 168, 132, 0.15)' : 'transparent'
                }}
                class={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all cursor-pointer no-underline ${
                  view() === 'devices'
                    ? 'text-[#00a884] font-semibold'
                    : 'text-[#8696a0] hover:bg-[#202c33]/70 hover:text-[#e9edef]'
                }`}
                onClick={e => {
                  e.preventDefault();
                  switchView('devices');
                }}
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <Smartphone size={17} class="shrink-0" />
                  <Show when={!sidebarCollapsed()}>
                    <span class="truncate" style={{ 'font-size': '14.5px' }}>Connected Devices</span>
                  </Show>
                </div>
                <Show when={!sidebarCollapsed()}>
                  <span
                    class={`w-2 h-2 rounded-full ${
                      hasConnectedDevice()
                        ? 'bg-[#00a884]'
                        : hasPairedDevice()
                        ? 'bg-[#ffbc38] animate-pulse'
                        : 'bg-[#f15c6d]'
                    }`}
                  />
                </Show>
              </a>
            </Tooltip.Trigger>
            <Show when={sidebarCollapsed()}>
              <Tooltip.Portal>
                <Tooltip.Content class="bg-[#182229] border border-[#2a3942] text-xs px-2.5 py-1 rounded-lg text-[#e9edef] z-50 shadow-xl">
                  Connected WhatsApp Devices ({accounts().length})
                </Tooltip.Content>
              </Tooltip.Portal>
            </Show>
          </Tooltip>

          {/* 3. Contacts Nav Item (Renamed to Contacts) */}
          <Tooltip openDelay={200} placement="right">
            <Tooltip.Trigger as="div" class="w-full block">
              <a
                href="/contacts"
                style={{
                  border: 'none',
                  'font-size': '14.5px',
                  background: view() === 'contacts' ? 'rgba(0, 168, 132, 0.15)' : 'transparent'
                }}
                class={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium transition-all cursor-pointer no-underline ${
                  view() === 'contacts'
                    ? 'text-[#00a884] font-semibold'
                    : 'text-[#8696a0] hover:bg-[#202c33]/70 hover:text-[#e9edef]'
                }`}
                onClick={e => {
                  e.preventDefault();
                  switchView('contacts');
                }}
              >
                <div class="flex items-center gap-2.5 min-w-0">
                  <Users size={17} class="shrink-0" />
                  <Show when={!sidebarCollapsed()}>
                    <span class="truncate" style={{ 'font-size': '14.5px' }}>Contacts</span>
                  </Show>
                </div>
                <Show when={!sidebarCollapsed()}>
                  <span class="text-[12px] font-mono px-2 py-0.5 rounded-full bg-[#202c33] text-[#8696a0]">
                    {contactsTotal()}
                  </span>
                </Show>
              </a>
            </Tooltip.Trigger>
            <Show when={sidebarCollapsed()}>
              <Tooltip.Portal>
                <Tooltip.Content class="bg-[#182229] border border-[#2a3942] text-xs px-2.5 py-1 rounded-lg text-[#e9edef] z-50 shadow-xl">
                  Contacts ({contactsTotal()})
                </Tooltip.Content>
              </Tooltip.Portal>
            </Show>
          </Tooltip>

          {/* Linked WhatsApp Accounts Live Section */}
          <Show when={accounts().length > 0 && !sidebarCollapsed()}>
            <div class="mt-5 pt-3.5 border-t border-[#222d34]/70">
              <div
                style={{ 'font-size': '12.5px' }}
                class="px-2 pb-2 flex items-center justify-between font-bold uppercase tracking-wider text-[#8696a0]"
              >
                <span>Active Accounts</span>
                <span class="w-1.5 h-1.5 rounded-full bg-[#00a884] animate-pulse" />
              </div>
              <div class="space-y-1">
                <For each={accounts()}>
                  {acc => {
                    const status = () => getAccountStatusState(acc.status);
                    const isOnline = () => status() === 'Connected';
                    return (
                      <a
                        href="/devices"
                        style={{
                          border: acc.is_active ? '1px solid #2a3942' : 'none',
                          background: acc.is_active ? '#182229' : 'transparent',
                          'font-size': '14px'
                        }}
                        class={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-colors cursor-pointer no-underline ${
                          acc.is_active
                            ? 'text-[#e9edef] font-medium'
                            : 'text-[#8696a0] hover:bg-[#202c33]/60 hover:text-[#e9edef]'
                        }`}
                        onClick={e => {
                          e.preventDefault();
                          switchView('devices');
                        }}
                        title="Click to view device details"
                      >
                        <div class="flex items-center gap-2 min-w-0">
                          <div class="w-6 h-6 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[10.5px] font-bold text-[#00a884] shrink-0">
                            {acc.account_id.charAt(0).toUpperCase()}
                          </div>
                          <span class="truncate font-medium" style={{ 'font-size': '14px' }}>
                            {acc.account_id}
                          </span>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                          <span
                            class={`w-1.5 h-1.5 rounded-full ${
                              isOnline() ? 'bg-[#00a884]' : 'bg-[#f15c6d]'
                            }`}
                          />
                          <Show when={acc.is_active}>
                            <span class="text-[11px] font-bold uppercase tracking-wider text-[#00a884] bg-[#00a884]/15 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Check size={9} />
                              Active
                            </span>
                          </Show>
                        </div>
                      </a>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </nav>
      </aside>
    </>
  );
}
