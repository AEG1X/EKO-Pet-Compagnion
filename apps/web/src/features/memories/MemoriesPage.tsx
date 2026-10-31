import { DATE_SOURCE_LABELS, type Memory, formatDuration, groupByMonth } from '@eko/shared';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Page, QueryError, Section } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDate, formatMonthYear } from '../../lib/dates';
import { StorageMeter } from '../documents/DocumentsPage';
import { useStorage } from '../documents/queries';
import { useDog } from '../profile/queries';
import { useDeleteMemory, useMemories, useUpdateMemory } from './queries';
import { type ImportItem, useImport } from './useImport';

const STATUS_LABELS: Record<ImportItem['status'], string> = {
  waiting: 'En attente',
  preparing: 'Préparation…',
  uploading: 'Envoi',
  done: 'Ajouté',
  duplicate: 'Déjà dans la galerie',
  error: 'Échec',
};

// ---------------------------------------------------------------- Import

function ImportPanel({ items, running, onClear }: { items: ImportItem[]; running: boolean; onClear: () => void }) {
  if (items.length === 0) return null;
  const finished = items.filter((i) => ['done', 'duplicate', 'error'].includes(i.status)).length;
  const added = items.filter((i) => i.status === 'done').length;
  const duplicates = items.filter((i) => i.status === 'duplicate').length;
  const errors = items.filter((i) => i.status === 'error').length;
  return (
    <Section
      title={running ? `Import en cours (${finished}/${items.length})` : 'Import terminé'}
      action={
        !running && (
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Fermer
          </button>
        )
      }
    >
      {!running && (
        <p role="status">
          {added} ajouté{added > 1 ? 's' : ''}
          {duplicates > 0 && `, ${duplicates} déjà présent${duplicates > 1 ? 's' : ''}`}
          {errors > 0 && `, ${errors} en échec`}.
        </p>
      )}
      <ul className="import-list">
        {items.map((item) => (
          <li key={item.key} className={`import-item import-${item.status}`}>
            <span className="import-name">{item.name}</span>
            <span className="hint">
              {STATUS_LABELS[item.status]}
              {item.status === 'uploading' && ` ${Math.round(item.progress * 100)} %`}
              {item.message && ` : ${item.message}`}
            </span>
            {(item.status === 'uploading' || item.status === 'preparing') && (
              <span className="meter" aria-hidden="true">
                <span className="meter-fill" style={{ width: `${Math.max(item.progress * 100, 2)}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---------------------------------------------------------------- Vignettes

function Tile({ memory, onOpen }: { memory: Memory; onOpen: () => void }) {
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

function Viewer({ list, index, onIndex, onClose }: { list: Memory[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const memory = list[index]!;
  const update = useUpdateMemory();
  const remove = useDeleteMemory();
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
        {(update.isError || remove.isError) && (
          <p className="alert" role="alert">
            {errorMessage(update.error ?? remove.error)}
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

// ---------------------------------------------------------------- Page

export function MemoriesPage() {
  const dog = useDog();
  const hasDog = dog.isSuccess && Boolean(dog.data);
  const memories = useMemories(hasDog);
  const storage = useStorage();
  const importer = useImport();
  const input = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState<string | null>(null);
  const [favorites, setFavorites] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const all = memories.data ?? [];
  const years = useMemo(() => [...new Set(all.map((m) => m.takenDate.slice(0, 4)))], [all]);
  const visible = useMemo(
    () => all.filter((m) => (!year || m.takenDate.startsWith(year)) && (!favorites || m.favorite)),
    [all, year, favorites],
  );
  const groups = useMemo(() => groupByMonth(visible), [visible]);
  // Ordre d'affichage (par mois), pour naviguer dans la visionneuse.
  const ordered = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  return (
    <Page title="Souvenirs" needsDog={dog.isSuccess && !dog.data}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary" disabled={importer.running} onClick={() => input.current?.click()}>
          <Icon name="plus" size={18} /> Ajouter des photos et vidéos
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void importer.start(files);
          }}
        />
      </div>

      <ImportPanel items={importer.items} running={importer.running} onClear={importer.clear} />
      <QueryError error={memories.error} />

      {all.length > 0 && (
        <div className="chips" role="group" aria-label="Filtrer les souvenirs">
          <button type="button" className="chip" aria-pressed={year === null && !favorites} onClick={() => { setYear(null); setFavorites(false); }}>
            Tous
          </button>
          {years.map((y) => (
            <button key={y} type="button" className="chip" aria-pressed={year === y} onClick={() => setYear(year === y ? null : y)}>
              {y}
            </button>
          ))}
          <button type="button" className="chip" aria-pressed={favorites} onClick={() => setFavorites((f) => !f)}>
            <Icon name="star" size={14} /> Favoris
          </button>
        </div>
      )}

      {memories.isSuccess && all.length === 0 && importer.items.length === 0 && (
        <section className="card empty-state">
          <Icon name="image" size={32} />
          <p>
            <strong>Aucun souvenir pour l’instant.</strong>
          </p>
          <p className="hint">
            Ajoute plusieurs photos et vidéos d’un coup : EKO les classe par mois grâce à leur date de prise de vue, garde les originaux
            intacts et ignore les doublons.
          </p>
        </section>
      )}
      {memories.isSuccess && all.length > 0 && visible.length === 0 && <p className="muted">Aucun souvenir pour ce filtre.</p>}

      {groups.map((group) => (
        <section key={group.month} className="timeline-month" aria-label={formatMonthYear(`${group.month}-01`)}>
          <h2 className="timeline-title">
            {formatMonthYear(`${group.month}-01`)} <span className="hint">· {group.items.length}</span>
          </h2>
          <div className="tiles">
            {group.items.map((m) => (
              <Tile key={m.id} memory={m} onOpen={() => setOpen(ordered.indexOf(m))} />
            ))}
          </div>
        </section>
      ))}

      {storage.data && all.length > 0 && (
        <Section title="Stockage">
          <StorageMeter usage={storage.data} />
          <p className="hint">Les originaux sont conservés tels quels ; seuls de petits aperçus sont créés pour l’affichage.</p>
        </Section>
      )}

      {open !== null && ordered[open] && <Viewer list={ordered} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </Page>
  );
}
