import { describe, expect, it } from 'vitest';
import { formatAttachmentMessage, validateAttachmentRequest, sanitizeAttachmentName, MAX_ATTACHMENT_BYTES } from './chat-attachments';
const pdf = { name: 'brief.pdf', mediaType: 'application/pdf', data: 'JVBERi0=' };
describe('attachment request contract', () => {
  it('keeps text unchanged and labels images without filenames', () => {
    expect(formatAttachmentMessage(' hello ', [])).toBe(' hello ');
    expect(formatAttachmentMessage('', [{ name: 'secret.png', mediaType: 'image/png' }, pdf])).toBe('Image attached\nbrief.pdf — PDF document');
  });
  it('bounds and flattens document basenames', () => {
    expect(sanitizeAttachmentName('../a\\bad\nname.docx')).toBe('badname.docx');
    expect(sanitizeAttachmentName('a'.repeat(300))).toHaveLength(120);
  });
  it('requires caption or files and guards actual serialized JSON bytes and history text', () => {
    expect(() => validateAttachmentRequest({ id: 'm', message: '', attachments: [] })).toThrow(/caption|file/i);
    expect(() => validateAttachmentRequest({ id: 'm', message: 'x', attachments: [{ ...pdf, data: 'a'.repeat(MAX_ATTACHMENT_BYTES * 2) }] })).toThrow(/large|MB/i);
    expect(() => validateAttachmentRequest({ id: 'm', message: 'x'.repeat(100001) })).toThrow(/separately|text/i);
  });
});
