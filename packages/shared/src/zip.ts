/**
 * Écriture d'archives ZIP sans compression (méthode « stored ») : les photos et vidéos sont déjà
 * compressées, et l'original doit ressortir à l'identique. Seuls les en-têtes sont produits ici ;
 * le navigateur assemble l'archive (en-têtes + fichiers) sans jamais la recompresser.
 * Pas de ZIP64 : chaque archive reste sous 4 Go (voir EXPORT_PART_BYTES).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 incrémental : `crc32(b, crc32(a))` = CRC de a puis b. Partir de 0. */
export function crc32(bytes: Uint8Array, previous = 0): number {
  let crc = ~previous >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return ~crc >>> 0;
}

export interface ZipEntry {
  path: string;
  size: number;
  crc: number;
  /** Date de modification affichée par l'explorateur de fichiers. */
  date: Date;
}

/** Encodage UTF-8 (le paquet partagé n'utilise pas les API du navigateur). */
export function utf8(value: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const ch of value) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return new Uint8Array(bytes);
}
export const ZIP_MAX_BYTES = 0xffffffff;

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** En-tête local d'un fichier, à placer juste avant son contenu. */
export function zipLocalHeader(entry: ZipEntry): Uint8Array<ArrayBuffer> {
  const name = utf8(entry.path);
  const out = new Uint8Array(30 + name.length);
  const v = new DataView(out.buffer);
  const { time, day } = dosDateTime(entry.date);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true); // version 2.0
  v.setUint16(6, 0x0800, true); // noms en UTF-8
  v.setUint16(8, 0, true); // stocké
  v.setUint16(10, time, true);
  v.setUint16(12, day, true);
  v.setUint32(14, entry.crc, true);
  v.setUint32(18, entry.size, true);
  v.setUint32(22, entry.size, true);
  v.setUint16(26, name.length, true);
  v.setUint16(28, 0, true);
  out.set(name, 30);
  return out;
}

/** Répertoire central et fin d'archive, à placer après tous les fichiers. `offsets[i]` : position de l'en-tête local i. */
export function zipCentralDirectory(entries: ZipEntry[], offsets: number[]): Uint8Array<ArrayBuffer> {
  const names = entries.map((e) => utf8(e.path));
  const centralSize = names.reduce((sum, n) => sum + 46 + n.length, 0);
  const out = new Uint8Array(centralSize + 22);
  const v = new DataView(out.buffer);
  let p = 0;
  entries.forEach((entry, i) => {
    const name = names[i]!;
    const { time, day } = dosDateTime(entry.date);
    v.setUint32(p, 0x02014b50, true);
    v.setUint16(p + 4, 20, true);
    v.setUint16(p + 6, 20, true);
    v.setUint16(p + 8, 0x0800, true);
    v.setUint16(p + 10, 0, true);
    v.setUint16(p + 12, time, true);
    v.setUint16(p + 14, day, true);
    v.setUint32(p + 16, entry.crc, true);
    v.setUint32(p + 20, entry.size, true);
    v.setUint32(p + 24, entry.size, true);
    v.setUint16(p + 28, name.length, true);
    // extra, commentaire, disque, attributs internes : 0
    v.setUint32(p + 38, 0, true);
    v.setUint32(p + 42, offsets[i]!, true);
    out.set(name, p + 46);
    p += 46 + name.length;
  });
  const centralOffset = offsets.length ? offsets[offsets.length - 1]! + 30 + names[names.length - 1]!.length + entries[entries.length - 1]!.size : 0;
  v.setUint32(p, 0x06054b50, true);
  v.setUint16(p + 8, entries.length, true);
  v.setUint16(p + 10, entries.length, true);
  v.setUint32(p + 12, centralSize, true);
  v.setUint32(p + 16, centralOffset, true);
  return out;
}

/** Archive complète en mémoire (petits fichiers : manifeste, tests). */
export function zipSync(files: { path: string; data: Uint8Array; date?: Date }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  const offsets: number[] = [];
  let offset = 0;
  for (const f of files) {
    const entry = { path: f.path, size: f.data.byteLength, crc: crc32(f.data), date: f.date ?? new Date() };
    const header = zipLocalHeader(entry);
    entries.push(entry);
    offsets.push(offset);
    parts.push(header, f.data);
    offset += header.byteLength + f.data.byteLength;
  }
  parts.push(zipCentralDirectory(entries, offsets));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.byteLength;
  }
  return out;
}
