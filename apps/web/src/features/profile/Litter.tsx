import {
  type Dog,
  type Litter,
  type LitterInput,
  MILESTONE_LABELS,
  type Milestone,
  homeDateTooEarly,
  litterMilestones,
} from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { FormButtons, QueryError } from '../../components/ui';
import { daysUntil, formatDate, parseIsoDate, relativeDays, todayIso } from '../../lib/dates';
import { useLitter, useSaveLitter } from './litterQueries';

const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** « 11 février 2027 », « vers février 2027 » pour une estimation à quelques semaines près. */
export function milestoneDate(m: Milestone): string {
  return m.approximate ? `vers ${monthYear.format(parseIsoDate(m.date))}` : formatDate(m.date);
}

/** Prochain jalon à venir, pour le compte à rebours (« Naissance dans 102 jours »). */
export function nextMilestone(litter: Litter | null, dog: Pick<Dog, 'birthDate'>, today = todayIso()): Milestone | null {
  return litterMilestones(litter, dog.birthDate).find((m) => m.date >= today) ?? null;
}

/** « dans environ 6 semaines » : pour une estimation à quelques semaines près. */
export function approximateDelay(m: Milestone, today = todayIso()): string {
  const weeks = Math.round(daysUntil(m.date, today) / 7);
  return `dans environ ${weeks <= 1 ? 'une semaine' : `${weeks} semaines`}`;
}

export function countdown(m: Milestone, today = todayIso()): string {
  if (m.approximate) return `${MILESTONE_LABELS[m.kind]} ${approximateDelay(m, today)}`;
  return `${MILESTONE_LABELS[m.kind]} ${relativeDays(m.date, today)}${m.estimated ? ' (estimation)' : ''}`;
}

interface FormState {
  approx: boolean;
  matingDate: string;
  matingMonth: string;
  ultrasoundResult: string;
  homeDate: string;
  notes: string;
}

function toForm(litter: Litter | null): FormState {
  return {
    approx: litter?.matingApprox ?? true,
    matingDate: litter?.matingDate ?? '',
    matingMonth: litter?.matingDate?.slice(0, 7) ?? '',
    ultrasoundResult: litter?.ultrasoundResult ?? '',
    homeDate: litter?.homeDate ?? '',
    notes: litter?.notes ?? '',
  };
}

/** Un mois approximatif (AAAA-MM) est enregistré au 15 : l'erreur reste de deux semaines au plus. */
function toInput(form: FormState): LitterInput {
  const month = /^\d{4}-\d{2}$/.test(form.matingMonth) ? `${form.matingMonth}-15` : null;
  return {
    matingDate: form.approx ? month : form.matingDate || null,
    matingApprox: form.approx && Boolean(month),
    ultrasoundResult: form.ultrasoundResult,
    homeDate: form.homeDate || null,
    notes: form.notes,
  };
}

function LitterForm({ litter, onDone }: { litter: Litter | null; onDone: () => void }) {
  const [form, setForm] = useState(() => toForm(litter));
  const save = useSaveLitter();
  const set = (name: Exclude<keyof FormState, 'approx'>) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(toInput(form), { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label="Portée">
      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend className="eyebrow">Saillie de la mère</legend>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <label className="check">
            <input type="radio" name="litter-approx" checked={form.approx} onChange={() => setForm((f) => ({ ...f, approx: true }))} />
            Je connais le mois
          </label>
          <label className="check">
            <input type="radio" name="litter-approx" checked={!form.approx} onChange={() => setForm((f) => ({ ...f, approx: false }))} />
            Je connais la date exacte
          </label>
        </div>
        {form.approx ? (
          <div className="field">
            <label htmlFor="litter-month">Mois prévu</label>
            <input id="litter-month" className="input" type="month" placeholder="AAAA-MM" value={form.matingMonth} onChange={set('matingMonth')} />
          </div>
        ) : (
          <div className="field">
            <label htmlFor="litter-mating">Date de la saillie</label>
            <input id="litter-mating" className="input" type="date" value={form.matingDate} onChange={set('matingDate')} />
          </div>
        )}
        <span className="hint">La naissance est estimée à 63 jours après la saillie, l’arrivée à 8 semaines après la naissance.</span>
      </fieldset>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="litter-ultrasound">Résultat de l’échographie</label>
          <input id="litter-ultrasound" className="input" maxLength={200} placeholder="6 chiots, dont 3 mâles…" value={form.ultrasoundResult} onChange={set('ultrasoundResult')} />
        </div>
        <div className="field">
          <label htmlFor="litter-home">Arrivée à la maison convenue</label>
          <input id="litter-home" className="input" type="date" value={form.homeDate} onChange={set('homeDate')} />
        </div>
        <div className="field span-2">
          <label htmlFor="litter-notes">Notes</label>
          <textarea id="litter-notes" className="input" maxLength={2000} placeholder="Choix du chiot, acompte, visites prévues…" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.error} />
    </form>
  );
}

/** Avant la naissance : saillie, estimations, arrivée prévue. */
export function LitterSection({ dog }: { dog: Dog }) {
  const litter = useLitter();
  const [editing, setEditing] = useState(false);
  if (litter.isPending) return null;
  const data = litter.data ?? null;
  // Une fois le chiot né sans portée renseignée, la section n'a plus d'intérêt.
  if (!data && dog.birthDate && !editing) return null;
  const milestones = litterMilestones(data, dog.birthDate);
  const today = todayIso();
  const next = milestones.find((m) => m.date >= today);

  return (
    <section className="card stack" aria-labelledby="litter-title">
      <div className="section-head">
        <h2 id="litter-title">{dog.birthDate ? 'Portée d’origine' : 'Avant la naissance'}</h2>
        {!editing && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Icon name="edit" size={18} /> {data ? 'Modifier' : 'Renseigner'}
          </button>
        )}
      </div>
      <QueryError error={litter.error} />
      {editing ? (
        <LitterForm litter={data} onDone={() => setEditing(false)} />
      ) : milestones.length === 0 ? (
        <p className="muted">
          Indique le mois prévu de la saillie, même approximatif : la naissance et l’arrivée seront estimées et ajoutées au calendrier.
        </p>
      ) : (
        <>
          {next && <p className="notice">{countdown(next, today)}</p>}
          <ol className="list timeline" aria-label="Étapes">
            {milestones.map((m) => (
              <li key={m.kind} className={`list-item agenda-item agenda-portee${m.date < today ? ' timeline-past' : ''}`}>
                <span className="agenda-mark" aria-hidden="true" />
                <div className="contact-body">
                  <strong>{MILESTONE_LABELS[m.kind]}</strong>
                  <span className="hint">
                    {milestoneDate(m)}
                    {m.estimated && !m.approximate ? ' · estimation' : ''}
                    {m.kind === 'echographie' && data?.ultrasoundResult ? ` · ${data.ultrasoundResult}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {homeDateTooEarly(data, dog.birthDate) && (
            <p className="alert" role="alert">
              L’arrivée prévue tombe avant les 8 semaines du chiot, l’âge minimal de cession en France.
            </p>
          )}
          {data?.ultrasoundResult && dog.birthDate && <p className="hint">Échographie : {data.ultrasoundResult}</p>}
          {data?.notes && <p className="hint" style={{ whiteSpace: 'pre-line' }}>{data.notes}</p>}
        </>
      )}
      {!editing && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to="/calendrier" className="btn btn-ghost">
            <Icon name="calendar" size={18} /> Ajouter un rendez-vous
          </Link>
        </div>
      )}
    </section>
  );
}
