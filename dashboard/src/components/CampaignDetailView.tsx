import { createEffect, Show, Errored } from 'solid-js';
import {
  selectedCampaignDetails,
  selectedRunId,
  detailTab,
  setDetailTab,
  fetchCampaignAttachments
} from './store';

import CampaignMacroCards from './campaign-detail/CampaignMacroCards';
import CampaignContactsTab from './campaign-detail/CampaignContactsTab';
import CampaignTemplateTab from './campaign-detail/CampaignTemplateTab';
import CampaignRunLogsTab from './campaign-detail/CampaignRunLogsTab';

export default function CampaignDetailView() {
  const campaign = () => selectedCampaignDetails()?.campaign;
  const c = () =>
    campaign() || {
      id: 0,
      name: '',
      status: 'draft',
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

  const currentRun = () => {
    const list = runs();
    const selId = selectedRunId();
    return list.find((r) => r.id === selId) || list[0] || null;
  };

  createEffect(
    () => c().id,
    (id) => {
      if (id > 0) {
        fetchCampaignAttachments(id);
      }
    }
  );

  return (
    <Errored
      fallback={(err) => (
        <div class="p-8 text-red-500 font-bold bg-[#182229] border border-red-500 rounded-xl m-4">
          RENDER ERROR: {String((err() as any)?.message || err())}
          <pre class="text-xs text-red-300 mt-2 whitespace-pre-wrap">
            {String((err() as any)?.stack)}
          </pre>
        </div>
      )}
    >
      <Show
        when={campaign()}
        fallback={<div class="p-8 text-center text-[#8696a0]">Loading campaign details...</div>}
      >
        <div class="space-y-6">
          <CampaignMacroCards
            campaign={c()}
            runs={runs()}
            recipients={recipients()}
            currentRun={currentRun()}
            detailTab={detailTab()}
            setDetailTab={setDetailTab}
          />

          <Show when={detailTab() === 'contacts'}>
            <CampaignContactsTab campaignId={c().id} recipients={recipients()} />
          </Show>

          <Show when={detailTab() === 'template'}>
            <CampaignTemplateTab
              campaignId={c().id}
              campaignName={c().name}
              initialTemplate={c().template_body}
              recipients={recipients()}
            />
          </Show>

          <Show when={detailTab() === 'runs'}>
            <CampaignRunLogsTab
              campaignId={c().id}
              campaignName={c().name}
              campaignAccountId={c().account_id}
              campaignStatus={c().status}
              runs={runs()}
              recipients={recipients()}
              logs={logs()}
            />
          </Show>
        </div>
      </Show>
    </Errored>
  );
}
