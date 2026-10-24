import { createHash } from 'node:crypto';
import type { UserContent } from 'ai';
import { AttachmentError, formatAttachmentMessage, sanitizeAttachmentName, validateAttachmentRequest, type AttachmentRequest } from '../../shared/chat-attachments.js';

function matchesAttachmentSignature(bytes: Buffer, mediaType: string): boolean {
  switch (mediaType) {
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
    case 'image/jpeg': return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
    case 'image/webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    case 'application/pdf': return bytes.toString('ascii', 0, 5) === '%PDF-';
    case 'application/msword': return bytes.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
    default: return bytes.subarray(0, 4).equals(Buffer.from('504b0304', 'hex'));
  }
}

export function prepareChatAttachments(request: AttachmentRequest) {
  validateAttachmentRequest(request);
  const files = (request.attachments ?? []).map((file) => {
    const bytes = Buffer.from(file.data, 'base64');
    const matches = matchesAttachmentSignature(bytes, file.mediaType);
    if (!matches || bytes.toString('base64') !== file.data) throw new AttachmentError('File type or content is invalid. Remove it and select a valid copy.');
    return { ...file, name: sanitizeAttachmentName(file.name), bytes };
  });
  const visibleText = formatAttachmentMessage(request.message, files);
  const content: UserContent = [{ type: 'text', text: visibleText }, ...files.map((file) => file.mediaType.startsWith('image/')
    ? { type: 'image' as const, image: file.bytes, mediaType: file.mediaType }
    : { type: 'file' as const, data: file.bytes, mediaType: file.mediaType, filename: file.name })];
  // Preserve existing text-only fingerprints, while binding ordered validated file bytes.
  const fingerprintInput = `${request.id}\u0000${request.message}` + (files.length ? '\u0000' + JSON.stringify(files.map((file) => ({ name: file.name, mediaType: file.mediaType, hash: createHash('sha256').update(file.bytes).digest('hex') }))) : '');
  return { visibleText, content, fingerprint: createHash('sha256').update(fingerprintInput).digest('hex') };
}
