import { groupByMonth } from '@eko/shared';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Page, QueryError, Section } from '../../components/ui';
import { formatMonthYear } from '../../lib/dates';
import { StorageMeter } from '../documents/DocumentsPage';
import { useStorage } from '../documents/queries';
import { useDog } from '../profile/queries';
import { Tile, Viewer } from './MemoryViewer';
import { ExportPanel, MemoriesNav, MomentsCard } from './parts';
import { useAlbums, useMemories } from './queries';
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

// ---------------------------------------------------------------- Page

export function MemoriesPage() {
  const dog = useDog();
  const hasDog = dog.isSuccess && Boolean(dog.data);
  const memories = useMemories(hasDog);
  const albums = useAlbums(hasDog);
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
      <MemoriesNav />
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
      <MomentsCard
        memories={all}
        onOpen={(m) => {
          setYear(null);
          setFavorites(false);
          setOpen(groupByMonth(all).flatMap((g) => g.items).indexOf(m));
        }}
      />
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

      {all.length > 0 && <ExportPanel memories={all} albums={albums.data ?? []} label="souvenirs" />}

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
