/** Encodeur CBOR minimal (entiers, octets, textes, tableaux, objets) pour simuler un authentificateur. */
type CborValue = number | string | Uint8Array | CborValue[] | Map<number | string, CborValue>;

function header(major: number, length: number): number[] {
  const m = major << 5;
  if (length < 24) return [m | length];
  if (length < 0x100) return [m | 24, length];
  if (length < 0x10000) return [m | 25, length >> 8, length & 0xff];
  return [m | 26, (length >>> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff];
}

export function encodeCbor(value: CborValue): Uint8Array {
  const out: number[] = [];
  const write = (v: CborValue) => {
    if (typeof v === 'number') {
      out.push(...(v >= 0 ? header(0, v) : header(1, -1 - v)));
    } else if (typeof v === 'string') {
      const bytes = new TextEncoder().encode(v);
      out.push(...header(3, bytes.length), ...bytes);
    } else if (v instanceof Uint8Array) {
      out.push(...header(2, v.length), ...v);
    } else if (Array.isArray(v)) {
      out.push(...header(4, v.length));
      v.forEach(write);
    } else {
      out.push(...header(5, v.size));
      for (const [k, item] of v) {
        write(k);
        write(item);
      }
    }
  };
  write(value);
  return new Uint8Array(out);
}
