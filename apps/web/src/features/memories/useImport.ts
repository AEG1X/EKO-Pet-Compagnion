import { useCallback, useRef, useState } from 'react';
import { errorMessage, uploadFile } from '../../lib/api';
import { prepareMedia, uploadMediaWithProgress } from './media';
import { checkExisting, createMemory, useRefreshMemories } from './queries';

export type ImportStatus = 'waiting' | 'preparing' | 'uploading' | 'done' | 'duplicate' | 'error';

export interface ImportItem {
  key: string;
  name: string;
  status: ImportStatus;
  progress: number;
  message?: string;
}

/**
 * Import multiple : chaque fichier est préparé (date, aperçu, empreinte), comparé aux souvenirs
 * existants pour ne pas l'importer deux fois, puis envoyé. Un fichier à la fois, pour ménager le réseau.
 */
export function useImport() {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [running, setRunning] = useState(false);
  const refresh = useRefreshMemories();
  const busy = useRef(false);

  const update = (key: string, patch: Partial<ImportItem>) =>
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const start = useCallback(
    async (files: File[]) => {
      if (busy.current || files.length === 0) return;
      busy.current = true;
      setRunning(true);
      const batch = files.map((file, i) => ({ key: `${Date.now()}-${i}`, file }));
      setItems(batch.map(({ key, file }) => ({ key, name: file.name, status: 'waiting', progress: 0 })));
      let added = 0;
      for (const { key, file } of batch) {
        try {
          update(key, { status: 'preparing' });
          const media = await prepareMedia(file);
          const { existing } = await checkExisting([media.hash]);
          if (existing.includes(media.hash)) {
            update(key, { status: 'duplicate', progress: 1 });
            continue;
          }
          update(key, { status: 'uploading' });
          const original = await uploadMediaWithProgress(file, (ratio) => update(key, { progress: ratio * 0.95 }));
          const preview = media.preview ? await uploadFile(media.preview, 'apercu.jpg').catch(() => null) : null;
          await createMemory({
            fileId: original.id,
            previewFileId: preview?.id ?? null,
            contentHash: media.hash,
            takenDate: media.takenDate,
            takenTime: media.takenTime,
            dateSource: media.dateSource,
            width: media.width,
            height: media.height,
            durationSeconds: media.durationSeconds,
          });
          added += 1;
          update(key, { status: 'done', progress: 1 });
          // Les souvenirs apparaissent au fil de l'import.
          if (added % 5 === 1) void refresh();
        } catch (error) {
          update(key, { status: 'error', message: errorMessage(error) });
        }
      }
      await refresh();
      busy.current = false;
      setRunning(false);
    },
    [refresh],
  );

  const clear = useCallback(() => setItems([]), []);
  return { items, running, start, clear };
}
