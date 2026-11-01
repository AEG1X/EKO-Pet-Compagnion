import {
  COMMON_HEALTH_TESTS,
  PARENT_ROLES,
  PARENT_ROLE_LABELS,
  type Parent,
  type ParentHealthTest,
  type ParentInput,
  type ParentRole,
} from '@eko/shared';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { Icon, Paw } from '../../components/Icon';
import { AddButton, FormButtons, QueryError, RowActions } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { jpegName, shrinkImage } from '../../lib/images';
import { documents } from '../documents/queries';
import { useDeleteParent, useDeleteParentTest, useParents, useSaveParent, useSaveParentTest, useSetParentPhoto } from './litterQueries';

const PHOTO_MAX_SIDE = 1200;

/** « la mère », « le père » : pour les libellés de boutons. */
const ARTICLE: Record<ParentRole, string> = { mere: 'la mère', pere: 'le père' };

/** Nom complet : « Tala du Val des Loups ». */
export function parentFullName(p: Pick<Parent, 'name' | 'affix'>): string {
  return [p.name, p.affix].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Fiche

type ParentForm = Record<keyof Omit<ParentInput, never>, string>;

function toForm(p?: Parent): ParentForm {
  return {
    name: p?.name ?? '',
    affix: p?.affix ?? '',
    breed: p?.breed ?? '',
    birthDate: p?.birthDate ?? '',
    coat: p?.coat ?? '',
    registration: p?.registration ?? '',
    chipNumber: p?.chipNumber ?? '',
    pedigreeUrl: p?.pedigreeUrl ?? '',
    titles: p?.titles ?? '',
    notes: p?.notes ?? '',
  };
}

function ParentFormView({ role, parent, defaultBreed, onDone }: { role: ParentRole; parent?: Parent; defaultBreed: string | null; onDone: () => void }) {
  const [form, setForm] = useState(() => ({ ...toForm(parent), breed: parent ? (parent.breed ?? '') : (defaultBreed ?? '') }));
  const save = useSaveParent();
  const p = `parent-${role}`;
  const field = (name: keyof ParentForm) => ({
    id: `${p}-${name}`,
    value: form[name],
    onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ role, input: { ...form, birthDate: form.birthDate || null } }, { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={`Fiche de ${ARTICLE[role]}`}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-name`}>Nom</label>
          <input className="input" required maxLength={60} autoComplete="off" {...field('name')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-affix`}>Affixe (élevage)</label>
          <input className="input" maxLength={80} autoComplete="off" placeholder="du Val des Loups" {...field('affix')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-breed`}>Race</label>
          <input className="input" maxLength={60} autoComplete="off" {...field('breed')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-birthDate`}>Date de naissance</label>
          <input className="input" type="date" {...field('birthDate')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-coat`}>Robe</label>
          <input className="input" maxLength={60} autoComplete="off" placeholder="Fauve, loup, noir…" {...field('coat')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-registration`}>N° LOF</label>
          <input className="input" maxLength={40} autoComplete="off" {...field('registration')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-chipNumber`}>N° de puce</label>
          <input className="input" inputMode="numeric" maxLength={30} autoComplete="off" {...field('chipNumber')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-titles`}>Cotation, titres</label>
          <input className="input" maxLength={200} autoComplete="off" placeholder="Confirmé, cotation 3, champion…" {...field('titles')} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-pedigreeUrl`}>Lien du pedigree</label>
          <input className="input" type="url" inputMode="url" maxLength={500} autoComplete="off" placeholder="https://…" {...field('pedigreeUrl')} />
          <span className="hint">Par exemple la fiche LOF Select de la Centrale Canine, ou la page de l’élevage.</span>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea className="input" maxLength={2000} placeholder="Caractère, poids adulte, problèmes de santé connus…" {...field('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.error} />
    </form>
  );
}

// ---------------------------------------------------------------- Photo

function ParentPhoto({ parent }: { parent: Parent }) {
  const setPhoto = useSetParentPhoto();
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
    setPhoto.mutate({ role: parent.role, photo: { file: blob, name: jpegName(file.name) } });
  }

  const busy = preparing || setPhoto.isPending;
  return (
    <div className="stack" style={{ gap: 6, alignItems: 'center' }}>
      <span className="avatar" style={{ width: 72, height: 72 }}>
        {parent.photoUrl ? <img src={parent.photoUrl} alt={`Photo de ${parent.name}`} /> : <Paw size={36} />}
      </span>
      <input ref={input} type="file" accept="image/*" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={pick} />
      <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => input.current?.click()}>
        <Icon name="camera" size={16} /> {busy ? 'Envoi…' : parent.photoUrl ? 'Changer' : 'Photo'}
      </button>
      {parent.photoUrl && (
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Retirer la photo de ${parent.name} ?`)) setPhoto.mutate({ role: parent.role, photo: null });
          }}
        >
          Retirer
        </button>
      )}
      {(error || setPhoto.isError) && (
        <p className="alert" role="alert">
          {error ?? errorMessage(setPhoto.error)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Tests de santé

function TestForm({ role, test, onDone }: { role: ParentRole; test?: ParentHealthTest; onDone: () => void }) {
  const save = useSaveParentTest();
  const docs = documents.useList();
  const [form, setForm] = useState({
    name: test?.name ?? '',
    result: test?.result ?? '',
    date: test?.date ?? '',
    lab: test?.lab ?? '',
    documentId: test?.document?.id ?? '',
    notes: test?.notes ?? '',
  });
  const p = test ? `test-${test.id}` : `test-new-${role}`;
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { role, id: test?.id, input: { ...form, date: form.date || null, documentId: form.documentId || null } },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={test ? `Modifier ${test.name}` : 'Nouveau test de santé'}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-name`}>Test</label>
          <input id={`${p}-name`} className="input" required maxLength={80} list="health-test-names" autoComplete="off" value={form.name} onChange={set('name')} />
          <datalist id="health-test-names">
            {COMMON_HEALTH_TESTS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor={`${p}-result`}>Résultat</label>
          <input id={`${p}-result`} className="input" maxLength={120} autoComplete="off" placeholder="A, indemne, normal…" value={form.result} onChange={set('result')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-date`}>Date</label>
          <input id={`${p}-date`} className="input" type="date" value={form.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-lab`}>Laboratoire ou lecteur</label>
          <input id={`${p}-lab`} className="input" maxLength={80} autoComplete="off" value={form.lab} onChange={set('lab')} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-doc`}>Document du résultat</label>
          <select id={`${p}-doc`} className="input" value={form.documentId} onChange={set('documentId')}>
            <option value="">Aucun</option>
            {(docs.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} · {formatDate(d.date)}
              </option>
            ))}
          </select>
          <span className="hint">Ajoute d’abord le PDF ou la photo du résultat dans Documents, puis choisis-le ici.</span>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={1000} value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.error} />
    </form>
  );
}

/** « A · 12 mars 2025 · Lecteur officiel » */
export function testSummary(t: ParentHealthTest): string {
  return [t.result, t.date ? formatDate(t.date) : null, t.lab].filter(Boolean).join(' · ');
}

function Tests({ parent }: { parent: Parent }) {
  const [editing, setEditing] = useState<string | null>(null);
  const remove = useDeleteParentTest();
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="section-head">
        <h4 className="eyebrow">Tests de santé</h4>
        {editing === null && <AddButton label="Test" onClick={() => setEditing('new')} />}
      </div>
      {editing === 'new' && <TestForm role={parent.role} onDone={() => setEditing(null)} />}
      {parent.tests.length === 0 && editing !== 'new' && <p className="muted">Hanches, coudes, yeux, ADN… demande les résultats à l’éleveur.</p>}
      {parent.tests.length > 0 && (
        <ul className="list">
          {parent.tests.map((t) =>
            editing === t.id ? (
              <li key={t.id} className="list-item">
                <TestForm role={parent.role} test={t} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={t.id} className="list-item contact">
                <div className="contact-body">
                  <strong>{t.name}</strong>
                  {testSummary(t) && <span className="hint">{testSummary(t)}</span>}
                  {t.notes && <span className="hint">{t.notes}</span>}
                  {t.document && (
                    <a className="hint" href={t.document.fileUrl} target="_blank" rel="noopener">
                      <Icon name="file" size={14} /> {t.document.title}
                    </a>
                  )}
                </div>
                <RowActions label={t.name} onEdit={() => setEditing(t.id)} onDelete={() => remove.mutate(t.id)} busy={remove.isPending} />
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Carte d'un parent

function Fact({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ParentCard({ role, parent, defaultBreed }: { role: ParentRole; parent?: Parent; defaultBreed: string | null }) {
  const [editing, setEditing] = useState(false);
  const remove = useDeleteParent();
  const label = PARENT_ROLE_LABELS[role];

  if (editing) {
    return (
      <div className="list-item stack parent-card">
        <h3>{label}</h3>
        <ParentFormView role={role} parent={parent} defaultBreed={defaultBreed} onDone={() => setEditing(false)} />
      </div>
    );
  }
  if (!parent) {
    return (
      <div className="list-item parent-card parent-empty">
        <div className="contact-body">
          <h3>{label}</h3>
          <span className="hint">Pas encore renseigné{role === 'mere' ? 'e' : ''}.</span>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
          <Icon name="plus" size={18} /> Ajouter {ARTICLE[role]}
        </button>
      </div>
    );
  }
  return (
    <div className="list-item stack parent-card">
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <ParentPhoto parent={parent} />
        <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <span className="eyebrow">{label}</span>
          <h3>{parentFullName(parent)}</h3>
          {parent.pedigreeUrl && (
            <a href={parent.pedigreeUrl} target="_blank" rel="noopener noreferrer">
              Voir le pedigree
            </a>
          )}
        </div>
        <RowActions label={parent.name} onEdit={() => setEditing(true)} onDelete={() => remove.mutate(role)} busy={remove.isPending} />
      </div>
      <dl className="facts">
        <Fact label="Race" value={parent.breed} />
        <Fact label={role === 'mere' ? 'Née le' : 'Né le'} value={parent.birthDate ? formatDate(parent.birthDate) : null} />
        <Fact label="Robe" value={parent.coat} />
        <Fact label="N° LOF" value={parent.registration} />
        <Fact label="N° de puce" value={parent.chipNumber} />
        <Fact label="Cotation, titres" value={parent.titles} />
      </dl>
      {parent.notes && (
        <p className="hint" style={{ whiteSpace: 'pre-line' }}>
          {parent.notes}
        </p>
      )}
      <QueryError error={remove.error} />
      <Tests parent={parent} />
    </div>
  );
}

export function ParentsSection({ defaultBreed }: { defaultBreed: string | null }) {
  const parents = useParents();
  return (
    <section className="card stack" aria-labelledby="parents-title">
      <div className="section-head">
        <h2 id="parents-title">Parents</h2>
      </div>
      <QueryError error={parents.error} />
      {parents.isSuccess && (
        <div className="stack" style={{ gap: 12 }}>
          {[...PARENT_ROLES].reverse().map((role) => (
            <ParentCard key={role} role={role} parent={parents.data.find((p) => p.role === role)} defaultBreed={defaultBreed} />
          ))}
        </div>
      )}
    </section>
  );
}
