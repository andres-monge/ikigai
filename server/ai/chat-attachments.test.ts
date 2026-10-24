import { describe, expect, it } from 'vitest';
import { prepareChatAttachments } from './chat-attachments';
const formats = [
  ['image/png', 'png', '89504e470d0a1a0a'], ['image/jpeg', 'jpg', 'ffd8ff'],
  ['image/webp', 'webp', '524946460000000057454250'], ['application/pdf', 'pdf', '255044462d'],
  ['application/msword', 'doc', 'd0cf11e0a1b11ae1'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', '504b0304'],
] as const;
describe('request-scoped provider attachments', () => {
  it.each(formats)('passes %s bytes and stable visible text', (mediaType, extension, hex) => {
    const bytes = Buffer.from(hex, 'hex');
    const result = prepareChatAttachments({ id: 'm', message: '', attachments: [{ name: `a.${extension}`, mediaType, data: bytes.toString('base64') }] });
    expect(result.content[0]).toEqual({ type: 'text', text: result.visibleText });
    expect(result.content[1]).toMatchObject(mediaType.startsWith('image/') ? { type: 'image', image: bytes } : { type: 'file', data: bytes, filename: `a.${extension}` });
  });
  it('fingerprints bytes even when caption and labels are identical', () => {
    const request = { id: 'm', message: 'question', attachments: [{ name: 'a.pdf', mediaType: 'application/pdf' as const, data: Buffer.from('%PDF-one').toString('base64') }] };
    const first = prepareChatAttachments(request);
    expect(prepareChatAttachments(request).fingerprint).toBe(first.fingerprint);
    request.attachments[0].data = Buffer.from('%PDF-two').toString('base64');
    expect(prepareChatAttachments(request).fingerprint).not.toBe(first.fingerprint);
  });
  it('rejects mismatched signatures and noncanonical base64', () => {
    expect(() => prepareChatAttachments({ id: 'm', message: '', attachments: [{ name: 'a.pdf', mediaType: 'application/pdf', data: Buffer.from('fake').toString('base64') }] })).toThrow(/invalid/);
  });
  it('admits exactly 3 MB and rejects an over-limit decoded aggregate', () => {
    const data = Buffer.alloc(3_000_000); data.write('%PDF-');
    const file = { name: 'a.pdf', mediaType: 'application/pdf' as const, data: data.toString('base64') };
    expect(prepareChatAttachments({ id: 'm', message: '', attachments: [file] }).visibleText).toBe('a.pdf — PDF document');
    expect(() => prepareChatAttachments({ id: 'm', message: '', attachments: [file, { ...file, data: Buffer.from('%PDF-x').toString('base64') }] })).toThrow(/3 MB/);
  });
});

it('rejects noncanonical base64 even with a valid file signature', () => {
  expect(() => prepareChatAttachments({ id: 'm', message: '', attachments: [{ name: 'a.pdf', mediaType: 'application/pdf', data: 'JVBERi1=' }] })).toThrow(/invalid/);
});
