import type { MemoryReminderSettings } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { FormButtons, Page, QueryError, Section } from '../../components/ui';
import { formatDate, relativeDays } from '../../lib/dates';
import { useDog } from '../profile/queries';
import { MemoriesNav } from './parts';
import { useMomentActions, useMoments } from './queries';

const OPTIONS: { key: keyof MemoryReminderSettings; label: string; hint: string }[] = [
  { key: 'birthday', label: 'Anniversaire', hint: 'Le jour de son anniversaire (date de naissance du profil).' },
  { key: 'monthly', label: 'Chaque mois, jusqu’à 2 ans', hint: '« Eko a 5 mois aujourd’hui » : l’occasion d’une photo pour suivre sa croissance.' },
  { key: 'specialDates', label: 'Dates spéciales', hint: 'Chaque année, pour les dates ajoutées ci-dessous.' },
  { key: 'onThisDay', label: 'Ce jour-là', hint: 'Les souvenirs pris le même jour les années précédentes.' },
];

function SpecialDateForm({ onDone }: { onDone: () => void }) {
  const { addDate } = useMomentActions();
  const [form, setForm] = useState({ title: '', date: '' });
  function submit(e: FormEvent) {
    e.preventDefault();
    addDate.mutate(form, { onSuccess: onDone });
  }
  return (
    <form className="stack card-inset" onSubmit={submit}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="special-title">Événement</label>
          <input
            id="special-title"
            className="input"
            required
            maxLength={80}
            placeholder="Arrivée à la maison, première balade…"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="special-date">Date</label>
          <input id="special-date" className="input" type="date" required value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        </div>
      </div>
      <FormButtons pending={addDate.isPending} onCancel={onDone} error={addDate.error} />
    </form>
  );
}

export function RemindersPage() {
  const dog = useDog();
  const hasDog = dog.isSuccess && Boolean(dog.data);
  const moments = useMoments(hasDog);
  const { settings, removeDate } = useMomentActions();
  const [adding, setAdding] = useState(false);
  const data = moments.data;
  const name = dog.data?.name ?? 'ton chien';

  return (
    <Page title="Souvenirs" needsDog={dog.isSuccess && !dog.data}>
      <MemoriesNav />
      <QueryError error={moments.error ?? settings.error ?? removeDate.error} />

      {data && (
        <>
          <Section title="Rappels souvenirs">
            <p className="hint">
              Ils arrivent avec le récapitulatif de 8 h, sur les appareils choisis dans <Link to="/reglages">Réglages</Link>, et s’affichent en haut de la
              frise le jour venu.
            </p>
            {!dog.data?.birthDate && (
              <p className="notice">
                Ajoute la date de naissance de {name} dans le <Link to="/profil">profil</Link> pour fêter son anniversaire et ses premiers mois.
              </p>
            )}
            <ul className="list">
              {OPTIONS.map((o) => (
                <li key={o.key} className="list-item">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={data.settings[o.key]}
                      disabled={settings.isPending}
                      onChange={(e) => settings.mutate({ ...data.settings, [o.key]: e.target.checked })}
                    />
                    <span>
                      <strong>{o.label}</strong>
                      <br />
                      <span className="hint">{o.hint}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Dates spéciales"
            action={
              !adding && (
                <button type="button" className="btn btn-secondary" onClick={() => setAdding(true)}>
                  <Icon name="plus" size={18} /> Ajouter
                </button>
              )
            }
          >
            {adding && <SpecialDateForm onDone={() => setAdding(false)} />}
            {data.specialDates.length === 0 && !adding && <p className="muted">Arrivée à la maison, premier bain, première neige… ajoute les dates à fêter chaque année.</p>}
            {data.specialDates.length > 0 && (
              <ul className="list">
                {data.specialDates.map((s) => (
                  <li key={s.id} className="list-item">
                    <div>
                      <strong>{s.title}</strong>
                      <br />
                      <span className="hint">{formatDate(s.date)}</span>
                    </div>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Supprimer ${s.title}`}
                      disabled={removeDate.isPending}
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${s.title} » ?`)) removeDate.mutate(s.id);
                      }}
                    >
                      <Icon name="trash" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {data.upcoming.length > 0 && (
            <Section title="Dans les 30 prochains jours">
              <ul className="list">
                {data.upcoming.map((u) => (
                  <li key={`${u.title}-${u.on}`} className="list-item">
                    <div>
                      <strong>{u.title}</strong> · {u.years} an{u.years > 1 ? 's' : ''}
                      <br />
                      <span className="hint">
                        {formatDate(u.on)} ({relativeDays(u.on)})
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
