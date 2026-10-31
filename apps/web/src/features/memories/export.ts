import { type Album, type Memory, type ZipEntry, crc32, exportPath, splitIntoParts, zipCentralDirectory, zipLocalHeader } from '@eko/shared';
import { ApiError } from '../../lib/api';

/**
 * Export des souvenirs en archives ZIP, assemblées dans le navigateur : originaux intacts (aucune
 * recompression), classés par année et par mois, avec un fichier souvenirs.json (dates, légendes, albums).
 * Le Worker ne fait que servir les fichiers : l'export ne coûte rien côté cloud au-delà des lectures R2.
 */

export interface ExportProgress {
  part: number;
  parts: number;
  done: number;
  total: number;
}

async function crcOf(blob: Blob): Promise<number> {
  let crc = 0;
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return crc;
    crc = crc32(value, crc);
  }
}

function localDate(memory: Memory): Date {
  const [y, m, d] = memory.takenDate.split('-').map(Number);
  const [h, min] = (memory.takenTime ?? '12:00').split(':').map(Number);
  return new Date(y!, m! - 1, d!, h, min);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Laisse au navigateur le temps de démarrer l'enregistrement.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Nom d'archive sûr : « eko-souvenirs-2026.zip », « eko-album-vacances-1-sur-2.zip ». */
export function archiveName(label: string, part: number, parts: number): string {
  const slug = label
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `eko-${slug || 'souvenirs'}${parts > 1 ? `-${part}-sur-${parts}` : ''}.zip`;
}

export async function exportMemories(
  memories: Memory[],
  albums: Album[],
  label: string,
  onProgress: (p: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<number> {
  const albumNames = new Map(albums.map((a) => [a.id, a.name]));
  const parts = splitIntoParts(memories);
  let done = 0;
  for (const [i, part] of parts.entries()) {
    const chunks: BlobPart[] = [];
    const entries: ZipEntry[] = [];
    const offsets: number[] = [];
    let offset = 0;
    const add = (entry: ZipEntry, data: Blob) => {
      const header = zipLocalHeader(entry);
      entries.push(entry);
      offsets.push(offset);
      chunks.push(header, data);
      offset += header.byteLength + entry.size;
    };
    const manifest = [];
    for (const memory of part) {
      onProgress({ part: i + 1, parts: parts.length, done, total: memories.length });
      const res = await fetch(memory.url, { credentials: 'same-origin', signal });
      if (!res.ok) throw new ApiError(res.status, 'export_failed', `Impossible de récupérer un fichier (${memory.name ?? memory.takenDate}). Réessaie.`);
      const blob = await res.blob();
      const path = exportPath(memory);
      add({ path, size: blob.size, crc: await crcOf(blob), date: localDate(memory) }, blob);
      manifest.push({
        fichier: path,
        nomOrigine: memory.name,
        date: memory.takenDate,
        heure: memory.takenTime,
        sourceDeLaDate: memory.dateSource,
        legende: memory.caption,
        favori: memory.favorite,
        albums: memory.albumIds.map((id) => albumNames.get(id)).filter(Boolean),
      });
      done += 1;
    }
    const json = new TextEncoder().encode(`${JSON.stringify({ exportéLe: new Date().toISOString(), souvenirs: manifest }, null, 2)}\n`);
    add({ path: 'souvenirs.json', size: json.byteLength, crc: crc32(json), date: new Date() }, new Blob([json]));
    chunks.push(zipCentralDirectory(entries, offsets));
    download(new Blob(chunks, { type: 'application/zip' }), archiveName(label, i + 1, parts.length));
  }
  onProgress({ part: parts.length, parts: parts.length, done, total: memories.length });
  return parts.length;
}
