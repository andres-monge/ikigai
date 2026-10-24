// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareAttachment } from './prepare-attachment';

afterEach(() => vi.restoreAllMocks());
describe('browser attachment preparation', () => {
  it('leaves fitting files unchanged and reads their exact bytes', async () => {
    const file = new File(['%PDF-exact'], 'brief.pdf', { type: 'application/pdf' });
    const result = await prepareAttachment(file, 1000);
    expect(result.file).toBe(file);
    expect(result.attachment.data).toBe(btoa('%PDF-exact'));
    expect(result.optimized).toBe(false);
  });
  it('rejects documents above remaining budget without re-encoding', async () => {
    await expect(prepareAttachment(new File(['%PDF-contents'], 'brief.pdf', { type: 'application/pdf' }), 5)).rejects.toThrow(/3 MB/);
  });
  it('performs one encoding at unchanged dimensions and keeps only a smaller decodable result', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 400, height: 200, close })));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
      expect(this.width).toBe(400); expect(this.height).toBe(200);
      callback(new Blob(['small'], { type: 'image/webp' }));
    });
    const file = new File([new Uint8Array(100)], 'original.png', { type: 'image/png' });
    const result = await prepareAttachment(file, 50);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(result.optimized).toBe(true);
    expect(result.attachment).toMatchObject({ name: 'original.webp', mediaType: 'image/webp', data: btoa('small') });
    expect(close).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
