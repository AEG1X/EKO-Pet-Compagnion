import type { Dog } from '@eko/shared';
import { type ChangeEvent, useRef, useState } from 'react';
import { Icon, Paw } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { jpegName, shrinkImage } from '../../lib/images';
import { useSetDogPhoto } from '../documents/queries';

/** Côté maximal de la photo du profil : assez pour un écran Retina, léger à charger. */
const PHOTO_MAX_SIDE = 1200;

/** Photo ronde du chien, ou une patte à défaut. */
export function DogAvatar({ dog, size = 88 }: { dog: Pick<Dog, 'name' | 'photoUrl'>; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {dog.photoUrl ? <img src={dog.photoUrl} alt={`Photo de profil : ${dog.name}`} /> : <Paw size={size * 0.5} />}
    </span>
  );
}

/**
 * Ajout ou remplacement de la photo : l'image est réduite et réencodée en JPEG dans le navigateur,
 * ce qui retire aussi ses métadonnées (position GPS, appareil).
 */
export function DogPhotoControls({ dog }: { dog: Dog }) {
  const setPhoto = useSetDogPhoto();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setPreparing(true);
    let blob: Blob;
    try {
      blob = await shrinkImage(file, PHOTO_MAX_SIDE);
    } catch {
      setError('Image illisible : choisis une photo JPEG, PNG ou HEIC.');
      return;
    } finally {
      setPreparing(false);
    }
    setPhoto.mutate({ file: blob, name: jpegName(file.name) });
  }

  const busy = preparing || setPhoto.isPending;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input ref={input} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={pick} />
        <button type="button" className="btn btn-secondary hero-btn" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="camera" size={18} /> {busy ? 'Envoi…' : dog.photoUrl ? 'Changer la photo' : 'Ajouter une photo'}
        </button>
        {dog.photoUrl && (
          <button
            type="button"
            className="btn btn-ghost hero-btn"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Retirer la photo du profil ?')) setPhoto.mutate(null);
            }}
          >
            Retirer
          </button>
        )}
      </div>
      {(error || setPhoto.isError) && (
        <p className="alert" role="alert">
          {error ?? errorMessage(setPhoto.error)}
        </p>
      )}
    </div>
  );
}
