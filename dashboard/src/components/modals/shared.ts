import { createSignal } from 'solid-js';

export const [campName, setCampName] = createSignal('');
export const [campAccounts, setCampAccounts] = createSignal<string[]>([]);
export const [campTemplate, setCampTemplate] = createSignal(
  'Hello {name}, this is an automated announcement.'
);
export const [campMinDelay, setCampMinDelay] = createSignal('20');
export const [campMaxDelay, setCampMaxDelay] = createSignal('45');
export const [campAttachmentsList, setCampAttachmentsList] = createSignal<ModalAttachment[]>([]);
export const [campTab, setCampTab] = createSignal<'editor' | 'preview'>('editor');

export const [dmJid, setDmJid] = createSignal('');
export const [dmAccount, setDmAccount] = createSignal('');
export const [dmMessage, setDmMessage] = createSignal('');
export const [dmAttachmentsList, setDmAttachmentsList] = createSignal<ModalAttachment[]>([]);
export const [dmTab, setDmTab] = createSignal<'editor' | 'preview'>('editor');

export interface ModalAttachment {
  fileName: string;
  fileDataB64: string;
  mimeType: string;
  thumbnailB64?: string;
  sendAs: 'media' | 'document';
  fileSize: number;
  blobUrl?: string;
}

export const EMOJIS = [
  '👍',
  '❤️',
  '🔥',
  '👏',
  '🙏',
  '🎉',
  '😊',
  '🚀',
  '✅',
  '✨',
  '💯',
  '👋',
  '⭐',
  '🤝',
  '💼',
  '📌',
  '🔔',
  '📢',
  '🎁',
  '⚡',
  '💬',
  '📱',
  '📦',
  '🎯'
];

export const TAGS = [
  { label: 'Name', token: '{{name}}' },
  { label: 'Phone', token: '{{phone}}' },
  { label: 'First Name', token: '{{first_name}}' },
  { label: 'Custom', token: '{{key}}' }
];

export function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatWhatsAppText(
  raw: string,
  sampleName = 'Budi',
  samplePhone = '+62 812-3456-7890'
) {
  if (!raw) return '';
  let text = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{\{name\}\}|\{name\}/gi, sampleName)
    .replace(/\{\{phone\}\}|\{phone\}/gi, samplePhone);
  text = text.replace(
    /```([\s\S]*?)```/g,
    '<code style="background:rgba(0,0,0,0.35); padding:2px 6px; border-radius:4px; font-family:monospace; font-size:11.5px; display:inline-block; margin:2px 0;">$1</code>'
  );
  text = text.replace(
    /`([^`\n]+)`/g,
    '<code style="background:rgba(0,0,0,0.35); padding:1px 5px; border-radius:3px; font-family:monospace; font-size:11.5px;">$1</code>'
  );
  text = text.replace(
    /(?<!\w)\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?!\w)/g,
    '<strong style="font-weight:700;">$1</strong>'
  );
  text = text.replace(
    /(?<!\w)_([^\s_](?:[\s\S]*?[^\s_])?)_(?!\w)/g,
    '<em style="font-style:italic;">$1</em>'
  );
  text = text.replace(
    /(?<!\w)~([^\s~](?:[\s\S]*?[^\s~])?)~(?!\w)/g,
    '<del style="text-decoration:line-through; opacity:0.85;">$1</del>'
  );
  text = text.replace(/\r?\n/g, '<br/>');
  return text;
}

export function wrapText(
  textareaId: string,
  getter: () => string,
  setter: (val: string) => void,
  wrapper: string
) {
  const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
  const cur = getter();
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = cur.substring(start, end);
  let nextText = '';
  if (selected.length > 0) {
    nextText = cur.substring(0, start) + `${wrapper}${selected}${wrapper}` + cur.substring(end);
  } else {
    nextText = cur.substring(0, start) + `${wrapper}text${wrapper}` + cur.substring(end);
  }
  setter(nextText);
  setTimeout(() => {
    textarea.focus();
    textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
  }, 10);
}

export function insertToken(
  textareaId: string,
  getter: () => string,
  setter: (val: string) => void,
  token: string
) {
  const textarea = document.getElementById(textareaId) as HTMLTextAreaElement | null;
  const cur = getter();
  if (!textarea) {
    setter(cur + token);
    return;
  }
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const nextText = cur.substring(0, start) + token + cur.substring(end);
  setter(nextText);
  setTimeout(() => {
    textarea.focus();
    const pos = start + token.length;
    textarea.setSelectionRange(pos, pos);
  }, 10);
}

export async function processAttachmentFile(
  file: File,
  forcedMode: 'media' | 'document'
): Promise<ModalAttachment> {
  const fileName = file.name;
  const mimeType = file.type || 'application/octet-stream';
  const isVideo = mimeType.startsWith('video/');

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  let thumbnailB64: string | undefined;
  if (isVideo) {
    try {
      const vid = document.createElement('video');
      vid.src = URL.createObjectURL(file);
      const { promise: pLoaded, resolve: rLoaded } = Promise.withResolvers<void>();
      vid.onloadeddata = () => rLoaded();
      setTimeout(rLoaded, 600);
      await pLoaded;

      vid.currentTime = 0.5;
      const { promise: pSeeked, resolve: rSeeked } = Promise.withResolvers<void>();
      vid.onseeked = () => rSeeked();
      setTimeout(rSeeked, 600);
      await pSeeked;
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(vid, 0, 0, 160, 100);
      thumbnailB64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    } catch {}
  }

  const blobUrl = URL.createObjectURL(file);
  return {
    fileName,
    fileDataB64: base64Data,
    mimeType,
    thumbnailB64,
    sendAs: forcedMode,
    fileSize: file.size,
    blobUrl
  };
}
