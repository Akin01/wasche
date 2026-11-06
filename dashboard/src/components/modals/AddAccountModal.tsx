import { createSignal } from 'solid-js';
import { setActiveModal, fetchAccounts, showToast } from '../store';

export default function AddAccountModal(props: { onClose: () => void }) {
  const [newAccountId, setNewAccountId] = createSignal('');
  const [newAccountPhone, setNewAccountPhone] = createSignal('');

  const handleSubmit = async () => {
    const id = newAccountId().trim();
    if (!id) {
      showToast('Account ID cannot be empty', 'error');
      return;
    }
    try {
      const res = await fetch('/api/accounts/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: id,
          phone: newAccountPhone().trim() || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Account '${id}' registered`, 'success');
        await fetchAccounts();
        if (newAccountPhone().trim()) {
          setActiveModal({ type: 'pair_phone', accountId: id });
        } else {
          setActiveModal({ type: 'qr', accountId: id });
        }
      } else {
        showToast(data.error || 'Failed to add account', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Error adding account: ${msg}`, 'error');
    }
  };

  return (
    <div class="space-y-4">
      <p class="text-xs text-text-muted">
        Enter a unique identifier for this WhatsApp connection (e.g. <code>sales</code>,{' '}
        <code>support</code>).
      </p>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          Account Identifier
        </label>
        <input
          type="text"
          class="w-full bg-[#111b21] border border-border-light rounded-xl px-3.5 py-2.5 text-sm text-text-main focus:outline-none focus:border-accent"
          placeholder="e.g. sales-team"
          value={newAccountId()}
          onInput={(e) => setNewAccountId(e.currentTarget.value)}
        />
      </div>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          Phone Number (Optional)
        </label>
        <input
          type="text"
          class="w-full bg-[#111b21] border border-border-light rounded-xl px-3.5 py-2.5 text-sm text-text-main focus:outline-none focus:border-accent"
          placeholder="+62 812-3456-7890 (or leave empty for QR)"
          value={newAccountPhone()}
          onInput={(e) => setNewAccountPhone(e.currentTarget.value)}
        />
      </div>
      <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
        <button
          class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={handleSubmit}
        >
          Continue to Pair
        </button>
      </div>
    </div>
  );
}
