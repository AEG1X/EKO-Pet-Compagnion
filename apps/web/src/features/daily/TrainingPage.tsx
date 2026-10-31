import { SKILL_STATUSES, SKILL_STATUS_LABELS, type Skill, type SkillStatus, type TrainingSession } from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { AddButton, FormButtons, Page, QueryError, RowActions, Section, TabPanel, Tabs } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/dates';
import { useDog } from '../profile/queries';
import { skills, trainingSessions } from './queries';

type Tab = 'apprentissages' | 'seances';
const TABS: { id: Tab; label: string }[] = [
  { id: 'apprentissages', label: 'Apprentissages' },
  { id: 'seances', label: 'Séances' },
];

function SkillForm({ skill, onDone }: { skill?: Skill; onDone: () => void }) {
  const save = skills.useSave();
  const [form, setForm] = useState({
    name: skill?.name ?? '',
    status: skill?.status ?? ('a_apprendre' as SkillStatus),
    acquiredDate: skill?.acquiredDate ?? '',
    notes: skill?.notes ?? '',
  });
  const p = skill ? `skill-${skill.id}` : 'skill-new';
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => {
      const next = { ...f, [name]: e.target.value };
      // Passer à « Acquis » propose la date du jour.
      if (name === 'status' && e.target.value === 'acquis' && !f.acquiredDate) next.acquiredDate = todayIso();
      return next;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: skill?.id, input: form }, { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={skill ? `Modifier ${skill.name}` : 'Nouvel apprentissage'}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-name`}>Apprentissage</label>
          <input id={`${p}-name`} className="input" required maxLength={80} placeholder="Rappel, marche en laisse, assis…" value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-status`}>Où en est-il ?</label>
          <select id={`${p}-status`} className="input" value={form.status} onChange={set('status')}>
            {SKILL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {SKILL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        {form.status === 'acquis' && (
          <div className="field">
            <label htmlFor={`${p}-acquired`}>Acquis le</label>
            <input id={`${p}-acquired`} className="input" type="date" max={todayIso()} value={form.acquiredDate} onChange={set('acquiredDate')} />
          </div>
        )}
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={1000} placeholder="Méthode, mot-clé, difficultés…" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

function SkillsPanel() {
  const list = skills.useList();
  const remove = skills.useRemove();
  const [editing, setEditing] = useState<string | null>(null);
  const all = list.data ?? [];

  return (
    <>
      <Section title="Apprentissages" action={editing === null && <AddButton onClick={() => setEditing('new')} />}>
        <QueryError error={list.error} />
        {editing === 'new' && <SkillForm onDone={() => setEditing(null)} />}
        {list.isSuccess && all.length === 0 && editing !== 'new' && (
          <p className="muted">Note ce qu’Eko apprend et suis ses progrès jusqu’à « Acquis ».</p>
        )}
      </Section>
      {(['en_cours', 'a_apprendre', 'acquis'] as const).map((status) => {
        const group = all.filter((s) => s.status === status);
        if (group.length === 0) return null;
        return (
          <Section key={status} title={`${SKILL_STATUS_LABELS[status]} (${group.length})`}>
            <ul className="list">
              {group.map((skill) =>
                editing === skill.id ? (
                  <li key={skill.id} className="list-item">
                    <SkillForm skill={skill} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={skill.id} className="list-item contact">
                    <div className="contact-body">
                      <strong>{skill.name}</strong>
                      {skill.acquiredDate && <span className="hint">Acquis le {formatDate(skill.acquiredDate)}</span>}
                      {skill.notes && <span className="hint" style={{ whiteSpace: 'pre-line' }}>{skill.notes}</span>}
                    </div>
                    <RowActions label={skill.name} busy={remove.isPending} onEdit={() => setEditing(skill.id)} onDelete={() => remove.mutate(skill.id)} />
                  </li>
                ),
              )}
            </ul>
          </Section>
        );
      })}
    </>
  );
}

function toInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function SessionForm({ session, onDone }: { session?: TrainingSession; onDone: () => void }) {
  const save = trainingSessions.useSave();
  const skillList = skills.useList();
  const [form, setForm] = useState({
    date: session?.date ?? todayIso(),
    durationMinutes: session?.durationMinutes?.toString() ?? '',
    skillId: session?.skillId ?? '',
    notes: session?.notes ?? '',
  });
  const p = session ? `session-${session.id}` : 'session-new';
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: session?.id, input: { ...form, durationMinutes: toInt(form.durationMinutes) } }, { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={session ? 'Modifier la séance' : 'Nouvelle séance'}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${p}-date`}>Date</label>
          <input id={`${p}-date`} className="input" type="date" required value={form.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-duration`}>Durée (minutes)</label>
          <input id={`${p}-duration`} className="input" type="number" inputMode="numeric" min={1} max={600} value={form.durationMinutes} onChange={set('durationMinutes')} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-skill`}>Apprentissage travaillé</label>
          <select id={`${p}-skill`} className="input" value={form.skillId} onChange={set('skillId')}>
            <option value="">Aucun en particulier</option>
            {skillList.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Comment ça s’est passé ?</label>
          <textarea id={`${p}-notes`} className="input" maxLength={2000} value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

function SessionsPanel() {
  const list = trainingSessions.useList();
  const skillList = skills.useList();
  const remove = trainingSessions.useRemove();
  const [editing, setEditing] = useState<string | null>(null);
  const names = new Map((skillList.data ?? []).map((s) => [s.id, s.name]));
  const all = list.data ?? [];

  return (
    <Section title="Séances" action={editing === null && <AddButton onClick={() => setEditing('new')} />}>
      <QueryError error={list.error} />
      {editing === 'new' && <SessionForm onDone={() => setEditing(null)} />}
      {list.isSuccess && all.length === 0 && editing !== 'new' && <p className="muted">Aucune séance enregistrée.</p>}
      <ul className="list">
        {all.map((s) => {
          const title = [s.skillId ? names.get(s.skillId) : null, s.durationMinutes ? `${s.durationMinutes} min` : null]
            .filter(Boolean)
            .join(' · ');
          return editing === s.id ? (
            <li key={s.id} className="list-item">
              <SessionForm session={s} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={s.id} className="list-item contact">
              <div className="contact-body">
                <strong>{formatDate(s.date)}</strong>
                {title && <span>{title}</span>}
                {s.notes && <span className="hint" style={{ whiteSpace: 'pre-line' }}>{s.notes}</span>}
              </div>
              <RowActions label={`la séance du ${formatDate(s.date)}`} busy={remove.isPending} onEdit={() => setEditing(s.id)} onDelete={() => remove.mutate(s.id)} />
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function TrainingPage() {
  const dog = useDog();
  const [tab, setTab] = useState<Tab>('apprentissages');
  return (
    <Page title="Éducation" needsDog={dog.isSuccess && !dog.data}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Rubriques éducation" />
      <TabPanel id={tab}>{tab === 'apprentissages' ? <SkillsPanel /> : <SessionsPanel />}</TabPanel>
    </Page>
  );
}
