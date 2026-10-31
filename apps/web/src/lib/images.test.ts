import { describe, expect, it } from 'vitest';
import { jpegName, needsShrink, titleFromFileName } from './images';

const file = (type: string, size: number) => new File([new Uint8Array(size)], 'x', { type });

describe('images', () => {
  it('propose un titre lisible à partir du nom du fichier', () => {
    expect(titleFromFileName('ordonnance_otite-2026.pdf')).toBe('ordonnance otite 2026');
    expect(titleFromFileName('Scan.JPG')).toBe('Scan');
  });

  it('renomme le fichier converti en JPEG', () => {
    expect(jpegName('IMG_0042.HEIC')).toBe('IMG_0042.jpg');
  });

  it('ne réduit que les images lourdes ou dans un format refusé par le Worker', () => {
    expect(needsShrink(file('application/pdf', 5_000_000), 2_000_000)).toBe(false);
    expect(needsShrink(file('image/jpeg', 500_000), 2_000_000)).toBe(false);
    expect(needsShrink(file('image/jpeg', 3_000_000), 2_000_000)).toBe(true);
    expect(needsShrink(file('image/heic', 100), 2_000_000)).toBe(true);
  });
});
