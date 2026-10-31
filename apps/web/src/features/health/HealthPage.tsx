import {
  HEALTH_EVENT_KINDS,
  HEALTH_EVENT_LABELS,
  type HealthEvent,
  type HealthEventKind,
  type Treatment,
  formatWeight,
  isTreatmentActive,
  parseKilograms,
} from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AddButton, FormButtons, Page, RowActions as Actions, Section, TabPanel, Tabs } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { daysUntil, formatDate, relativeDays, todayIso } from '../../lib/dates';
import { useContacts, useDog } from '../profile/queries';
import {
  useHealthEvents,
  useRemoveEvent,
  useRemoveTreatment,
  useRemoveWeight,
  useSaveEvent,
  useSaveTreatment,
  useSaveWeight,
  useTreatments,
  useWeights,
} from './queries';
import { upcomingDue } from './upcoming';
import { WeightChart } from './WeightChart';

type Tab = 'soins' | 'traitements' | 'poids';
const TABS: { id: Tab; label: string }[] = [
  { id: 'soins', label: 'Soins' },
  { id: 'traitements', label: 'Traitements' },
  { id: 'poids', label: 'Poids' },
];

// ---------------------------------------------------------------- Soins

export function EventForm({
  event,
  onDone,
  onSaved,
}: {
  event?: HealthEvent;
  onDone: () => void;
  /** Appelé après l'enregistrement à la place de onDone (ajout rapide). */
  onSaved?: () => void;
}) {
  const contacts = useContacts();
  const save = useSaveEvent();
  const [form, setForm] = useState({
    kind: event?.kind ?? ('vaccin' as HealthEventKind),
    date: event?.date ?? todayIso(),
    title: event?.title ?? '',
    contactId: event?.contactId ?? contacts.data?.find((c) => c.primary)?.id ?? '',
    nextDueDate: event?.nextDueDate ?? '',
    notes: event?.notes ?? '',
  });
  const p = event ? `event-${event.id}` : 'event-new';
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: event?.id, input: form }, { onSuccess: onSaved ?? onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={event ? `Modifier ${event.title}` : 'Nouveau soin'}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-kind`}>Type</label>
          <select id={`${p}-kind`} className="input" value={form.kind} onChange={set('kind')}>
            {HEALTH_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {HEALTH_EVENT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${p}-date`}>Date</label>
          <input id={`${p}-date`} className="input" type="date" required value={form.date} onChange={set('date')} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-title`}>Intitulé</label>
          <input
            id={`${p}-title`}
            className="input"
            required
            maxLength={120}
            placeholder="CHPPiL, Bravecto, contrôle annuel…"
            value={form.title}
            onChange={set('title')}
          />
        </div>
        <div className="field">
          <label htmlFor={`${p}-contact`}>Vétérinaire ou intervenant</label>
          <select id={`${p}-contact`} className="input" value={form.contactId} onChange={set('contactId')}>
            <option value="">Aucun</option>
            {contacts.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${p}-due`}>Prochaine échéance</label>
          <input id={`${p}-due`} className="input" type="date" min={form.date} value={form.nextDueDate} onChange={set('nextDueDate')} />
          <span className="hint">Rappel, renouvellement… Elle apparaîtra dans « À venir ».</span>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={2000} placeholder="Lot, posologie, observations…" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

function DueLabel({ date }: { date: string }) {
  const late = daysUntil(date) < 0;
  return (
    <span className={late ? 'due due-late' : 'due'}>
      {formatDate(date)} · {relativeDays(date)}
    </span>
  );
}

function EventsPanel() {
  const events = useHealthEvents();
  const remove = useRemoveEvent();
  const [editing, setEditing] = useState<string | null>(null);
  const list = events.data ?? [];

  const upcoming = upcomingDue(list);

  return (
    <>
      {upcoming.length > 0 && (
        <Section title="À venir">
          <ul className="list">
            {upcoming.map((e) => (
              <li key={e.id} className="list-item">
                <span className="icon-tile">
                  <Icon name="calendar" />
                </span>
                <div className="contact-body">
                  <strong>{e.title}</strong>
                  <DueLabel date={e.nextDueDate!} />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Historique des soins" action={editing === null && <AddButton onClick={() => setEditing('new')} />}>
        {events.isError && (
          <p className="alert" role="alert">
            {errorMessage(events.error)}
          </p>
        )}
        {editing === 'new' && <EventForm onDone={() => setEditing(null)} />}
        {events.isSuccess && list.length === 0 && editing !== 'new' && (
          <p className="muted">Ajoute les vaccins, antiparasitaires et consultations d’Eko, avec leurs dates de rappel.</p>
        )}
        <ul className="list">
          {list.map((e) =>
            editing === e.id ? (
              <li key={e.id} className="list-item">
                <EventForm event={e} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={e.id} className="list-item contact">
                <div className="contact-body">
                  <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="badge">{HEALTH_EVENT_LABELS[e.kind]}</span>
                    <strong>{e.title}</strong>
                  </span>
                  <span className="hint">{[formatDate(e.date), e.contactName].filter(Boolean).join(' · ')}</span>
                  {e.nextDueDate && <span className="hint">Prochaine échéance : {formatDate(e.nextDueDate)}</span>}
                  {e.notes && <span className="hint" style={{ whiteSpace: 'pre-line' }}>{e.notes}</span>}
                </div>
                <Actions label={e.title} busy={remove.isPending} onEdit={() => setEditing(e.id)} onDelete={() => remove.mutate(e.id)} />
              </li>
            ),
          )}
        </ul>
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Traitements

function TreatmentForm({ treatment, onDone }: { treatment?: Treatment; onDone: () => void }) {
  const save = useSaveTreatment();
  const [form, setForm] = useState({
    name: treatment?.name ?? '',
    dosage: treatment?.dosage ?? '',
    frequency: treatment?.frequency ?? '',
    startDate: treatment?.startDate ?? todayIso(),
    endDate: treatment?.endDate ?? '',
    notes: treatment?.notes ?? '',
  });
  const p = treatment ? `treatment-${treatment.id}` : 'treatment-new';
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: treatment?.id, input: form }, { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={treatment ? `Modifier ${treatment.name}` : 'Nouveau traitement'}>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor={`${p}-name`}>Médicament ou traitement</label>
          <input id={`${p}-name`} className="input" required maxLength={120} value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-dosage`}>Dose</label>
          <input id={`${p}-dosage`} className="input" maxLength={120} placeholder="1 comprimé, 2 ml…" value={form.dosage} onChange={set('dosage')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-frequency`}>Fréquence</label>
          <input id={`${p}-frequency`} className="input" maxLength={120} placeholder="Matin et soir…" value={form.frequency} onChange={set('frequency')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-start`}>Début</label>
          <input id={`${p}-start`} className="input" type="date" required value={form.startDate} onChange={set('startDate')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-end`}>Fin</label>
          <input id={`${p}-end`} className="input" type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} />
          <span className="hint">Laisse vide pour un traitement au long cours.</span>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={2000} value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

function TreatmentList({ items, editing, setEditing }: { items: Treatment[]; editing: string | null; setEditing: (id: string | null) => void }) {
  const remove = useRemoveTreatment();
  return (
    <ul className="list">
      {items.map((t) =>
        editing === t.id ? (
          <li key={t.id} className="list-item">
            <TreatmentForm treatment={t} onDone={() => setEditing(null)} />
          </li>
        ) : (
          <li key={t.id} className="list-item contact">
            <div className="contact-body">
              <strong>{t.name}</strong>
              {(t.dosage || t.frequency) && <span>{[t.dosage, t.frequency].filter(Boolean).join(' · ')}</span>}
              <span className="hint">
                {t.endDate ? `Du ${formatDate(t.startDate)} au ${formatDate(t.endDate)}` : `Depuis le ${formatDate(t.startDate)}`}
              </span>
              {t.notes && <span className="hint" style={{ whiteSpace: 'pre-line' }}>{t.notes}</span>}
            </div>
            <Actions label={t.name} busy={remove.isPending} onEdit={() => setEditing(t.id)} onDelete={() => remove.mutate(t.id)} />
          </li>
        ),
      )}
    </ul>
  );
}

function TreatmentsPanel() {
  const treatments = useTreatments();
  const [editing, setEditing] = useState<string | null>(null);
  const list = treatments.data ?? [];
  const active = list.filter((t) => isTreatmentActive(t, todayIso()));
  const past = list.filter((t) => !isTreatmentActive(t, todayIso()));

  return (
    <>
      <Section title="En cours" action={editing === null && <AddButton onClick={() => setEditing('new')} />}>
        {treatments.isError && (
          <p className="alert" role="alert">
            {errorMessage(treatments.error)}
          </p>
        )}
        {editing === 'new' && <TreatmentForm onDone={() => setEditing(null)} />}
        {treatments.isSuccess && active.length === 0 && editing !== 'new' && <p className="muted">Aucun traitement en cours.</p>}
        <TreatmentList items={active} editing={editing} setEditing={setEditing} />
      </Section>
      {past.length > 0 && (
        <Section title="Terminés">
          <TreatmentList items={past} editing={editing} setEditing={setEditing} />
        </Section>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Poids

/** Saisie d'une pesée ; réutilisée par l'ajout rapide. */
export function WeightForm({ onSaved, onCancel }: { onSaved?: () => void; onCancel?: () => void }) {
  const save = useSaveWeight();
  const [date, setDate] = useState(todayIso());
  const [kilos, setKilos] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const grams = parseKilograms(kilos);
    if (grams === null) {
      setInputError('Indique le poids en kilogrammes, par exemple 23,4.');
      return;
    }
    setInputError(null);
    save.mutate(
      { input: { date, grams } },
      {
        onSuccess: () => {
          setKilos('');
          onSaved?.();
        },
      },
    );
  }

  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nouvelle pesée">
      <div className="field">
        <label htmlFor="weight-kg">Poids (kg)</label>
        <input
          id="weight-kg"
          className="input"
          inputMode="decimal"
          required
          placeholder="23,4"
          value={kilos}
          onChange={(e) => setKilos(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="weight-date">Date</label>
        <input id="weight-date" className="input" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {(inputError || save.isError) && (
        <p className="alert span-2" role="alert">
          {inputError ?? errorMessage(save.error)}
        </p>
      )}
      <div className="form-actions span-2">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Annuler
          </button>
        )}
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer la pesée'}
        </button>
      </div>
    </form>
  );
}

function WeightPanel() {
  const weights = useWeights();
  const remove = useRemoveWeight();
  const [showTable, setShowTable] = useState(false);
  const list = weights.data ?? [];

  return (
    <>
      <Section title="Nouvelle pesée">
        <WeightForm />
      </Section>

      <Section
        title="Courbe de poids"
        action={
          list.length > 0 && (
            <button type="button" className="btn btn-ghost" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>
              {showTable ? 'Voir la courbe' : 'Voir le tableau'}
            </button>
          )
        }
      >
        {weights.isError && (
          <p className="alert" role="alert">
            {errorMessage(weights.error)}
          </p>
        )}
        {weights.isSuccess && list.length === 0 && <p className="muted">La courbe apparaîtra dès la première pesée.</p>}
        {list.length > 0 && !showTable && <WeightChart entries={list} />}
        {list.length > 0 && showTable && (
          <ul className="list">
            {[...list].reverse().map((w) => (
              <li key={w.id} className="list-item">
                <span style={{ flexGrow: 1 }}>
                  <strong>{formatWeight(w.grams)}</strong> <span className="hint">{formatDate(w.date)}</span>
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Supprimer la pesée du ${formatDate(w.date)}`}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Supprimer la pesée du ${formatDate(w.date)} ?`)) remove.mutate(w.id);
                  }}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// ---------------------------------------------------------------- Page

export function HealthPage() {
  const dog = useDog();
  const [tab, setTab] = useState<Tab>('soins');

  return (
    <Page title="Santé" needsDog={dog.isSuccess && !dog.data}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Rubriques santé" />
      <TabPanel id={tab}>
        {tab === 'soins' && <EventsPanel />}
        {tab === 'traitements' && <TreatmentsPanel />}
        {tab === 'poids' && <WeightPanel />}
      </TabPanel>
    </Page>
  );
}
