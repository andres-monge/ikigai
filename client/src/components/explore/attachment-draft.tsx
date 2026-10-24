import { formatAttachmentMessage } from '@shared/chat-attachments';
import { useEffect, useState } from 'react';
import type { DraftAttachment } from './prepare-attachment';

function AttachmentPreview({ item }: { item: DraftAttachment }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!item.attachment.mediaType.startsWith('image/')) return;
    const value = URL.createObjectURL(item.file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [item]);
  return url ? <img src={url} alt="Attached image preview" className="h-20 max-w-40 object-contain" /> : null;
}

export function AttachmentDraft({ files, onRemove }: { files: readonly DraftAttachment[]; onRemove: (id: string) => void }) {
  return <ul aria-label="Attached files" className="flex flex-wrap gap-2">
    {files.map((item) => <li key={item.id} className="max-w-full border border-stone-400 bg-white p-2 text-xs">
      <AttachmentPreview item={item} />
      <span className="break-all">{formatAttachmentMessage('', [item.attachment])}</span>
      {item.optimized ? <span className="ml-2">Image optimized</span> : null}
      <button type="button" aria-label={`Remove ${item.attachment.name}`} onClick={() => onRemove(item.id)} className="ml-2 min-h-9 px-2 underline">Remove</button>
    </li>)}
  </ul>;
}
