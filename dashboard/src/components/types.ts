export interface AccountStatusDetails {
  phone_number?: string;
  push_name?: string;
}

export interface AccountStatusObject {
  state: string;
  details?: AccountStatusDetails;
}

export type AccountStatus = string | AccountStatusObject;

export function getAccountStatusState(status: AccountStatus | undefined): string {
  if (typeof status === 'string') return status;
  if (status && typeof status === 'object' && 'state' in status && typeof status.state === 'string') {
    return status.state;
  }
  return 'Disconnected';
}

export interface Account {
  account_id: string;
  status: AccountStatus;
  is_active: boolean;
  phone_number?: string | null;
  push_name?: string | null;
}
export interface Campaign {
  id: number;
  name: string;
  template_body: string;
  attachment_path?: string | null;
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  min_delay_secs: number;
  max_delay_secs: number;
  account_id: string;
  created_at: number;
  updated_at: number;
}

export interface AttachmentInfo {
  file_name: string;
  file_size: number;
  mime_type: string;
  url: string;
  thumbnail_url?: string | null;
  send_as?: 'media' | 'document';
}
export interface Recipient {
  id: number;
  campaign_id: number;
  jid: string;
  phone_number: string;
  display_name?: string | null;
  custom_fields_json?: string | null;
  status: string;
  error_reason?: string | null;
  scheduled_at?: number | null;
  sent_at?: number | null;
}

export interface CampaignRun {
  id: number;
  campaign_id: number;
  run_number: number;
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  started_at: number;
  completed_at?: number | null;
}

export interface DeliveryLog {
  id: number;
  campaign_id: number;
  run_id: number;
  recipient_id: number;
  jid: string;
  phone_number: string;
  display_name?: string | null;
  status: string;
  error_reason?: string | null;
  message_id?: string | null;
  sender_account?: string | null;
  timestamp: number;
}

export interface CampaignDetails {
  campaign: Campaign;
  recent_recipients?: Recipient[];
  runs?: CampaignRun[];
  recent_logs?: DeliveryLog[];
}

export interface Contact {
  id?: string;
  jid: string;
  phone_number?: string | null;
  first_name?: string | null;
  full_name?: string | null;
  push_name?: string | null;
  business_name?: string | null;
  avatar_url?: string | null;
}

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type ActiveModal =
  | { type: 'add_account'; accountId?: string }
  | { type: 'qr'; accountId: string }
  | { type: 'pair_phone'; accountId: string }
  | { type: 'direct_message'; jid?: string; name?: string; accountId?: string; preserveState?: boolean }
  | { type: 'add_contacts'; campaignId: number }
  | { type: 'create_campaign'; preserveState?: boolean }
  | { type: 'rename_campaign'; campaignId: number; currentName: string }
  | { type: 'rename_account'; accountId: string; currentName: string }
  | { type: 'confirm'; title: string; message: string; onConfirm: () => void | Promise<void> }
  | {
      type: 'cut_video';
      campaignId?: number;
      fileName: string;
      videoUrl: string;
      fileSize: number;
      returnToDirectMessage?: boolean;
      returnToCreateCampaign?: boolean;
      onTrim?: (params: { startTime: number; endTime: number; mute: boolean; preserveHd: boolean }) => void | Promise<void>;
    }
  | {
      type: 'edit_photo';
      campaignId?: number;
      fileName: string;
      imageUrl: string;
      returnToDirectMessage?: boolean;
      returnToCreateCampaign?: boolean;
      onSave?: (editedDataUrl: string, thumbnailB64?: string) => void | Promise<void>;
    }
  | null;
