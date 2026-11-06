import { For, Show } from 'solid-js';
import {
  accounts,
  setActiveAccount,
  removeAccount,
  setActiveModal
} from './store';
import { getAccountStatusState } from './types';
import {
  Smartphone,
  QrCode,
  KeyRound,
  RotateCcw,
  Send,
  Pencil,
  Trash2,
  CheckCircle,
  Check,
  Plus
} from 'lucide-solid';

export default function DevicesView() {
  return (
    <div class="space-y-6">
      {/* Top Header Card */}
      <div class="card rounded-2xl p-4 px-5 flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884]">
            <Smartphone size={20} />
          </div>
          <div>
            <h2 class="text-sm font-bold text-[#e9edef] tracking-wide">
              Connected WhatsApp Accounts & Numbers
            </h2>
            <p class="text-xs text-[#8696a0]">
              Manage linked WhatsApp web sessions, QR pairing, and 8-character phone pairing codes.
            </p>
          </div>
        </div>

        <button
          class="btn-accent h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          onClick={() => setActiveModal({ type: 'add_account' })}
        >
          <Plus size={13} />
          <span>Add Account</span>
        </button>
      </div>

      {/* Accounts Grid */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Show
          when={accounts().length > 0}
          fallback={
            <div class="col-span-full card rounded-2xl p-10 text-center text-[#8696a0]">
              No WhatsApp accounts registered. Click '+ Add Account' to link your first number.
            </div>
          }
        >
          <For each={accounts()}>
            {acc => (
              <div
                class="card rounded-2xl p-5 relative transition-all"
                style={{
                  border: acc.is_active ? '1px solid #00a884' : '1px solid #222d34',
                  background: acc.is_active ? 'rgba(24, 34, 41, 0.95)' : undefined,
                  'box-shadow': 'none'
                }}
              >
                {/* Active Account Pill */}
                <Show when={acc.is_active}>
                  <div
                    style={{ border: '1px solid #00a884', background: 'transparent', color: '#00a884', 'box-shadow': 'none' }}
                    class="absolute top-3.5 right-3.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                  >
                    <CheckCircle size={11} />
                    <span>Active</span>
                  </div>
                </Show>
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-accent font-bold text-sm shrink-0">
                    {acc.account_id.charAt(0).toUpperCase()}
                  </div>
                  <div class="min-w-0 pr-12">
                    <div class="flex items-center gap-2">
                      <strong class="text-sm text-[#e9edef] truncate">{acc.account_id}</strong>
                    </div>
                    <div class="text-xs font-mono text-[#00a884]">
                      {acc.phone_number ? `+${acc.phone_number}` : 'No Phone Linked'}
                    </div>
                  </div>
                </div>

                <div class="flex items-center justify-between text-xs py-2 border-y border-[#222d34] mb-4">
                  <span class="text-[#8696a0]">Connection State:</span>
                  <span class={`pill ${getAccountStatusState(acc.status).toLowerCase()}`}>
                    <span
                      class={`status-dot mr-1 ${
                        getAccountStatusState(acc.status) === 'Connected' ? 'online' : 'offline'
                      }`}
                    />
                    {getAccountStatusState(acc.status)}
                  </span>
                </div>

                {/* Primary Action Buttons */}
                <div class="flex flex-wrap gap-2 pt-1">
                  <Show
                    when={!acc.is_active}
                    fallback={
                      <button
                        style={{ border: '1px solid #00a884', background: 'transparent', color: '#00a884', 'box-shadow': 'none' }}
                        class="h-8 px-3 text-xs font-semibold rounded-lg flex-1 flex items-center justify-center gap-1.5 cursor-default select-none"
                        disabled
                      >
                        <Check size={13} class="text-[#00a884]" />
                        <span>Active</span>
                      </button>
                    }
                  >
                    <button
                      style={{ 'box-shadow': 'none' }}
                      class="btn-secondary h-8 px-3 text-xs font-medium rounded-lg flex-1 cursor-pointer hover:border-[#00a884] hover:text-[#00a884] transition-colors"
                      onClick={() => setActiveAccount(acc.account_id)}
                    >
                      Set Active
                    </button>
                  </Show>

                  <Show when={getAccountStatusState(acc.status) !== 'Connected'}>
                    <button
                      class="btn-accent h-8 px-2.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                      title="Scan QR Code"
                      onClick={() => setActiveModal({ type: 'qr', accountId: acc.account_id })}
                    >
                      <QrCode size={13} />
                      <span>QR Code</span>
                    </button>

                    <button
                      class="btn-secondary h-8 px-2.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                      title="Pair with Phone Code"
                      onClick={() => setActiveModal({ type: 'pair_phone', accountId: acc.account_id })}
                    >
                      <KeyRound size={13} />
                      <span>Pair Phone</span>
                    </button>
                  </Show>

                  <button
                    class="token-chip-btn"
                    title="Send Direct WhatsApp Message"
                    onClick={() =>
                      setActiveModal({
                        type: 'direct_message',
                        accountId: acc.account_id
                      })
                    }
                  >
                    <Send size={13} />
                  </button>

                  <button
                    class="token-chip-btn"
                    title="Reset Pairing Session"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/accounts/${encodeURIComponent(acc.account_id)}/reset-pairing`, { method: 'POST' });
                        if (res.ok) {
                          setActiveModal({ type: 'qr', accountId: acc.account_id });
                        }
                      } catch {}
                    }}
                  >
                    <RotateCcw size={13} />
                  </button>

                  <button
                    class="token-chip-btn"
                    title="Rename Account"
                    onClick={() =>
                      setActiveModal({
                        type: 'rename_account',
                        accountId: acc.account_id,
                        currentName: acc.account_id
                      })
                    }
                  >
                    <Pencil size={13} />
                  </button>

                  <button
                    class="token-chip-btn text-[#f15c6d]"
                    title="Remove Account"
                    onClick={() =>
                      setActiveModal({
                        type: 'confirm',
                        title: 'Remove WhatsApp Account',
                        message: `Are you sure you want to remove account '${acc.account_id}'? This will delete local authentication keys and close the connection.`,
                        onConfirm: () => removeAccount(acc.account_id)
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
