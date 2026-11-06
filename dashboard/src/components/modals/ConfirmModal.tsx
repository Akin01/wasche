import { AlertTriangle, Trash2 } from '../../icons';

export default function ConfirmModal(props: {
  title: string;
  message: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  return (
    <div class="space-y-4">
      <div class="flex items-start gap-4 p-1">
        <div class="w-10 h-10 rounded-xl bg-[#ffbc38]/15 border border-[#ffbc38]/30 text-[#ffbc38] flex items-center justify-center shrink-0">
          <AlertTriangle size={20} />
        </div>
        <div class="min-w-0 flex-1">
          <h4 class="text-sm font-semibold text-[#e9edef] mb-1.5">{props.title}</h4>
          <p class="text-xs text-[#8696a0] leading-relaxed">{props.message}</p>
        </div>
      </div>
      <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
        <button
          class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          class="btn-danger h-8 px-3.5 text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
          onClick={async () => {
            await props.onConfirm();
            props.onClose();
          }}
        >
          <Trash2 size={13} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
}
