import { createSignal } from 'solid-js';
import type {
  Account,
  Campaign,
  CampaignDetails,
  Contact,
  ToastItem,
  ActiveModal,
  AttachmentInfo
} from './types';

const getInitialView = (): 'campaigns' | 'campaign-detail' | 'devices' | 'contacts' => {
  if (typeof window === 'undefined') return 'campaigns';
  const path = window.location.pathname;
  if (path.startsWith('/devices')) return 'devices';
  if (path.startsWith('/contacts')) return 'contacts';
  const urlId = new URLSearchParams(window.location.search).get('id');
  if (urlId) return 'campaign-detail';
  return 'campaigns';
};
const getInitialCampId = (): number | null => {
  if (typeof window === 'undefined') return null;
  const urlId = new URLSearchParams(window.location.search).get('id');
  return urlId ? parseInt(urlId) : null;
};
export const [view, setView] = createSignal<'campaigns' | 'campaign-detail' | 'devices' | 'contacts'>(getInitialView());
export const [selectedCampaignId, setSelectedCampaignId] = createSignal<number | null>(getInitialCampId());
export const [detailTab, setDetailTab] = createSignal<'contacts' | 'template' | 'runs'>('contacts');

// Domain Data Signals with localStorage SWR cache
const getInitialAccounts = (): Account[] => {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('wasche_cached_accounts');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  return [];
};
export const [accounts, setAccounts] = createSignal<Account[]>(getInitialAccounts());
export const [campaigns, setCampaigns] = createSignal<Campaign[]>([]);
export const [contacts, setContacts] = createSignal<Contact[]>([]);
export const [contactsTotal, setContactsTotal] = createSignal(0);
export const [contactsLoading, setContactsLoading] = createSignal(false);
export const [contactsHasMore, setContactsHasMore] = createSignal(true);
export const [selectedAccountForContacts, setSelectedAccountForContacts] = createSignal<string>('all');
export const [contactsSearchQuery, setContactsSearchQuery] = createSignal<string>('');

export const [selectedRunId, setSelectedRunId] = createSignal<number | null>(null);
export const [selectedCampaignDetails, setSelectedCampaignDetails] = createSignal<CampaignDetails | null>(null);
export const [campaignAttachment, setCampaignAttachment] = createSignal<AttachmentInfo | null>(null);
export const [campaignAttachments, setCampaignAttachments] = createSignal<AttachmentInfo[]>([]);
// UI Controls & Layout
export const [sidebarCollapsed, setSidebarCollapsed] = createSignal<boolean>(
  typeof window !== 'undefined' ? localStorage.getItem('wasche_sidebar_collapsed') === '1' : false
);
export const [mobileSidebarOpen, setMobileSidebarOpen] = createSignal<boolean>(false);
export const [toasts, setToasts] = createSignal<ToastItem[]>([]);
export const [activeModal, setActiveModal] = createSignal<ActiveModal>(null);

if (typeof window !== 'undefined') {
  (window as any).__store = {
    selectedCampaignDetails,
    setSelectedCampaignDetails,
    view,
    setView,
    selectedCampaignId,
    setSelectedCampaignId,
    fetchCampaignDetails
  };
}
// Toast Notification
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const id = Math.random().toString(36).slice(2, 9);
  setToasts(prev => [...prev, { id, message, type }]);
  setTimeout(() => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, 3500);
}

// Navigation Helper
export function switchView(
  newView: 'campaigns' | 'campaign-detail' | 'devices' | 'contacts',
  campaignId: number | null = null,
  pushHistory = true
) {
  setView(newView);
  if (campaignId !== null) {
    setSelectedCampaignId(campaignId);
    fetchCampaignDetails(campaignId);
    fetchCampaignAttachments(campaignId);
  } else if (newView === 'campaigns') {
    setSelectedCampaignId(null);
    setSelectedCampaignDetails(null);
  }
  setMobileSidebarOpen(false);

  if (pushHistory && typeof window !== 'undefined') {
    if (newView === 'devices') {
      if (window.location.pathname !== '/devices') {
        window.history.pushState({ view: newView }, '', '/devices');
      }
    } else if (newView === 'contacts') {
      if (window.location.pathname !== '/contacts') {
        window.history.pushState({ view: newView }, '', '/contacts');
      }
    } else if (newView === 'campaign-detail' && campaignId !== null) {
      window.history.pushState({ view: newView, campaignId }, '', `/campaign?id=${campaignId}`);
    } else {
      if (window.location.pathname !== '/campaign' || window.location.search) {
        window.history.pushState({ view: newView }, '', '/campaign');
      }
    }
  }
}

// API Functions
let accountsReqCounter = 0;
let latestAppliedAccountsReq = 0;
export async function fetchAccounts() {
  const reqId = ++accountsReqCounter;
  try {
    const res = await fetch('/api/accounts');
    if (res.ok && reqId >= latestAppliedAccountsReq) {
      latestAppliedAccountsReq = reqId;
      const data: Account[] = await res.json();
      if (JSON.stringify(data) !== JSON.stringify(accounts())) {
        setAccounts(data);
        if (typeof window !== 'undefined') {
          try {
            if (data.length > 0) {
              localStorage.setItem('wasche_cached_accounts', JSON.stringify(data));
            } else {
              localStorage.removeItem('wasche_cached_accounts');
            }
          } catch {}
        }
      }
    }
  } catch (e: unknown) {
    console.error('Error fetching accounts', e);
  }
}

export async function fetchCampaigns() {
  try {
    const res = await fetch('/api/campaigns');
    if (res.ok) {
      const data: Campaign[] = await res.json();
      if (JSON.stringify(data) !== JSON.stringify(campaigns())) {
        setCampaigns(data);
      }
    }
  } catch (e: unknown) {
    console.error('Error fetching campaigns', e);
  }
}

export async function fetchCampaignDetails(campaignId: number) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}`);
    if (res.ok) {
      const data: CampaignDetails = await res.json();
      if (JSON.stringify(data) !== JSON.stringify(selectedCampaignDetails())) {
        setSelectedCampaignDetails(data);
        const runs = data.runs || [];
        const currentSelected = selectedRunId();
        if (!currentSelected || !runs.some(r => r.id === currentSelected)) {
          const runningRun = runs.find(r => r.status === 'running');
          setSelectedRunId(runningRun ? runningRun.id : (runs[0]?.id || null));
        }
        await fetchCampaignAttachments(campaignId);
      }
    }
  } catch (e: unknown) {
    console.error(`Error fetching campaign ${campaignId} details`, e);
  }
}

export async function fetchContacts(query = '', account = 'all', append = false) {
  setContactsLoading(true);
  try {
    const offset = append ? contacts().length : 0;
    const url = `/api/contacts?limit=50&offset=${offset}&q=${encodeURIComponent(query)}&account_id=${encodeURIComponent(account)}&account=${encodeURIComponent(account)}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const rawList = data.contacts || [];
      const list: Contact[] = rawList.map((c: any) => ({
        ...c,
        jid: c.jid || c.id
      }));
      setContacts(prev => (append ? [...prev, ...list] : list));
      setContactsTotal(data.total || 0);
      setContactsHasMore(list.length >= 50);
    }
  } catch (e: unknown) {
    console.error('Error fetching contacts', e);
  } finally {
    setContactsLoading(false);
  }
}

export async function pollData() {
  // Pause background polling while a form modal is open so dropdowns and inputs are never reset
  const m = activeModal();
  if (m !== null && m.type !== 'qr') {
    return;
  }
  await Promise.all([fetchAccounts(), fetchCampaigns()]);
  const campId = selectedCampaignId();
  if (view() === 'campaign-detail' && campId !== null) {
    await fetchCampaignDetails(campId);
  }
}

export async function controlCampaign(id: number, action: 'pause' | 'resume' | 'abort' | 'rerun' | 'retry_failed' | 'delete') {
  try {
    const res = await fetch(`/api/control/${id}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Campaign action '${action}' succeeded`, 'success');
      await Promise.all([fetchCampaigns(), fetchCampaignDetails(id)]);
    } else {
      showToast(data.error || `Failed to execute ${action}`, 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Network error executing ${action}: ${msg}`, 'error');
  }
}

export async function deleteCampaign(id: number) {
  try {
    const res = await fetch(`/api/control/${id}/delete`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Campaign deleted successfully', 'success');
      switchView('campaigns');
      await fetchCampaigns();
    } else {
      showToast(data.error || 'Failed to delete campaign', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Network error deleting campaign: ${msg}`, 'error');
  }
}

export async function renameCampaign(id: number, newName: string) {
  try {
    const res = await fetch(`/api/campaigns/${id}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Campaign renamed successfully', 'success');
      await Promise.all([fetchCampaigns(), fetchCampaignDetails(id)]);
      setActiveModal(null);
    } else {
      showToast(data.error || 'Failed to rename campaign', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error renaming campaign: ${msg}`, 'error');
  }
}

export async function updateCampaignTemplate(id: number, template: string) {
  try {
    const res = await fetch(`/api/campaigns/${id}/template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template, template_body: template })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Template body saved', 'success');
      await fetchCampaignDetails(id);
    } else {
      showToast(data.error || 'Failed to update template', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error updating template: ${msg}`, 'error');
  }
}

export async function addRecipients(campaignId: number, recipients: Array<{ phone_number: string; display_name?: string }>) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Added ${recipients.length} target contacts`, 'success');
      await fetchCampaignDetails(campaignId);
      setActiveModal(null);
    } else {
      showToast(data.error || 'Failed to add contacts', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error adding recipients: ${msg}`, 'error');
  }
}

export async function deleteRecipient(campaignId: number, recipientId: number) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/recipients/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_id: recipientId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Recipient removed', 'success');
      await fetchCampaignDetails(campaignId);
    } else {
      showToast(data.error || 'Failed to remove recipient', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error removing recipient: ${msg}`, 'error');
  }
}

export async function resendRecipient(campaignId: number, recipientId: number) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/recipients/${recipientId}/resend`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Recipient requeued for delivery', 'success');
      await fetchCampaignDetails(campaignId);
    } else {
      showToast(data.error || 'Failed to resend recipient', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error resending recipient: ${msg}`, 'error');
  }
}

export async function fetchCampaignAttachments(campaignId: number) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/attachments`);
    if (res.ok) {
      const data = await res.json();
      setCampaignAttachments(data.attachments || []);
      setCampaignAttachment(data.attachment || null);
    }
  } catch (e) {
    console.error('Error fetching campaign attachments', e);
  }
}

export const fetchCampaignAttachment = fetchCampaignAttachments;

export async function uploadCampaignAttachments(
  campaignId: number,
  files: Array<{
    fileName: string;
    fileDataB64: string;
    mimeType: string;
    thumbnailDataB64?: string;
    sendAs?: 'media' | 'document';
  }>
) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: files.map(f => ({
          file_name: f.fileName,
          file_data: f.fileDataB64,
          mime_type: f.mimeType,
          thumbnail_data: f.thumbnailDataB64,
          send_as: f.sendAs
        }))
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Attached ${files.length} file(s) to campaign`, 'success');
      await fetchCampaignAttachments(campaignId);
      await fetchCampaignDetails(campaignId);
    } else {
      showToast(data.error || 'Failed to upload attachments', 'error');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error uploading attachments: ${msg}`, 'error');
  }
}

export async function uploadCampaignAttachment(
  campaignId: number,
  fileName: string,
  fileDataB64: string,
  mimeType: string,
  thumbnailDataB64?: string
) {
  return uploadCampaignAttachments(campaignId, [{ fileName, fileDataB64, mimeType, thumbnailDataB64 }]);
}

export async function deleteCampaignAttachment(campaignId: number, fileName?: string) {
  try {
    const url = fileName
      ? `/api/campaigns/${campaignId}/attachments?name=${encodeURIComponent(fileName)}`
      : `/api/campaigns/${campaignId}/attachments`;
    const res = await fetch(url, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast(fileName ? `Removed '${fileName}'` : 'Removed all attachments', 'info');
      await fetchCampaignAttachments(campaignId);
      await fetchCampaignDetails(campaignId);
    } else {
      showToast(data.error || 'Failed to remove attachment', 'error');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error removing attachment: ${msg}`, 'error');
  }
}

export async function updateAttachmentMode(
  campaignId: number,
  fileName: string,
  sendAs: 'media' | 'document'
) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/attachments/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: fileName, send_as: sendAs })
    });
    const data = await res.json();
    if (data.success) {
      showToast(
        `Set '${fileName}' to ${sendAs === 'document' ? 'Document' : 'Media'}`,
        'info'
      );
      await fetchCampaignAttachments(campaignId);
      await fetchCampaignDetails(campaignId);
      return true;
    } else {
      showToast(data.error || 'Failed to update attachment mode', 'error');
      return false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error updating attachment mode: ${msg}`, 'error');
    return false;
  }
}

export async function trimVideoAttachment(
  campaignId: number,
  fileName: string,
  startTime: number,
  endTime: number,
  mute = false,
  preserveHd = true
) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);
    const res = await fetch(`/api/campaigns/${campaignId}/attachments/trim-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        file_name: fileName,
        start_time: startTime,
        end_time: endTime,
        mute,
        preserve_hd: preserveHd
      })
    });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.success) {
      showToast(`Trimmed video saved successfully`, 'success');
      await fetchCampaignAttachments(campaignId);
      await fetchCampaignDetails(campaignId);
      return true;
    } else {
      showToast(data.error || 'Failed to trim video', 'error');
      return false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error trimming video: ${msg}`, 'error');
    return false;
  }
}

export async function captureVideoFrame(
  campaignId: number,
  fileName: string,
  frameTime: number,
  asPhoto = false,
  imageData?: string
) {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/attachments/capture-frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: fileName,
        frame_time: frameTime,
        as_photo: asPhoto,
        image_data: imageData
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(asPhoto ? 'Captured frame as photo attachment' : 'Updated video thumbnail from frame', 'success');
      await fetchCampaignAttachments(campaignId);
      await fetchCampaignDetails(campaignId);
      return true;
    } else {
      showToast(data.error || 'Failed to capture frame', 'error');
      return false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error capturing frame: ${msg}`, 'error');
    return false;
  }
}

export async function saveEditedPhoto(
  campaignId: number,
  fileName: string,
  dataUrl: string
) {
  try {
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) throw new Error('Invalid image data');

    // Create thumbnail
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    const img = new window.Image();
    img.src = dataUrl;
    await new Promise(r => { img.onload = r; setTimeout(r, 2000); });
    ctx?.drawImage(img, 0, 0, 120, 120);
    const thumbB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    const res = await fetch(`/api/campaigns/${campaignId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_name: fileName,
        file_data: base64Data,
        mime_type: 'image/jpeg',
        send_as: 'media',
        thumbnail_data: thumbB64
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Edited photo saved successfully', 'success');
      await fetchCampaignAttachments(campaignId);
      await fetchCampaignDetails(campaignId);
      return true;
    } else {
      showToast(data.error || 'Failed to save photo', 'error');
      return false;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error saving photo: ${msg}`, 'error');
    return false;
  }
}

export async function setActiveAccount(id: string) {
  // Optimistically mark account active for immediate UI transition
  setAccounts(prev => prev.map(a => ({
    ...a,
    is_active: a.account_id === id
  })));

  try {
    const res = await fetch(`/api/accounts/${encodeURIComponent(id)}/set-active`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Active account switched to '${id}'`, 'success');
      await fetchAccounts();
    } else {
      showToast(data.error || 'Failed to switch active account', 'error');
      await fetchAccounts();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error setting active account: ${msg}`, 'error');
    await fetchAccounts();
  }
}

export async function removeAccount(id: string) {
  try {
    const res = await fetch(`/api/accounts/${encodeURIComponent(id)}/remove`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Account '${id}' removed`, 'success');
      setAccounts(prev => prev.filter(a => a.account_id !== id));
      if (typeof window !== 'undefined') {
        try {
          const rem = accounts().filter(a => a.account_id !== id);
          if (rem.length > 0) {
            localStorage.setItem('wasche_cached_accounts', JSON.stringify(rem));
          } else {
            localStorage.removeItem('wasche_cached_accounts');
          }
        } catch {}
      }
      await fetchAccounts();
    } else {
      showToast(data.error || 'Failed to remove account', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error removing account: ${msg}`, 'error');
  }
}

export async function renameAccount(oldId: string, newId: string) {
  try {
    const res = await fetch(`/api/accounts/${encodeURIComponent(oldId)}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_id: newId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Account renamed to '${newId}'`, 'success');
      await fetchAccounts();
      setActiveModal(null);
    } else {
      showToast(data.error || 'Failed to rename account', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error renaming account: ${msg}`, 'error');
  }
}

export async function sendDirectMessage(
  jid: string,
  accountId: string,
  message: string,
  attachments?: Array<{
    file_name: string;
    file_data: string;
    mime_type: string;
    send_as: 'media' | 'document';
    thumbnail_data?: string;
  }> | null
) {
  try {
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: jid,
        jid,
        account_id: accountId,
        message,
        attachments: attachments || [],
        attachment: attachments?.[0] || null
      })
    });
    const data = await res.json();
    if (data.success) {
      setActiveModal(null);
    } else {
      showToast(data.error || 'Failed to send message', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error sending message: ${msg}`, 'error');
  }
}

export async function syncContacts() {
  try {
    const res = await fetch('/api/contacts/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('Syncing contacts...', 'success');
      setTimeout(() => fetchContacts(contactsSearchQuery(), selectedAccountForContacts()), 1200);
    } else {
      showToast(data.error || 'Failed to sync contacts', 'error');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    showToast(`Error syncing contacts: ${msg}`, 'error');
  }
}
