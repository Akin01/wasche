import { Show } from 'solid-js';
import { Dialog } from '@kobalte/core/dialog';
import { activeModal, setActiveModal } from './store';
import { X } from '../icons';

import AddAccountModal from './modals/AddAccountModal';
import QrScanModal from './modals/QrScanModal';
import PairPhoneModal from './modals/PairPhoneModal';
import DirectMessageModal from './modals/DirectMessageModal';
import AddContactsModal from './modals/AddContactsModal';
import CreateCampaignModal from './modals/CreateCampaignModal';
import RenameModal from './modals/RenameModal';
import ConfirmModal from './modals/ConfirmModal';
import VideoTrimmerModal from './modals/VideoTrimmerModal';
import PhotoStudioModal from './modals/PhotoStudioModal';

export default function Modals() {
  const modal = () => activeModal();
  const isOpen = () => modal() !== null;

  const handleClose = () => {
    setActiveModal(null);
  };

  const getModalTitle = () => {
    const m = modal();
    if (!m) return '';
    switch (m.type) {
      case 'add_account':
        return 'Add WhatsApp Account';
      case 'qr':
        return `Scan QR Code • ${m.accountId}`;
      case 'pair_phone':
        return `Pair by Phone Number • ${m.accountId}`;
      case 'direct_message':
        return m.name ? `Direct Message • ${m.name}` : 'Direct Message';
      case 'add_contacts':
        return 'Add Target Contacts to Campaign';
      case 'create_campaign':
        return 'Create Broadcast Campaign';
      case 'rename_campaign':
        return 'Rename Broadcast Campaign';
      case 'rename_account':
        return 'Rename WhatsApp Account';
      case 'confirm':
        return m.title;
      case 'cut_video':
        return 'Video Trimmer Studio';
      case 'edit_photo':
        return 'WhatsApp Photo Studio';
      default:
        return '';
    }
  };

  const getMaxWidthClass = () => {
    const m = modal();
    if (!m) return 'max-w-sm';
    switch (m.type) {
      case 'direct_message':
      case 'create_campaign':
      case 'add_contacts':
        return 'max-w-xl';
      case 'cut_video':
        return 'max-w-lg';
      case 'edit_photo':
        return 'max-w-2xl';
      case 'confirm':
        return 'max-w-md';
      case 'pair_phone':
      case 'add_account':
      case 'rename_campaign':
      case 'rename_account':
        return 'max-w-sm';
      default:
        return 'max-w-sm';
    }
  };

  return (
    <Dialog open={isOpen()} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="fixed inset-0 z-50 bg-black/80 animate-fade" />
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            class={`pointer-events-auto bg-[#182229] border border-[#2a3942] rounded-2xl shadow-modal w-full overflow-hidden flex flex-col animate-modal ${getMaxWidthClass()}`}
          >
            {/* Header */}
            <div class="h-14 px-6 border-b border-[#222d34] flex items-center justify-between shrink-0 bg-[#111b21]">
              <Dialog.Title class="text-base font-bold text-[#e9edef] m-0 tracking-tight truncate">
                {getModalTitle()}
              </Dialog.Title>
              <button
                class="w-8 h-8 rounded-full flex items-center justify-center text-[#8696a0] hover:text-[#e9edef] hover:bg-[#202c33] transition-colors cursor-pointer border-none bg-transparent"
                onClick={handleClose}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div class="p-6 overflow-y-auto max-h-[calc(85vh-120px)] space-y-4">
              <Show when={modal()?.type === 'add_account'}>
                <AddAccountModal onClose={handleClose} />
              </Show>

              <Show when={modal()?.type === 'qr'}>
                <QrScanModal
                  accountId={(modal() as any)?.accountId || ''}
                  onClose={handleClose}
                  onSwitchToPhone={() =>
                    setActiveModal({
                      type: 'pair_phone',
                      accountId: (modal() as any)?.accountId || ''
                    })
                  }
                />
              </Show>

              <Show when={modal()?.type === 'pair_phone'}>
                <PairPhoneModal
                  accountId={(modal() as any)?.accountId || ''}
                  onClose={handleClose}
                />
              </Show>

              <Show when={modal()?.type === 'direct_message'}>
                <DirectMessageModal
                  jid={(modal() as any)?.jid}
                  accountId={(modal() as any)?.accountId}
                  name={(modal() as any)?.name}
                  preserveState={(modal() as any)?.preserveState}
                  onClose={handleClose}
                />
              </Show>

              <Show when={modal()?.type === 'add_contacts'}>
                <AddContactsModal
                  campaignId={(modal() as any)?.campaignId || 0}
                  onClose={handleClose}
                />
              </Show>

              <Show when={modal()?.type === 'create_campaign'}>
                <CreateCampaignModal
                  preserveState={(modal() as any)?.preserveState}
                  onClose={handleClose}
                />
              </Show>

              <Show
                when={modal()?.type === 'rename_campaign' || modal()?.type === 'rename_account'}
              >
                <RenameModal
                  type={(modal() as any)?.type}
                  targetId={
                    (modal() as any)?.type === 'rename_campaign'
                      ? (modal() as any)?.campaignId
                      : (modal() as any)?.accountId
                  }
                  initialName={(modal() as any)?.currentName || ''}
                  onClose={handleClose}
                />
              </Show>

              <Show when={modal()?.type === 'confirm'}>
                <ConfirmModal
                  title={(modal() as any)?.title || ''}
                  message={(modal() as any)?.message || ''}
                  onConfirm={(modal() as any)?.onConfirm || (() => {})}
                  onClose={handleClose}
                />
              </Show>

              <Show when={modal()?.type === 'cut_video'}>
                <VideoTrimmerModal data={modal() as any} onClose={handleClose} />
              </Show>

              <Show when={modal()?.type === 'edit_photo'}>
                <PhotoStudioModal data={modal() as any} onClose={handleClose} />
              </Show>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog>
  );
}
