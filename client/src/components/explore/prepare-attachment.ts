import { ATTACHMENT_TYPES, MAX_ATTACHMENT_BYTES, sanitizeAttachmentName, type AttachmentMediaType, type ChatAttachment } from '@shared/chat-attachments';

export interface DraftAttachment {
  id: string;
  file: File;
  attachment: ChatAttachment;
  optimized: boolean;
}

function readData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File could not be read. Remove it and choose a valid copy.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

async function optimizeImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image could not be prepared.');
    context.drawImage(bitmap, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.95));
    if (!blob || blob.size >= file.size) return file;
    const decoded = await createImageBitmap(blob);
    const valid = decoded.width === bitmap.width && decoded.height === bitmap.height;
    decoded.close();
    if (!valid) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + (blob.type === 'image/webp' ? '.webp' : '.png'), { type: blob.type });
  } finally { bitmap.close(); }
}

export async function prepareAttachment(file: File, remainingBytes: number): Promise<DraftAttachment> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mediaType = Object.entries(ATTACHMENT_TYPES).find(([type, extensions]) =>
    (extensions as readonly string[]).includes(extension) && (!file.type || file.type === type))?.[0] as AttachmentMediaType | undefined;
  if (!mediaType) throw new Error('Choose PNG, JPEG, WebP, PDF or Word (.doc/.docx).');
  if (!file.size) throw new Error('This file is empty. Choose a valid copy.');
  let prepared = file.type ? file : new File([file], file.name, { type: mediaType });
  if (prepared.size > remainingBytes && mediaType.startsWith('image/')) {
    try { prepared = await optimizeImage(prepared); } catch {}
  }
  if (prepared.size > remainingBytes || prepared.size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Files exceed 3 MB total per message. Remove or replace a file, crop the image, or send a smaller copy separately.');
  }
  return { id: crypto.randomUUID(), file: prepared, optimized: prepared !== file && prepared.size < file.size,
    attachment: { name: sanitizeAttachmentName(prepared.name), mediaType: prepared.type as AttachmentMediaType, data: await readData(prepared) } };
}
