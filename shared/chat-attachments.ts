import { NORMALIZED_HISTORY_MAX_TEXT_LENGTH } from './streaming-schemas.js';

export const MAX_ATTACHMENT_BYTES = 3_000_000;
export const MAX_ATTACHMENT_REQUEST_BYTES = 4_250_000;
export const ATTACHMENT_TYPES = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/msword': ['doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
} as const;
export type AttachmentMediaType = keyof typeof ATTACHMENT_TYPES;
export interface ChatAttachment { name: string; mediaType: AttachmentMediaType; data: string }
export interface AttachmentRequest { id: string; message: string; attachments?: readonly ChatAttachment[] }
export class AttachmentError extends Error {
  constructor(message: string, readonly status = 400) { super(message); this.name = 'AttachmentError'; }
}
export function sanitizeAttachmentName(name: string): string {
  const basename = (name.split(/[\\/]/).pop() ?? '').replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '');
  const extension = /\.[a-zA-Z0-9]{1,5}$/.exec(basename)?.[0] ?? '';
  return (basename.length > 120 ? basename.slice(0, 120 - extension.length) + extension : basename) || 'document';
}
export function formatAttachmentMessage(caption: string, files: readonly { name: string; mediaType: string }[] = []): string {
  if (!files.length) return caption;
  const labels = files.map((file) => file.mediaType.startsWith('image/') ? 'Image attached'
    : `${sanitizeAttachmentName(file.name)} — ${file.mediaType === 'application/pdf' ? 'PDF document' : 'Word document'}`);
  return [caption, labels.join('\n')].filter(Boolean).join('\n\n');
}
export function serializedRequestBytes(request: AttachmentRequest): number {
  return new TextEncoder().encode(JSON.stringify(request)).byteLength;
}
export function validateAttachmentRequest(request: AttachmentRequest): void {
  if (!request.message.trim() && !request.attachments?.length) throw new AttachmentError('Add a caption or file before sending.');
  if (serializedRequestBytes(request) > MAX_ATTACHMENT_REQUEST_BYTES) throw new AttachmentError('Message too large. Remove or replace a file, or send separately (3 MB total per message).', 413);
  if (formatAttachmentMessage(request.message, request.attachments).length > NORMALIZED_HISTORY_MAX_TEXT_LENGTH) {
    throw new AttachmentError('Too much message text. Remove files or send separately.');
  }
  let total = 0;
  for (const file of request.attachments ?? []) {
    const extensions = ATTACHMENT_TYPES[file.mediaType] as readonly string[] | undefined;
    if (!extensions?.includes(file.name.split('.').pop()?.toLowerCase() ?? '')) throw new AttachmentError('Choose PNG, JPEG, WebP, PDF or Word (.doc/.docx).');
    if (!file.data.length || file.data.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)) throw new AttachmentError('File could not be read. Remove it and select it again.');
    total += file.data.length / 4 * 3 - (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0);
  }
  if (total > MAX_ATTACHMENT_BYTES) throw new AttachmentError('Files exceed 3 MB total per message. Remove or replace a file, or send separately.', 413);
}
