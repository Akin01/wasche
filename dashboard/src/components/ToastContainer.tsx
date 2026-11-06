import { For } from 'solid-js';
import { toasts } from './store';
import { Check, AlertCircle, HelpCircle } from 'lucide-solid';

export default function ToastContainer() {
  return (
    <div id="toastContainer" class="toast-container">
      <For each={toasts()}>
        {(toast) => (
          <div class={`toast-item toast-${toast.type}`}>
            <span class="flex items-center shrink-0">
              {toast.type === 'success' ? (
                <Check size={16} class="text-accent" />
              ) : toast.type === 'error' ? (
                <AlertCircle size={16} class="text-danger" />
              ) : (
                <HelpCircle size={16} class="text-info" />
              )}
            </span>
            <span class="flex-1 leading-snug">{toast.message}</span>
          </div>
        )}
      </For>
    </div>
  );
}
