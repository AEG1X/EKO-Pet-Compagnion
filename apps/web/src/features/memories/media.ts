import type { DateSource, StoredFile } from '@eko/shared';
import { ApiError } from '../../lib/api';

/**
 * Préparation des souvenirs dans le navigateur : date de prise de vue, aperçu léger,
 * dimensions et empreinte. L'original part tel quel, sans recompression.
 */

const DATE_PATTERN = /(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function plausible(year: number) {
  return year >= 1990 && year <= new Date().getFullYear() + 1;
}

/**
 * Date EXIF d'une photo (JPEG, HEIC) : on cherche les dates « AAAA:MM:JJ HH:MM:SS » des métadonnées
 * et on retient la plus ancienne (prise de vue, avant une éventuelle retouche).
 */
export function exifDateFromBytes(bytes: Uint8Array): { date: string; time: string } | null {
  let text = '';
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]!);
  let best: string | null = null;
  for (const m of text.matchAll(DATE_PATTERN)) {
    const [, y, mo, d, h, mi] = m;
    if (!plausible(Number(y)) || Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) continue;
    const iso = `${y}-${mo}-${d}T${h}:${mi}`;
    if (!best || iso < best) best = iso;
  }
  return best ? { date: best.slice(0, 10), time: best.slice(11, 16) } : null;
}

/** Boîte « mvhd » d'une vidéo MP4 / MOV : date d'enregistrement (UTC) et durée. */
export function mvhdFromBytes(bytes: Uint8Array): { created: Date | null; durationSeconds: number | null } | null {
  for (let i = 4; i < bytes.length - 32; i++) {
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue; // « mvhd »
    const view = new DataView(bytes.buffer, bytes.byteOffset + i + 4);
    const version = view.getUint8(0);
    let created: number;
    let timescale: number;
    let duration: number;
    if (version === 1) {
      if (i + 4 + 32 > bytes.length) return null;
      created = Number(view.getBigUint64(4));
      timescale = view.getUint32(20);
      duration = Number(view.getBigUint64(24));
    } else {
      created = view.getUint32(4);
      timescale = view.getUint32(12);
      duration = view.getUint32(16);
    }
    // Secondes depuis le 1er janvier 1904.
    const date = created > 0 ? new Date((created - 2_082_844_800) * 1000) : null;
    return {
      created: date && plausible(date.getUTCFullYear()) ? date : null,
      durationSeconds: timescale > 0 ? Math.round(duration / timescale) : null,
    };
  }
  return null;
}

async function readSlice(file: Blob, start: number, end: number) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

export interface PreparedMedia {
  file: File;
  kind: 'photo' | 'video';
  hash: string;
  takenDate: string;
  takenTime: string | null;
  dateSource: DateSource;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  preview: Blob | null;
}

function localDate(d: Date) {
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

async function sha256Hex(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PREVIEW_SIDE = 640;

function canvasToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob | null> {
  const scale = Math.min(1, PREVIEW_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
}

async function photoPreview(file: File) {
  try {
    // Le navigateur applique l'orientation EXIF ; HEIC n'est lisible que par Safari.
    const bitmap = await createImageBitmap(file);
    const preview = await canvasToJpeg(bitmap, bitmap.width, bitmap.height);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return { preview, ...size };
  } catch {
    return { preview: null, width: null, height: null };
  }
}

function videoPreview(file: File): Promise<{ preview: Blob | null; width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (result: { preview: Blob | null; width: number | null; height: number | null; duration: number | null }) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };
    const fail = () => done({ preview: null, width: null, height: null, duration: null });
    const timer = setTimeout(fail, 15_000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => {
      clearTimeout(timer);
      fail();
    });
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    });
    video.addEventListener('seeked', async () => {
      clearTimeout(timer);
      const preview = video.videoWidth ? await canvasToJpeg(video, video.videoWidth, video.videoHeight) : null;
      done({
        preview,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
      });
    });
    video.src = url;
  });
}

/** Tout ce qu'il faut savoir d'un fichier avant de l'envoyer. */
export async function prepareMedia(file: File): Promise<PreparedMedia> {
  const isVideo = file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name);
  const fallback = localDate(new Date(file.lastModified || Date.now()));
  const hash = await sha256Hex(file);

  if (isVideo) {
    // « moov » est au début ou à la fin du fichier selon l'appareil.
    const head = await readSlice(file, 0, 4_000_000);
    const tail = file.size > 4_000_000 ? await readSlice(file, Math.max(0, file.size - 4_000_000), file.size) : new Uint8Array();
    const meta = mvhdFromBytes(head) ?? mvhdFromBytes(tail);
    const visual = await videoPreview(file);
    const when = meta?.created ? localDate(meta.created) : null;
    return {
      file,
      kind: 'video',
      hash,
      takenDate: when?.date ?? fallback.date,
      takenTime: when?.time ?? fallback.time,
      dateSource: when ? 'video' : 'file',
      width: visual.width,
      height: visual.height,
      durationSeconds: meta?.durationSeconds ?? visual.duration,
      preview: visual.preview,
    };
  }

  const exif = exifDateFromBytes(await readSlice(file, 0, 512_000));
  const visual = await photoPreview(file);
  return {
    file,
    kind: 'photo',
    hash,
    takenDate: exif?.date ?? fallback.date,
    takenTime: exif?.time ?? fallback.time,
    dateSource: exif ? 'exif' : 'file',
    width: visual.width,
    height: visual.height,
    durationSeconds: null,
    preview: visual.preview,
  };
}

/** Envoi de l'original avec suivi de progression (fetch ne le permet pas encore partout). */
export function uploadMediaWithProgress(file: File, onProgress: (ratio: number) => void): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', '/api/media');
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      let data: { error?: string; message?: string } & Partial<StoredFile> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Réponse non JSON : message générique.
      }
      if (xhr.status === 201) resolve(data as StoredFile);
      else reject(new ApiError(xhr.status, data.error ?? 'http_error', data.message ?? 'Envoi impossible. Réessaie.'));
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'network', 'Connexion perdue pendant l’envoi. Réessaie.')));
    xhr.send(file);
  });
}
