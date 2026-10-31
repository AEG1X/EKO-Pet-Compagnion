import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Page } from '../../components/ui';
import { ReminderForm } from '../calendar/CalendarPage';
import { ExpenseForm } from '../daily/ExpensesPage';
import { SessionForm } from '../daily/TrainingPage';
import { EventForm, WeightForm } from '../health/HealthPage';
import { useDog } from '../profile/queries';

type Kind = 'soin' | 'pesee' | 'depense' | 'rappel' | 'seance';

interface Choice {
  id: Kind;
  label: string;
  hint: string;
  icon: IconName;
  /** Section où retrouver l'élément enregistré. */
  to: string;
  section: string;
}

const CHOICES: Choice[] = [
  { id: 'soin', label: 'Soin', hint: 'Vaccin, antiparasitaire, consultation…', icon: 'heart', to: '/sante', section: 'Santé' },
  { id: 'pesee', label: 'Pesée', hint: 'Le poids du jour', icon: 'scale', to: '/sante', section: 'Santé' },
  { id: 'depense', label: 'Dépense', hint: 'Croquettes, vétérinaire, accessoires…', icon: 'wallet', to: '/depenses', section: 'Dépenses' },
  { id: 'rappel', label: 'Rappel', hint: 'Une échéance à ne pas oublier', icon: 'bell', to: '/calendrier', section: 'Calendrier' },
  { id: 'seance', label: 'Séance d’éducation', hint: 'Ce que vous avez travaillé', icon: 'cap', to: '/education', section: 'Éducation' },
];

/** Ajout rapide (bouton + de la barre mobile) : choisir quoi ajouter, puis le formulaire de la section. */
export function QuickAddPage() {
  const dog = useDog();
  const [kind, setKind] = useState<Kind | null>(null);
  const [saved, setSaved] = useState<Choice | null>(null);
  const current = CHOICES.find((c) => c.id === kind) ?? null;

  const back = () => setKind(null);
  const done = () => {
    setSaved(current);
    setKind(null);
  };

  return (
    <Page title={current ? `Ajouter : ${current.label.toLowerCase()}` : 'Ajout rapide'} needsDog={dog.isSuccess && !dog.data}>
      {saved && !current && (
        <p className="notice" role="status">
          <Icon name="check" size={18} /> C’est enregistré.{' '}
          <Link to={saved.to}>Voir dans {saved.section}</Link>
        </p>
      )}

      {!current && (
        <ul className="card list" aria-label="Que veux-tu ajouter ?">
          {CHOICES.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="list-item quick-choice"
                onClick={() => {
                  setSaved(null);
                  setKind(c.id);
                }}
              >
                <span className="icon-tile">
                  <Icon name={c.icon} />
                </span>
                <span className="quick-choice-text">
                  <strong>{c.label}</strong>
                  <span className="hint">{c.hint}</span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          ))}
          <li>
            <Link to="/documents" className="list-item quick-choice">
              <span className="icon-tile">
                <Icon name="file" />
              </span>
              <span className="quick-choice-text">
                <strong>Document</strong>
                <span className="hint">Ordonnance, facture, carnet de santé</span>
              </span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        </ul>
      )}

      {current && (
        <section className="card">
          {kind === 'soin' && <EventForm onDone={back} onSaved={done} />}
          {kind === 'pesee' && <WeightForm onCancel={back} onSaved={done} />}
          {kind === 'depense' && <ExpenseForm onDone={back} onSaved={done} />}
          {kind === 'rappel' && <ReminderForm onDone={back} onSaved={done} />}
          {kind === 'seance' && <SessionForm onDone={back} onSaved={done} />}
        </section>
      )}
    </Page>
  );
}
