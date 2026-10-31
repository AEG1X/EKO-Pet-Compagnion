import {
  RECURRENCES,
  RECURRENCE_LABELS,
  REMINDER_KINDS,
  REMINDER_KIND_LABELS,
  type Recurrence,
  type Reminder,
  type ReminderKind,
  addDays,
} from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { AddButton, FormButtons, Page, QueryError, RowActions, Section, TabPanel, Tabs } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDate, parseIsoDate, relativeDays, todayIso } from '../../lib/dates';
import { useHealthEvents } from '../health/queries';
import { useDog } from '../profile/queries';
import { type AgendaItem, agendaItems, monthGrid } from './agenda';
import { reminders, useCalendarFeed, useCreateFeed, useRevokeFeed, useToggleDone } from './queries';

type Tab = 'avenir' | 'mois' | 'rappels';
const TABS: { id: Tab; label: string }[] = [
  { id: 'avenir', label: 'À venir' },
  { id: 'mois', label: 'Mois' },
  { id: 'rappels', label: 'Rappels' },
];

const NOTIFY_CHOICES = [
  { value: 0, label: 'Le jour même' },
  { value: 1, label: 'La veille' },
  { value: 2, label: '2 jours avant' },
  { value: 7, label: '1 semaine avant' },
  { value: 14, label: '2 semaines avant' },
];

const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ---------------------------------------------------------------- Formulaire

function ReminderForm({ reminder, onDone }: { reminder?: Reminder; onDone: () => void }) {
  const save = reminders.useSave();
  const [form, setForm] = useState({
    title: reminder?.title ?? '',
    kind: reminder?.kind ?? ('rendez_vous' as ReminderKind),
    date: reminder?.date ?? todayIso(),
    time: reminder?.time ?? '',
    recurrence: reminder?.recurrence ?? ('none' as Recurrence),
    notifyDaysBefore: reminder?.notifyDaysBefore ?? 1,
    notes: reminder?.notes ?? '',
  });
  const p = reminder ? `reminder-${reminder.id}` : 'reminder-new';
  const set = (name: 'title' | 'kind' | 'date' | 'time' | 'recurrence' | 'notes') => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: reminder?.id, input: { ...form, healthEventId: reminder?.healthEventId ?? null } }, { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={reminder ? `Modifier ${reminder.title}` : 'Nouveau rappel'}>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor={`${p}-title`}>Titre</label>
          <input id={`${p}-title`} className="input" required maxLength={120} placeholder="Toilettage, rendez-vous vétérinaire, vermifuge…" value={form.title} onChange={set('title')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-date`}>{form.recurrence === 'none' ? 'Date' : 'Prochaine fois'}</label>
          <input id={`${p}-date`} className="input" type="date" required value={form.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-time`}>Heure (facultative)</label>
          <input id={`${p}-time`} className="input" type="time" value={form.time} onChange={set('time')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-recurrence`}>Répétition</label>
          <select id={`${p}-recurrence`} className="input" value={form.recurrence} onChange={set('recurrence')}>
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {RECURRENCE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${p}-notify`}>Me prévenir</label>
          <select
            id={`${p}-notify`}
            className="input"
            value={form.notifyDaysBefore}
            onChange={(e) => setForm((f) => ({ ...f, notifyDaysBefore: Number(e.target.value) }))}
          >
            {NOTIFY_CHOICES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${p}-kind`}>Catégorie</label>
          <select id={`${p}-kind`} className="input" value={form.kind} onChange={set('kind')}>
            {REMINDER_KINDS.map((k) => (
              <option key={k} value={k}>
                {REMINDER_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={1000} placeholder="Adresse, choses à apporter…" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

// ---------------------------------------------------------------- Éléments d'agenda

function DoneButton({ reminder }: { reminder: Reminder }) {
  const toggle = useToggleDone();
  const label = reminder.recurrence === 'none' ? 'Fait' : 'Fait, suivant';
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      disabled={toggle.isPending}
      onClick={() => toggle.mutate({ id: reminder.id, done: true })}
      aria-label={`${label} : ${reminder.title}`}
    >
      <Icon name="check" size={16} /> {label}
    </button>
  );
}

function AgendaRow({ item, today }: { item: AgendaItem; today: string }) {
  return (
    <li className={`list-item agenda-item agenda-${item.type}`}>
      <span className="agenda-mark" aria-hidden="true" />
      <div className="contact-body">
        <strong>{item.title}</strong>
        <span className={item.overdue ? 'hint due-late' : 'hint'}>
          {item.time ? `${item.time.replace(':', ' h ')} · ` : ''}
          {item.type === 'echeance' ? 'Échéance de santé' : item.type === 'soin' ? 'Soin effectué' : REMINDER_KIND_LABELS[item.reminder!.kind]}
          {item.overdue ? ` · ${relativeDays(item.date, today)}` : ''}
        </span>
      </div>
      {item.reminder && item.date <= addDays(today, 7) && <DoneButton reminder={item.reminder} />}
    </li>
  );
}

function groupByDate(items: AgendaItem[]) {
  const groups = new Map<string, AgendaItem[]>();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return groups;
}

function dayTitle(date: string, today: string) {
  const days = relativeDays(date, today);
  const label = capitalize(weekday.format(parseIsoDate(date)));
  return days === 'aujourd’hui' || days === 'demain' ? `${capitalize(days)} · ${label}` : label;
}

function UpcomingPanel({ list, today }: { list: AgendaItem[]; today: string }) {
  const overdue = list.filter((i) => i.overdue);
  const upcoming = list.filter((i) => !i.overdue);
  if (list.length === 0) {
    return <p className="muted">Rien de prévu dans les deux prochains mois. Ajoute un rappel pour le toilettage, un vermifuge ou un rendez-vous.</p>;
  }
  return (
    <>
      {overdue.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <h3 className="eyebrow">En retard</h3>
          <ul className="list">
            {overdue.map((item) => (
              <AgendaRow key={item.key} item={item} today={today} />
            ))}
          </ul>
        </div>
      )}
      {[...groupByDate(upcoming).entries()].map(([date, items]) => (
        <div key={date} className="stack" style={{ gap: 4 }}>
          <h3 className="eyebrow">{dayTitle(date, today)}</h3>
          <ul className="list">
            {items.map((item) => (
              <AgendaRow key={item.key} item={item} today={today} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Mois

function MonthPanel({ all, events, today }: { all: Reminder[]; events: Parameters<typeof agendaItems>[1]; today: string }) {
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const grid = monthGrid(cursor.year, cursor.month);
  const items = agendaItems(all, events, grid[0]!, grid.at(-1)!, today, { includePastCare: true });
  const byDate = groupByDate(items);
  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const move = (delta: number) =>
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  const selectedItems = byDate.get(selected) ?? [];

  return (
    <>
      <div className="section-head">
        <button type="button" className="icon-btn" aria-label="Mois précédent" onClick={() => move(-1)}>
          <span className="flip">
            <Icon name="chevron" size={18} />
          </span>
        </button>
        <h2 aria-live="polite">{capitalize(monthTitle.format(parseIsoDate(`${monthPrefix}-01`)))}</h2>
        <button type="button" className="icon-btn" aria-label="Mois suivant" onClick={() => move(1)}>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      <div className="month" role="grid" aria-label="Calendrier du mois">
        <div className="month-row" role="row">
          {WEEKDAYS.map((d) => (
            <span key={d} className="month-weekday" role="columnheader">
              {d}
            </span>
          ))}
        </div>
        {Array.from({ length: grid.length / 7 }, (_, w) => (
          <div key={w} className="month-row" role="row">
            {grid.slice(w * 7, w * 7 + 7).map((date) => {
              const dayItems = byDate.get(date) ?? [];
              const types = [...new Set(dayItems.map((i) => i.type))];
              const classes = ['month-day'];
              if (!date.startsWith(monthPrefix)) classes.push('month-out');
              if (date === today) classes.push('month-today');
              if (date === selected) classes.push('month-selected');
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  className={classes.join(' ')}
                  aria-selected={date === selected}
                  aria-label={`${weekday.format(parseIsoDate(date))}${dayItems.length ? ` : ${dayItems.length} élément${dayItems.length > 1 ? 's' : ''}` : ''}`}
                  onClick={() => setSelected(date)}
                >
                  <span>{Number(date.slice(8, 10))}</span>
                  <span className="month-dots" aria-hidden="true">
                    {types.map((t) => (
                      <span key={t} className={`dot dot-${t}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <ul className="legend" aria-label="Légende">
        <li>
          <span className="dot dot-rappel" /> Rappel
        </li>
        <li>
          <span className="dot dot-echeance" /> Échéance de santé
        </li>
        <li>
          <span className="dot dot-soin" /> Soin effectué
        </li>
      </ul>
      <div className="stack" style={{ gap: 4 }}>
        <h3 className="eyebrow">{dayTitle(selected, today)}</h3>
        {selectedItems.length === 0 ? (
          <p className="muted">Rien ce jour-là.</p>
        ) : (
          <ul className="list">
            {selectedItems.map((item) => (
              <AgendaRow key={item.key} item={item} today={today} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Rappels

function describeReminder(r: Reminder) {
  const when = r.recurrence === 'none' ? formatDate(r.date) : `${RECURRENCE_LABELS[r.recurrence]}, prochaine fois le ${formatDate(r.date)}`;
  return [REMINDER_KIND_LABELS[r.kind], when, r.time ? r.time.replace(':', ' h ') : null].filter(Boolean).join(' · ');
}

function RemindersPanel({ all, editing, setEditing }: { all: Reminder[]; editing: string | null; setEditing: (id: string | null) => void }) {
  const remove = reminders.useRemove();
  const toggle = useToggleDone();
  const active = all.filter((r) => !r.doneDate);
  const done = all.filter((r) => r.doneDate);
  const row = (r: Reminder) =>
    editing === r.id ? (
      <li key={r.id} className="list-item">
        <ReminderForm reminder={r} onDone={() => setEditing(null)} />
      </li>
    ) : (
      <li key={r.id} className="list-item contact">
        <div className="contact-body">
          <strong className={r.doneDate ? 'done' : undefined}>{r.title}</strong>
          <span className="hint">{r.doneDate ? `Fait le ${formatDate(r.doneDate)}` : describeReminder(r)}</span>
          {r.notes && <span className="hint">{r.notes}</span>}
        </div>
        {r.doneDate && (
          <button type="button" className="btn btn-ghost btn-small" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: r.id, done: false })}>
            Rouvrir
          </button>
        )}
        <RowActions label={r.title} busy={remove.isPending} onEdit={() => setEditing(r.id)} onDelete={() => remove.mutate(r.id)} />
      </li>
    );
  return (
    <>
      {all.length === 0 && editing !== 'new' && <p className="muted">Aucun rappel pour l’instant.</p>}
      {active.length > 0 && <ul className="list">{active.map(row)}</ul>}
      {done.length > 0 && (
        <details className="stack">
          <summary className="eyebrow">Faits ({done.length})</summary>
          <ul className="list">{done.map(row)}</ul>
        </details>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Synchronisation

function SyncSection() {
  const feed = useCalendarFeed();
  const create = useCreateFeed();
  const revoke = useRevokeFeed();
  const [copied, setCopied] = useState(false);
  const url = create.data?.url;
  const webcal = url?.replace(/^https?:/, 'webcal:');

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Section title="Synchroniser">
      <p className="hint">
        Ajoute les rappels et les échéances de santé à Apple Calendrier ou Google Agenda. Le lien d’abonnement se met à jour
        tout seul ; il contient les titres et les dates, jamais les notes.
      </p>
      <QueryError error={feed.error ?? create.error ?? revoke.error} />
      {url ? (
        <div className="stack" style={{ gap: 8 }}>
          <label htmlFor="feed-url" className="eyebrow">
            Lien d’abonnement (affiché une seule fois)
          </label>
          <input id="feed-url" className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-primary" href={webcal}>
              <Icon name="calendar" size={18} /> Ouvrir dans Calendrier
            </a>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? 'Copié' : 'Copier le lien'}
            </button>
          </div>
          <p className="hint">Garde ce lien pour toi : toute personne qui l’a peut lire ton calendrier. Tu peux le remplacer à tout moment.</p>
        </div>
      ) : feed.data?.active ? (
        <p>
          Abonnement actif depuis le {formatDate(feed.data.createdAt!.slice(0, 10))}
          {feed.data.lastUsedAt ? `, lu pour la dernière fois le ${formatDate(feed.data.lastUsedAt.slice(0, 10))}` : ', pas encore lu'}.
        </p>
      ) : null}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {!url && (
          <button
            type="button"
            className={feed.data?.active ? 'btn btn-secondary' : 'btn btn-primary'}
            disabled={create.isPending}
            onClick={() => {
              if (!feed.data?.active || window.confirm('Remplacer le lien ? L’ancien cessera de fonctionner sur tes appareils.')) create.mutate();
            }}
          >
            {feed.data?.active ? 'Remplacer le lien' : 'Créer un lien d’abonnement'}
          </button>
        )}
        {(feed.data?.active || url) && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={revoke.isPending}
            onClick={() => {
              if (window.confirm('Désactiver l’abonnement ? Le calendrier ne se mettra plus à jour sur tes appareils.')) {
                revoke.mutate(undefined, { onSuccess: () => create.reset() });
              }
            }}
          >
            Désactiver
          </button>
        )}
        <a className="btn btn-ghost" href="/api/calendar.ics" download="eko.ics">
          <Icon name="download" size={18} /> Exporter (.ics)
        </a>
      </div>
      {revoke.isError && <p className="alert">{errorMessage(revoke.error)}</p>}
    </Section>
  );
}

// ---------------------------------------------------------------- Page

export function CalendarPage() {
  const dog = useDog();
  const list = reminders.useList();
  const events = useHealthEvents();
  const [tab, setTab] = useState<Tab>('avenir');
  const [editing, setEditing] = useState<string | null>(null);
  const today = todayIso();
  const all = list.data ?? [];
  const upcoming = agendaItems(all, events.data ?? [], today, addDays(today, 60), today, { includeOverdue: true, nextOnly: true });

  return (
    <Page title="Calendrier" needsDog={dog.isSuccess && !dog.data}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Vues du calendrier" />
      <TabPanel id={tab}>
        <section className="card stack" aria-label={TABS.find((t) => t.id === tab)!.label}>
          {tab !== 'mois' && (
            <div className="section-head">
              <h2>{tab === 'avenir' ? 'Les deux prochains mois' : 'Tous les rappels'}</h2>
              {editing === null && <AddButton label="Rappel" onClick={() => setEditing('new')} />}
            </div>
          )}
          <QueryError error={list.error ?? events.error} />
          {editing === 'new' && tab !== 'mois' && <ReminderForm onDone={() => setEditing(null)} />}
          {list.isSuccess && tab === 'avenir' && <UpcomingPanel list={upcoming} today={today} />}
          {list.isSuccess && tab === 'mois' && <MonthPanel all={all} events={events.data ?? []} today={today} />}
          {list.isSuccess && tab === 'rappels' && <RemindersPanel all={all} editing={editing} setEditing={setEditing} />}
        </section>
      </TabPanel>
      <SyncSection />
    </Page>
  );
}
