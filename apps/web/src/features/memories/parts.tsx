import type { Album, Memory } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Section } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { type ExportProgress, exportMemories } from './export';
import { useMoments } from './queries';

/** Navigation entre les vues des souvenirs. */
export function MemoriesNav() {
  const links = [
    { to: '/souvenirs', label: 'Frise' },
    { to: '/souvenirs/albums', label: 'Albums' },
    { to: '/souvenirs/rappels', label: 'Rappels' },
  ];
  return (
    <nav className="subnav" aria-label="Vues des souvenirs">
      {links.map((l) => (
        // Le lien actif reçoit aria-current="page" du routeur ; « Frise » seulement sur sa propre page.
        <Link key={l.to} to={l.to} className="subnav-link" activeOptions={{ exact: l.to === '/souvenirs' }}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** « Aujourd'hui » : anniversaire, âge en mois, dates spéciales et souvenirs du même jour. */
export function MomentsCard({ memories, onOpen }: { memories: Memory[]; onOpen: (memory: Memory) => void }) {
  const moments = useMoments();
  const today = moments.data?.today ?? [];
  if (today.length === 0) return null;
  return (
    <section className="card moments" aria-label="Aujourd’hui">
      <h2 className="card-title">
        <Icon name="star" size={18} /> Aujourd’hui
      </h2>
      <ul className="moments-list">
        {today.map((m) => {
          const same = m.kind === 'on_this_day' ? memories.filter((x) => x.takenDate === m.date) : [];
          return (
            <li key={`${m.kind}-${m.date}`}>
              <p>{m.title}</p>
              {same.length > 0 && (
                <div className="moments-tiles">
                  {same.slice(0, 6).map((x) => (
                    <button key={x.id} type="button" className="tile tile-small" onClick={() => onOpen(x)} aria-label={`Ouvrir le souvenir du ${formatDate(x.takenDate)}`}>
                      {x.previewUrl ? <img src={x.previewUrl} alt="" loading="lazy" /> : <Icon name={x.kind === 'video' ? 'play' : 'image'} />}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const formatSize = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1).replace('.', ',')} Go` : `${Math.max(1, Math.round(bytes / 1e6))} Mo`);

/** Export en ZIP : tout, une année, ou un album. */
export function ExportPanel({ memories, albums, label, choices = true }: { memories: Memory[]; albums: Album[]; label: string; choices?: boolean }) {
  const years = useMemo(() => [...new Set(memories.map((m) => m.takenDate.slice(0, 4)))], [memories]);
  const [scope, setScope] = useState('all');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const selected = scope === 'all' ? memories : memories.filter((m) => m.takenDate.startsWith(scope));
  const size = selected.reduce((n, m) => n + m.size, 0);

  async function run() {
    setError(null);
    setResult(null);
    try {
      const parts = await exportMemories(selected, albums, scope === 'all' ? label : `${label}-${scope}`, setProgress);
      setResult(parts > 1 ? `${parts} archives enregistrées.` : 'Archive enregistrée.');
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  }

  return (
    <Section title="Exporter">
      <p className="hint">
        Une archive ZIP avec les originaux intacts, rangés par année et par mois, et un fichier souvenirs.json (dates, légendes, albums). Au-delà
        de 500 Mo, l’export est découpé en plusieurs archives.
      </p>
      <div className="row row-wrap" style={{ gap: 8, alignItems: 'end' }}>
        {choices && years.length > 1 && (
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="export-scope">Souvenirs</label>
            <select id="export-scope" className="input" value={scope} onChange={(e) => setScope(e.target.value)} disabled={progress !== null}>
              <option value="all">Tous</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
        <button type="button" className="btn btn-secondary" disabled={progress !== null || selected.length === 0} onClick={() => void run()}>
          <Icon name="download" size={18} />
          {progress
            ? `Préparation ${progress.done}/${progress.total}${progress.parts > 1 ? ` · archive ${progress.part}/${progress.parts}` : ''}`
            : `Exporter ${selected.length} souvenir${selected.length > 1 ? 's' : ''} (${formatSize(size)})`}
        </button>
      </div>
      {progress && (
        <span className="meter" aria-hidden="true">
          <span className="meter-fill" style={{ width: `${Math.max((progress.done / Math.max(progress.total, 1)) * 100, 2)}%` }} />
        </span>
      )}
      {result && <p role="status">{result}</p>}
      {error != null && (
        <p className="alert" role="alert">
          {errorMessage(error)}
        </p>
      )}
    </Section>
  );
}
