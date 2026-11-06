import { createSignal } from 'solid-js';
import { renameCampaign, renameAccount } from '../store';

export default function RenameModal(props: {
  type: 'rename_campaign' | 'rename_account';
  targetId: number | string;
  initialName: string;
  onClose: () => void;
}) {
  const [renameInput, setRenameInput] = createSignal(props.initialName);

  const handleSave = () => {
    const val = renameInput().trim();
    if (!val) return;
    if (props.type === 'rename_campaign') {
      renameCampaign(props.targetId as number, val);
    } else {
      renameAccount(props.targetId as string, val);
    }
    props.onClose();
  };

  return (
    <div class="space-y-4">
      <div>
        <label class="block text-xs font-semibold uppercase tracking-wider text-[#8696a0] mb-1.5">
          New Name / Identifier
        </label>
        <input
          type="text"
          class="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-sm text-[#e9edef] focus:outline-none focus:border-[#00a884]"
          value={renameInput()}
          onInput={(e) => setRenameInput(e.currentTarget.value)}
        />
      </div>
      <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[#222d34]">
        <button
          class="btn-cancel h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          class="btn-accent h-8 px-3.5 text-xs font-medium rounded-lg cursor-pointer"
          onClick={handleSave}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
