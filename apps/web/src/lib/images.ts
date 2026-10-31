/**
 * Réduction des images dans le navigateur, avant l'envoi : le Worker gratuit n'a pas le temps
 * de calcul nécessaire, et une photo de téléphone de 5 Mo n'a pas besoin de cette taille.
 * Convertit aussi les formats que le Worker refuse mais que le navigateur sait lire (HEIC sur iPhone).
 */
export async function shrinkImage(file: File, maxSide: number, quality = 0.85): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Image illisible par ce navigateur.');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image illisible par ce navigateur.');
  // Fond blanc : une image PNG transparente convertie en JPEG ne devient pas noire.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Conversion de l’image impossible.');
  return blob;
}

/** Une image doit-elle être réduite ou convertie avant l'envoi ? */
export function needsShrink(file: File, maxBytes: number): boolean {
  if (!file.type.startsWith('image/')) return false;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return true;
  return file.size > maxBytes;
}

/** « ordonnance_otite.pdf » → « ordonnance otite » : titre proposé à partir du nom du fichier. */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Nom du fichier envoyé après conversion en JPEG. */
export function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/, '')}.jpg`;
}
