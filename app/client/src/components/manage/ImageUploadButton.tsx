import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useLang } from '../LangProvider';
import { useToast } from '../Toast';

// Mirrors MAX_UPLOAD_BYTES in server/src/lib/images.ts. Checked here only so a
// huge file fails instantly instead of after a long upload.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

type UploadResult = { url: string; bytes: number; original_bytes: number };

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// File picker that uploads the chosen (or dropped) image to /api/otisak/images
// and hands back the short URL to store on the question. The server scales and
// re-encodes every image, so any photo or screenshot is accepted as-is.
export function ImageUploadButton({
  onUploaded,
  className,
  children,
}: {
  onUploaded: (url: string) => void;
  className: string;
  children: ReactNode;
}) {
  const { t } = useLang();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File | null | undefined) => {
    if (!file || uploading) return;
    // Some formats (HEIC on Chrome) arrive with an empty type; let the server
    // decide those instead of rejecting them here.
    if (file.type && !file.type.startsWith('image/')) { toast.error(t('questions.imageInvalidType')); return; }
    if (file.size > MAX_UPLOAD_BYTES) { toast.error(t('questions.imageTooBig')); return; }

    setUploading(true);
    try {
      const res = await fetch('/api/otisak/images', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': file.type || 'image/octet-stream' },
        body: file,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'UNSUPPORTED_IMAGE') toast.error(t('questions.imageUnsupported'));
        else if (data.code === 'IMAGE_TOO_MANY_PIXELS') toast.error(t('questions.imageTooManyPixels'));
        else if (res.status === 413) toast.error(t('questions.imageTooBig'));
        else toast.error(t('questions.imageUploadFailed'));
        return;
      }
      const result = data as UploadResult;
      onUploaded(result.url);
      // Only worth mentioning when the server visibly shrank it.
      if (result.original_bytes > result.bytes * 1.5 && result.original_bytes > 1024 * 1024) {
        toast.info(t('questions.imageCompressed', { from: formatSize(result.original_bytes), to: formatSize(result.bytes) }));
      }
    } catch {
      toast.error(t('questions.imageUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <label
      className={`${className} ${dragOver ? 'border-accent text-accent' : ''} ${uploading ? 'pointer-events-none opacity-70' : 'cursor-pointer'}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files?.[0]); }}
    >
      {uploading ? <><Loader2 size={14} className="animate-spin" />{t('questions.imageUploading')}</> : children}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }}
      />
    </label>
  );
}
