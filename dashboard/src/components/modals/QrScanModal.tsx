import { createSignal, onSettled, Show } from 'solid-js';
import { showToast, fetchAccounts, setActiveModal } from '../store';
import { Smartphone, QrCode, RefreshCw, RotateCcw } from '../../icons';

export default function QrScanModal(props: {
  accountId: string;
  onClose: () => void;
  onSwitchToPhone: () => void;
}) {
  const [qrData, setQrData] = createSignal<{ svg_qr?: string; status?: string } | null>(null);
  const QR_TIMEOUT_SECS = 30;
  const [qrCountdown, setQrCountdown] = createSignal(QR_TIMEOUT_SECS);
  const [isQrRotating, setIsQrRotating] = createSignal(false);
  let qrPollTimer: number | undefined;
  let qrCountdownTimer: number | undefined;
  let lastSeenQr = '';

  const cleanSvg = (raw?: string) => {
    if (!raw) return '';
    return raw
      .replace(/<\?xml[\s\S]*?\?>/i, '')
      .replace(/\s+width="[^"]*"/i, ' width="100%"')
      .replace(/\s+height="[^"]*"/i, ' height="100%"');
  };

  const stopQrTimers = () => {
    clearInterval(qrPollTimer);
    clearInterval(qrCountdownTimer);
  };

  const triggerQrRotation = async (accId: string, manual = false) => {
    setIsQrRotating(true);
    setQrCountdown(QR_TIMEOUT_SECS);
    try {
      await fetch(`/api/accounts/${encodeURIComponent(accId)}/reset-pairing`, { method: 'POST' });
      if (manual) {
        showToast('Pairing session reset. Generating fresh QR...', 'info');
      }
      const res = await fetch(`/api/accounts/${encodeURIComponent(accId)}/qr`);
      if (res.ok) {
        const data = await res.json();
        setQrData(data);
        if (data?.svg_qr) lastSeenQr = data.svg_qr;
      }
    } catch {}
    setTimeout(() => setIsQrRotating(false), 500);
  };

  const startQrPolling = (accId: string) => {
    stopQrTimers();
    setQrCountdown(QR_TIMEOUT_SECS);
    setIsQrRotating(false);
    lastSeenQr = '';

    const poll = async () => {
      try {
        const res = await fetch(`/api/accounts/${encodeURIComponent(accId)}/qr`);
        if (res.ok) {
          const data = await res.json();
          if (data?.status === 'Connected') {
            stopQrTimers();
            showToast(`Account '${accId}' successfully connected!`, 'success');
            await fetchAccounts();
            setActiveModal(null);
            return;
          }
          if (data?.svg_qr && data.svg_qr !== lastSeenQr) {
            lastSeenQr = data.svg_qr;
            setQrData(data);
            setQrCountdown(QR_TIMEOUT_SECS);
            setIsQrRotating(false);
          } else if (data?.status) {
            setQrData(data);
          }
        }
      } catch {}
    };

    poll();
    qrPollTimer = window.setInterval(poll, 2000);
    qrCountdownTimer = window.setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          triggerQrRotation(accId, false);
          return QR_TIMEOUT_SECS;
        }
        return prev - 1;
      });
    }, 1000);
  };

  onSettled(() => {
    startQrPolling(props.accountId);
    return () => {
      stopQrTimers();
    };
  });

  return (
    <div class="space-y-4">
      <div class="bg-[#111b21] border border-[#2a3942] rounded-xl p-3 px-4 text-xs text-[#8696a0]">
        <div class="flex items-center gap-2 text-[#e9edef] font-semibold mb-1.5">
          <Smartphone size={14} class="text-[#00a884]" />
          <span>To link WhatsApp on this account:</span>
        </div>
        <ol class="list-decimal list-inside space-y-1 text-[11.5px] leading-relaxed">
          <li>
            Open <strong>WhatsApp</strong> on your mobile phone
          </li>
          <li>
            Tap <strong>Settings &rarr; Linked Devices &rarr; Link a Device</strong>
          </li>
          <li>Point your phone camera to scan the QR code below</li>
        </ol>
      </div>

      <div class="bg-[#111b21] p-6 rounded-2xl border border-[#2a3942] flex flex-col items-center justify-center min-h-[340px]">
        <Show
          when={qrData()?.svg_qr}
          fallback={
            <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-[#182229] border border-[#2a3942] text-xs mb-4 select-none">
              <span class="w-2 h-2 rounded-full bg-[#ffbc38] animate-ping" />
              <span class="text-[#8696a0]">
                {qrData()?.status === 'Connecting'
                  ? 'Connecting to WhatsApp...'
                  : 'Initializing pairing session...'}
              </span>
            </div>
          }
        >
          <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-[#182229] border border-[#2a3942] text-xs mb-4 select-none">
            <span
              class={`w-2 h-2 rounded-full transition-colors ${
                qrCountdown() <= 5 ? 'bg-[#ffbc38] animate-ping' : 'bg-[#00a884]'
              }`}
            />
            <span class="text-[#8696a0]">Auto-rotates in:</span>
            <span
              class={`font-mono font-bold ${
                qrCountdown() <= 5 ? 'text-[#ffbc38]' : 'text-[#e9edef]'
              }`}
            >
              {qrCountdown()}s
            </span>
          </div>
        </Show>

        <Show
          when={qrData()?.svg_qr}
          fallback={
            <div class="py-12 flex flex-col items-center justify-center gap-3 text-xs text-[#8696a0]">
              <div class="w-12 h-12 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-[#00a884] animate-pulse">
                <QrCode size={24} />
              </div>
              <span class="font-medium text-[#e9edef]">
                {qrData()?.status === 'Connecting'
                  ? 'Handshake in progress with WhatsApp servers...'
                  : 'Waiting for WhatsApp pairing session...'}
              </span>
              <span class="text-[11px] text-[#8696a0]/80">
                {qrData()?.status === 'Connecting'
                  ? 'TLS secure channel connected, requesting live QR code...'
                  : 'Generating live pairing code'}
              </span>
            </div>
          }
        >
          <div
            class="relative bg-white p-5 rounded-3xl w-[268px] h-[268px] mx-auto flex items-center justify-center overflow-hidden"
            style={{
              'border-radius': '24px',
              'box-shadow': '0 12px 36px rgba(0, 0, 0, 0.45)',
              '-webkit-mask-image': '-webkit-radial-gradient(white, black)'
            }}
          >
            <div
              class={`qr-display-box w-full h-full flex items-center justify-center transition-opacity duration-200 ${
                isQrRotating() ? 'opacity-20' : 'opacity-100'
              }`}
              innerHTML={cleanSvg(qrData()?.svg_qr)}
            />

            <Show when={isQrRotating()}>
              <div
                class="absolute inset-0 flex flex-col items-center justify-center bg-white/92 gap-2.5 z-10"
                style={{ 'border-radius': '24px' }}
              >
                <div class="w-10 h-10 rounded-full bg-[#111b21] flex items-center justify-center shadow-md">
                  <RefreshCw size={20} class="text-[#00a884] animate-spin" />
                </div>
                <span class="text-xs font-bold text-[#111b21] tracking-tight">Rotating QR...</span>
              </div>
            </Show>
          </div>

          <div class="w-[268px] h-1.5 bg-[#202c33] rounded-full overflow-hidden mt-4 border border-[#2a3942]/50">
            <div
              class={`h-full transition-all duration-1000 ease-linear rounded-full ${
                qrCountdown() <= 5 ? 'bg-[#ffbc38]' : 'bg-[#00a884]'
              }`}
              style={{ width: `${(qrCountdown() / QR_TIMEOUT_SECS) * 100}%` }}
            />
          </div>
        </Show>
      </div>

      <div class="flex items-center justify-between text-xs pt-1">
        <button
          type="button"
          class="btn-secondary h-8 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer hover:border-[#00a884] transition-colors"
          onClick={() => triggerQrRotation(props.accountId, true)}
          disabled={isQrRotating()}
        >
          <RotateCcw size={13} class={isQrRotating() ? 'animate-spin' : ''} />
          <span>Reset QR</span>
        </button>

        <button
          type="button"
          style={{ border: 'none', background: 'transparent' }}
          class="text-xs text-[#00a884] hover:underline cursor-pointer p-0 font-medium flex items-center gap-1"
          onClick={props.onSwitchToPhone}
        >
          <span>Pair with phone number instead</span>
          <span>&rarr;</span>
        </button>
      </div>
    </div>
  );
}
