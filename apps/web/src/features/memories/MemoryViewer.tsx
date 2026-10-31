import { type Album, DATE_SOURCE_LABELS, type Memory, formatDuration } from '@eko/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { useAlbumCover, useAlbumMembers, useAlbums, useDeleteMemory, useUpdateMemory } from './queries';

// ---------------------------------------------------------------- Vignettes

export function Tile({ memory, onOpen }: { memory: Memory; onOpen: () => void }) {
  const label = `${memory.kind === 'video' ? 'Vidéo' : 'Photo'} du ${formatDate(memory.takenDate)}${memory.caption ? ` : ${memory.caption}` : ''}`;
  return (
    <button type="button" className="tile" onClick={onOpen} aria-label={label}>
      {memory.previewUrl ? (
        <img src={memory.previewUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="tile-empty">
          <Icon name={memory.kind === 'video' ? 'play' : 'image'} />
          <span>{memory.contentType.split('/')[1]?.toUpperCase()}</span>
        </span>
      )}
      {memory.kind === 'video' && (
        <span className="tile-badge">
          <Icon name="play" size={12} />
          {memory.durationSeconds !== null && formatDuration(memory.durationSeconds)}
        </span>
      )}
      {memory.favorite && (
        <span className="tile-fav" aria-hidden="true">
          <Icon name="star" size={14} />
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------- Visionneuse

export function Viewer({
  list,
  index,
  onIndex,
  onClose,
  album,
}: {
  list: Memory[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** Ouvert depuis un album : propose d'en faire la couverture ou de l'en retirer. */
  album?: Album;
}) {
  const memory = list[index]!;
  const update = useUpdateMemory();
  const remove = useDeleteMemory();
  const albums = useAlbums();
  const members = useAlbumMembers();
  const cover = useAlbumCover();
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({ caption: '', takenDate: '', takenTime: '' });
  const [broken, setBroken] = useState(false);

  // Réinitialisé seulement en changeant de souvenir : un clic sur « favori » ne perd pas la saisie en cours.
  useEffect(() => {
    setForm({ caption: memory.caption ?? '', takenDate: memory.takenDate, takenTime: memory.takenTime ?? '' });
    setBroken(false);
  }, [memory.id]);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < list.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, list.length, onIndex]);

  function save(e: FormEvent) {
    e.preventDefault();
    update.mutate({
      id: memory.id,
      input: { caption: form.caption, takenDate: form.takenDate, takenTime: form.takenTime || null, favorite: memory.favorite },
    });
  }

  const toggleFavorite = () =>
    update.mutate({
      id: memory.id,
      input: { caption: memory.caption, takenDate: memory.takenDate, takenTime: memory.takenTime, favorite: !memory.favorite },
    });

  return (
    <dialog ref={dialog} className="viewer" onClose={onClose} aria-label="Souvenir">
      <div className="viewer-bar">
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => dialog.current?.close()}>
          <Icon name="close" />
        </button>
        <span className="viewer-count">
          {index + 1} / {list.length}
        </span>
        <button
          type="button"
          className={memory.favorite ? 'icon-btn is-fav' : 'icon-btn'}
          aria-pressed={memory.favorite}
          aria-label={memory.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          onClick={toggleFavorite}
        >
          <Icon name="star" />
        </button>
      </div>

      <div className="viewer-media">
        {index > 0 && (
          <button type="button" className="viewer-nav viewer-prev" aria-label="Souvenir précédent" onClick={() => onIndex(index - 1)}>
            <Icon name="back" />
          </button>
        )}
        {memory.kind === 'video' ? (
          <video key={memory.id} src={memory.url} poster={memory.previewUrl ?? undefined} controls playsInline preload="metadata" />
        ) : broken ? (
          <div className="viewer-fallback">
            {memory.previewUrl && <img src={memory.previewUrl} alt="" />}
            <p className="hint">Ce navigateur ne sait pas afficher l’original ({memory.contentType}). Télécharge-le pour le voir en grand.</p>
          </div>
        ) : (
          <img key={memory.id} src={memory.url} alt={memory.caption ?? ''} onError={() => setBroken(true)} />
        )}
        {index < list.length - 1 && (
          <button type="button" className="viewer-nav viewer-next" aria-label="Souvenir suivant" onClick={() => onIndex(index + 1)}>
            <Icon name="chevron" />
          </button>
        )}
      </div>

      <form className="viewer-info" onSubmit={save}>
        <p className="hint">
          {formatDate(memory.takenDate)}
          {memory.takenTime && ` à ${memory.takenTime.replace(':', ' h ')}`} · {DATE_SOURCE_LABELS[memory.dateSource]}
        </p>
        <div className="field">
          <label htmlFor="memory-caption">Légende</label>
          <textarea
            id="memory-caption"
            className="input"
            rows={2}
            maxLength={500}
            placeholder="Premier bain, première neige…"
            value={form.caption}
            onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
          />
        </div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="memory-date">Date</label>
            <input id="memory-date" className="input" type="date" required value={form.takenDate} onChange={(e) => setForm((f) => ({ ...f, takenDate: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="memory-time">Heure</label>
            <input id="memory-time" className="input" type="time" value={form.takenTime} onChange={(e) => setForm((f) => ({ ...f, takenTime: e.target.value }))} />
          </div>
        </div>
        {(albums.data?.length ?? 0) > 0 && (
          <fieldset className="viewer-albums">
            <legend>Albums</legend>
            <div className="chips">
              {albums.data!.map((a) => {
                const inside = memory.albumIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="chip"
                    aria-pressed={inside}
                    disabled={members.isPending}
                    onClick={() => members.mutate({ id: a.id, ...(inside ? { remove: [memory.id] } : { add: [memory.id] }) })}
                  >
                    {inside && <Icon name="check" size={14} />} {a.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {album && memory.previewUrl && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={cover.isPending || album.coverMemoryId === memory.id}
            onClick={() => cover.mutate({ id: album.id, memoryId: memory.id })}
          >
            <Icon name="image" size={18} /> {album.coverMemoryId === memory.id ? 'Couverture de l’album' : 'Choisir comme couverture'}
          </button>
        )}
        {(update.isError || remove.isError || members.isError || cover.isError) && (
          <p className="alert" role="alert">
            {errorMessage(update.error ?? remove.error ?? members.error ?? cover.error)}
          </p>
        )}
        <div className="form-actions" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Supprimer ce souvenir ? L’original sera effacé définitivement d’EKO (pense à le garder ailleurs si besoin).')) {
                remove.mutate(memory.id, {
                  onSuccess: () => {
                    if (list.length <= 1) dialog.current?.close();
                    else if (index >= list.length - 1) onIndex(index - 1);
                  },
                });
              }
            }}
          >
            <Icon name="trash" size={18} /> Supprimer
          </button>
          <a className="btn btn-secondary" href={`${memory.url}?download=1`}>
            <Icon name="download" size={18} /> Original
          </a>
          <button className="btn btn-primary" disabled={update.isPending}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
