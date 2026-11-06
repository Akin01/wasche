import { onSettled, Switch, Match } from 'solid-js';
import {
  view,
  switchView,
  accounts,
  setAccounts,
  fetchAccounts,
  fetchCampaigns,
  fetchContacts,
  pollData,
  selectedCampaignDetails,
  setSidebarCollapsed,
  setMobileSidebarOpen
} from './store';
import Sidebar from './Sidebar';
import Header from './Header';
import CampaignsView from './CampaignsView';
import CampaignDetailView from './CampaignDetailView';
import DevicesView from './DevicesView';
import ContactsView from './ContactsView';
import Modals from './Modals';
import ToastContainer from './ToastContainer';

interface DashboardProps {
  initialView?: 'campaigns' | 'campaign-detail' | 'devices' | 'contacts';
}

export default function Dashboard(props: DashboardProps) {
  let pollInterval: number | undefined;

  onSettled(() => {
    // Determine view from URL or props
    const path = window.location.pathname;
    if (path.startsWith('/devices')) {
      switchView('devices', null, false);
    } else if (path.startsWith('/contacts')) {
      switchView('contacts', null, false);
    } else {
      const urlId = new URLSearchParams(window.location.search).get('id');
      if (urlId) {
        switchView('campaign-detail', parseInt(urlId), false);
      } else if (props.initialView) {
        switchView(props.initialView, null, false);
      } else {
        switchView('campaigns', null, false);
      }
    }

    // SWR hydration: immediately hydrate accounts from localStorage if present
    if (typeof window !== 'undefined' && accounts().length === 0) {
      try {
        const cached = localStorage.getItem('wasche_cached_accounts');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAccounts(parsed);
          }
        }
      } catch {}
    }

    // Initial data fetch
    Promise.all([fetchAccounts(), fetchCampaigns(), fetchContacts()]);

    // Responsive setup
    if (window.innerWidth <= 900) {
      setSidebarCollapsed(true);
      setMobileSidebarOpen(false);
    }

    // Adaptive auto-poll: 1.2s when campaign is actively running, 4s when idle
    let isDestroyed = false;
    const pollLoop = async () => {
      if (isDestroyed) return;
      await pollData();
      if (isDestroyed) return;
      const isRunning = selectedCampaignDetails()?.campaign?.status === 'running';
      const delay = isRunning ? 1200 : 4000;
      pollInterval = window.setTimeout(pollLoop, delay);
    };
    pollInterval = window.setTimeout(pollLoop, 1000);
    const onResize = () => {
      if (window.innerWidth <= 900) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);

    const onPopState = () => {
      const curPath = window.location.pathname;
      if (curPath.startsWith('/devices')) {
        switchView('devices', null, false);
      } else if (curPath.startsWith('/contacts')) {
        switchView('contacts', null, false);
      } else {
        const id = new URLSearchParams(window.location.search).get('id');
        if (id) {
          switchView('campaign-detail', parseInt(id), false);
        } else {
          switchView('campaigns', null, false);
        }
      }
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      isDestroyed = true;
      clearTimeout(pollInterval);
      clearInterval(pollInterval);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onPopState);
    };
  });

  return (
    <div class="flex w-screen h-screen overflow-hidden bg-[#0b141a]">
      {/* Primary Sidebar */}
      <Sidebar />

      {/* Main Content Viewport */}
      <div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#0b141a] relative">
        <Header />

        <main
          class="flex-1 overflow-y-auto p-8 max-[900px]:p-4 max-w-[1600px] w-full mx-auto"
          id="contentContainer"
        >
          <Switch>
            <Match when={view() === 'campaigns'}>
              <CampaignsView />
            </Match>
            <Match when={view() === 'campaign-detail'}>
              <CampaignDetailView />
            </Match>
            <Match when={view() === 'devices'}>
              <DevicesView />
            </Match>
            <Match when={view() === 'contacts'}>
              <ContactsView />
            </Match>
          </Switch>
        </main>

        {/* Global Modals via Kobalte Dialog */}
        <Modals />

        {/* Toast Notifications */}
        <ToastContainer />
      </div>
    </div>
  );
}
