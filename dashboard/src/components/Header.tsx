import { Show } from 'solid-js';
import {
  view,
  switchView,
  selectedCampaignDetails,
  accounts,
  sidebarCollapsed,
  setSidebarCollapsed,
  mobileSidebarOpen,
  setMobileSidebarOpen
} from './store';
import { getAccountStatusState } from './types';
import { Menu, Smartphone } from 'lucide-solid';

export default function Header() {
  const activeAccount = () => accounts().find((a) => a.is_active) || accounts()[0];

  const handleToggleSidebar = () => {
    if (window.innerWidth <= 900) {
      setMobileSidebarOpen(!mobileSidebarOpen());
    } else {
      const next = !sidebarCollapsed();
      setSidebarCollapsed(next);
      try {
        localStorage.setItem('wasche_sidebar_collapsed', next ? '1' : '0');
      } catch {}
    }
  };

  return (
    <header class="h-16 bg-[#111b21] border-b border-[#222d34] flex items-center justify-between px-6 shrink-0 gap-4 select-none">
      {/* Left: Hamburger Toggle & Page Title / Breadcrumbs */}
      <div class="flex items-center gap-3.5 min-w-0">
        <button
          style={{ border: '1px solid #2a3942', background: '#182229' }}
          class="w-8 h-8 rounded-lg hover:border-[#00a884] text-[#8696a0] hover:text-[#e9edef] flex items-center justify-center p-0 transition-colors cursor-pointer shrink-0"
          onClick={handleToggleSidebar}
          title="Toggle Sidebar Navigation"
        >
          <Menu size={16} />
        </button>

        <div class="min-w-0">
          <Show
            when={view() === 'campaign-detail' && selectedCampaignDetails()}
            fallback={
              <h1 class="text-base font-bold text-[#e9edef] m-0 tracking-tight truncate">
                {view() === 'campaigns'
                  ? 'Broadcast Campaigns'
                  : view() === 'devices'
                    ? 'Connected WhatsApp Accounts'
                    : 'Contacts'}
              </h1>
            }
          >
            {/* Pure borderless, unbolded breadcrumb with consistent 14px size */}
            <div class="flex items-center gap-2 text-sm font-normal">
              <button
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '0',
                  'font-size': '14px',
                  'font-weight': '400'
                }}
                class="text-sm font-normal text-[#8696a0] hover:text-[#00a884] transition-colors cursor-pointer"
                onClick={() => switchView('campaigns')}
              >
                Campaigns
              </button>
              <span class="text-[#8696a0] text-sm font-normal">&rsaquo;</span>
              <span
                style={{ 'font-size': '14px', 'font-weight': '400' }}
                class="text-sm font-normal text-[#e9edef] truncate max-w-[320px]"
              >
                {selectedCampaignDetails()?.campaign.name}
              </span>
            </div>
          </Show>
        </div>
      </div>

      {/* Right: Quick Device Status Chip & Primary Actions */}
      <div class="flex items-center gap-3 shrink-0">
        <Show when={activeAccount()}>
          <div
            class="h-8 flex items-center gap-2 px-3 rounded-lg bg-[#182229] border border-[#2a3942] text-xs cursor-pointer hover:border-[#00a884] transition-colors"
            onClick={() => switchView('devices')}
            title="Click to view WhatsApp accounts"
          >
            <Smartphone size={13} class="text-[#00a884]" />
            <span class="font-medium text-[#e9edef] truncate max-w-[160px]">
              {activeAccount()?.account_id}
              {activeAccount()?.phone_number ? ` (+${activeAccount()?.phone_number})` : ''}
            </span>
            <span
              class={`w-2 h-2 rounded-full ${
                getAccountStatusState(activeAccount()?.status) === 'Connected'
                  ? 'bg-[#00a884] animate-pulse'
                  : activeAccount()?.phone_number
                    ? 'bg-[#ffbc38]'
                    : 'bg-[#f15c6d]'
              }`}
            />
          </div>
        </Show>
      </div>
    </header>
  );
}
