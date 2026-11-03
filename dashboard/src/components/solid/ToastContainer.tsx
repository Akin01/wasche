import { For } from 'solid-js';
import { toasts } from './store';
import { Check, AlertCircle, HelpCircle } from 'lucide-solid';

export default function ToastContainer() {
  return (
    <div id="toastContainer" class="toast-container">
      <For each={toasts()}>
        {toast => (
          <div class={`toast-item toast-${toast.type}`}>
            <span style={{ display: 'flex', 'align-items': 'center', 'flex-shrink': '0' }}>
              {toast.type === 'success' ? (
                <Check size={16} class="text-[#00a884]" />
              ) : toast.type === 'error' ? (
                <AlertCircle size={16} class="text-[#f15c6d]" />
              ) : (
                <HelpCircle size={16} class="text-[#53bdeb]" />
              )}
            </span>
            <span style={{ flex: '1', 'line-height': '1.4' }}>{toast.message}</span>
          </div>
        )}
      </For>
    </div>
  );
}
