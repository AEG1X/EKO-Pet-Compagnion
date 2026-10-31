import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_LABELS,
  type DocumentCategory,
  type EkoDocument,
  FILE_TYPES_LABEL,
  STORAGE,
  type StorageUsage,
  fileUrl,
  formatBytes,
} from '@eko/shared';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AddButton, FormButtons, Page, QueryError, Section } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/dates';
import { jpegName, needsShrink, shrinkImage, titleFromFileName } from '../../lib/images';
import { useHealthEvents } from '../health/queries';
import { useDog } from '../profile/queries';
import { documents, useCreateDocument, useStorage } from './queries';

/** Les photos de documents au-delà de 2 Mo sont réduites (2 400 px suffisent pour relire une ordonnance). */
const SHRINK_ABOVE_BYTES = 2_000_000;
const DOCUMENT_MAX_SIDE = 2400;

interface FormState {
  title: string;
  category: DocumentCategory;
  date: string;
  healthEventId: string;
  notes: string;
}

function toForm(doc?: EkoDocument): FormState {
  return {
    title: doc?.title ?? '',
    category: doc?.category ?? 'ordonnance',
    date: doc?.date ?? todayIso(),
    healthEventId: doc?.healthEventId ?? '',
    notes: doc?.notes ?? '',
  };
}

function DocumentForm({ doc, onDone }: { doc?: EkoDocument; onDone: () => void }) {
  const save = documents.useSave();
  const create = useCreateDocument();
  const events = useHealthEvents();
  const [form, setForm] = useState(() => toForm(doc));
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const p = doc ? `doc-${doc.id}` : 'doc-new';
  const set = (name: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    setFile(picked);
    setFileError(null);
    if (picked && !form.title) setForm((f) => ({ ...f, title: titleFromFileName(picked.name) }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (doc) {
      save.mutate({ id: doc.id, input: { ...form, fileId: doc.file.id } }, { onSuccess: onDone });
      return;
    }
    if (!file) {
      setFileError('Choisis un fichier.');
      return;
    }
    let blob: Blob = file;
    let name = file.name;
    if (needsShrink(file, SHRINK_ABOVE_BYTES)) {
      setPreparing(true);
      try {
        blob = await shrinkImage(file, DOCUMENT_MAX_SIDE);
        name = jpegName(file.name);
      } catch {
        setFileError(`Format non accepté : ${FILE_TYPES_LABEL}.`);
        return;
      } finally {
        setPreparing(false);
      }
    }
    if (blob.size > STORAGE.MAX_FILE_BYTES) {
      setFileError(`Fichier trop lourd : ${formatBytes(STORAGE.MAX_FILE_BYTES)} maximum.`);
      return;
    }
    create.mutate({ file: blob, name, input: form }, { onSuccess: onDone });
  }

  const pending = preparing || save.isPending || create.isPending;
  const error = doc ? (save.isError ? save.error : null) : create.isError ? create.error : null;

  return (
    <form className="stack" onSubmit={submit} aria-label={doc ? `Modifier ${doc.title}` : 'Nouveau document'}>
      <div className="form-grid">
        {!doc && (
          <div className="field span-2">
            <label htmlFor={`${p}-file`}>Fichier</label>
            <input
              id={`${p}-file`}
              className="input"
              type="file"
              accept="application/pdf,image/*"
              required
              onChange={pick}
              aria-describedby={`${p}-file-hint`}
            />
            <span id={`${p}-file-hint`} className="hint">
              {file
                ? `${file.name} · ${formatBytes(file.size)}`
                : `${FILE_TYPES_LABEL}, ${formatBytes(STORAGE.MAX_FILE_BYTES)} maximum. Les photos lourdes sont réduites avant l’envoi.`}
            </span>
          </div>
        )}
        <div className="field span-2">
          <label htmlFor={`${p}-title`}>Titre</label>
          <input id={`${p}-title`} className="input" required maxLength={120} placeholder="Ordonnance otite, facture vaccin…" value={form.title} onChange={set('title')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-category`}>Catégorie</label>
          <select id={`${p}-category`} className="input" value={form.category} onChange={set('category')}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {DOCUMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${p}-date`}>Date</label>
          <input id={`${p}-date`} className="input" type="date" required value={form.date} onChange={set('date')} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-event`}>Soin associé</label>
          <select id={`${p}-event`} className="input" value={form.healthEventId} onChange={set('healthEventId')}>
            <option value="">Aucun</option>
            {events.data?.slice(0, 30).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} · {formatDate(ev.date)}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={1000} value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      {fileError && (
        <p className="alert" role="alert">
          {fileError}
        </p>
      )}
      <FormButtons pending={pending} onCancel={onDone} error={error} />
      {create.isPending && <p className="hint" role="status">Envoi du fichier…</p>}
    </form>
  );
}

function DocumentItem({ doc, eventTitle, onEdit }: { doc: EkoDocument; eventTitle?: string; onEdit: () => void }) {
  const remove = documents.useRemove();
  const kind = doc.file.contentType === 'application/pdf' ? 'PDF' : 'Image';
  return (
    <li className="list-item contact doc-item">
      <a className="doc-link" href={fileUrl(doc.file.id)} target="_blank" rel="noopener">
        <span className="icon-tile" aria-hidden="true">
          <Icon name={kind === 'PDF' ? 'file' : 'image'} />
        </span>
        <span className="contact-body">
          <strong>{doc.title}</strong>
          <span className="hint">
            {DOCUMENT_CATEGORY_LABELS[doc.category]} · {formatDate(doc.date)} · {kind}, {formatBytes(doc.file.size)}
          </span>
          {eventTitle && <span className="hint">Soin : {eventTitle}</span>}
          {doc.notes && <span className="hint">{doc.notes}</span>}
        </span>
      </a>
      <div className="contact-actions">
        <a className="icon-btn" href={fileUrl(doc.file.id, true)} aria-label={`Télécharger ${doc.title}`}>
          <Icon name="download" size={18} />
        </a>
        <button type="button" className="icon-btn" aria-label={`Modifier ${doc.title}`} onClick={onEdit}>
          <Icon name="edit" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Supprimer ${doc.title}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Supprimer « ${doc.title} » et son fichier ? Cette action est définitive.`)) remove.mutate(doc.id);
          }}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    </li>
  );
}

/** Espace utilisé par rapport au plafond applicatif de 9 Go (l'offre gratuite R2 en couvre 10). */
export function StorageMeter({ usage }: { usage: StorageUsage }) {
  const ratio = Math.min(usage.usedBytes / usage.limitBytes, 1);
  const warn = usage.usedBytes >= usage.warnBytes;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="section-head">
        <span>
          <strong>{formatBytes(usage.usedBytes)}</strong> <span className="hint">sur {formatBytes(usage.limitBytes)}</span>
        </span>
        <span className="hint">{Math.round(ratio * 1000) / 10} %</span>
      </div>
      <span
        className={warn ? 'meter meter-warn' : 'meter'}
        role="meter"
        aria-label="Stockage utilisé"
        aria-valuemin={0}
        aria-valuemax={usage.limitBytes}
        aria-valuenow={usage.usedBytes}
        aria-valuetext={`${formatBytes(usage.usedBytes)} sur ${formatBytes(usage.limitBytes)}`}
      >
        <span className="meter-fill" style={{ width: `${Math.max(ratio * 100, usage.usedBytes > 0 ? 1 : 0)}%` }} />
      </span>
      {warn && (
        <p className="alert" role="alert">
          Le stockage dépasse {formatBytes(usage.warnBytes)}. Au-delà de {formatBytes(usage.limitBytes)}, EKO refusera les nouveaux
          fichiers pour rester dans l’offre gratuite.
        </p>
      )}
    </div>
  );
}

export function DocumentsPage() {
  const dog = useDog();
  const list = documents.useList();
  const storage = useStorage();
  const events = useHealthEvents();
  const [editing, setEditing] = useState<string | null>(null);
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const all = list.data ?? [];
  const shown = category ? all.filter((d) => d.category === category) : all;
  const eventTitles = new Map(events.data?.map((e) => [e.id, e.title]));
  const used = new Set(all.map((d) => d.category));

  const byYear = new Map<string, EkoDocument[]>();
  for (const d of shown) {
    const year = d.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), d]);
  }

  return (
    <Page title="Documents" needsDog={dog.isSuccess && !dog.data}>
      <Section title="Documents" action={editing === null && <AddButton onClick={() => setEditing('new')} />}>
        <QueryError error={list.error} />
        {editing === 'new' && <DocumentForm onDone={() => setEditing(null)} />}
        {list.isSuccess && all.length === 0 && editing !== 'new' && (
          <p className="muted">
            Ordonnances, résultats d’analyse, factures, assurance, passeport : tout reste privé et n’est lisible qu’une fois connecté.
          </p>
        )}
        {used.size > 1 && (
          <div className="field" style={{ maxWidth: 280 }}>
            <label htmlFor="doc-filter">Catégorie</label>
            <select id="doc-filter" className="input" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory | '')}>
              <option value="">Toutes</option>
              {DOCUMENT_CATEGORIES.filter((c) => used.has(c)).map((c) => (
                <option key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        )}
        {[...byYear.entries()].map(([year, items]) => (
          <div key={year} className="stack" style={{ gap: 4 }}>
            <h3 className="eyebrow">{year}</h3>
            <ul className="list">
              {items.map((d) =>
                editing === d.id ? (
                  <li key={d.id} className="list-item">
                    <DocumentForm doc={d} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <DocumentItem
                    key={d.id}
                    doc={d}
                    eventTitle={d.healthEventId ? eventTitles.get(d.healthEventId) : undefined}
                    onEdit={() => setEditing(d.id)}
                  />
                ),
              )}
            </ul>
          </div>
        ))}
      </Section>

      <Section title="Stockage">
        <QueryError error={storage.error} />
        {storage.data && <StorageMeter usage={storage.data} />}
        <p className="hint">Documents et photo du profil comptent dans cet espace. Supprimer un document libère sa place.</p>
      </Section>
    </Page>
  );
}
