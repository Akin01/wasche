import { createSignal, Show } from 'solid-js';
import { showToast } from '../store';

export default function PairPhoneModal(props: { accountId: string; onClose: () => void }) {
  const [pairCode, setPairCode] = createSignal<string | null>(null);
  const [pairPhoneInput, setPairPhoneInput] = createSignal('');

  const handleRequestCode = async () => {
    const phone = pairPhoneInput().trim();
    if (!phone) {
      showToast('Please enter a phone number', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/accounts/${encodeURIComponent(props.accountId)}/pair-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.pairing_code) {
        setPairCode(data.pairing_code);
        showToast('Pairing code generated!', 'success');
      } else {
        showToast(data.error || 'Failed to request pairing code', 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Error: ${msg}`, 'error');
    }
  };

  return (
    <div class="space-y-4">
      <p class="text-xs text-[#8696a0]">
        Enter your phone number (with country code) to receive an 8-character pairing code on your
        phone.
      </p>
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
          Phone Number
        </label>
        <input
          type="text"
          class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
          placeholder="e.g. 628123456789"
          value={pairPhoneInput()}
          onInput={(e) => setPairPhoneInput(e.currentTarget.value)}
        />
      </div>

      <Show when={pairCode()}>
        <div class="p-4 bg-[#111b21] rounded-xl border border-[#00a884] text-center space-y-1">
          <span class="text-xs text-[#8696a0] block uppercase tracking-wider">Pairing Code</span>
          <strong class="text-2xl font-mono text-[#00a884] tracking-widest block">
            {pairCode()}
          </strong>
          <span class="text-[11px] text-[#8696a0] block">
            Enter this 8-digit code on your WhatsApp notification.
          </span>
        </div>
      </Show>

      <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
        <button
          class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={handleRequestCode}
        >
          Request Pairing Code
        </button>
      </div>
    </div>
  );
}
