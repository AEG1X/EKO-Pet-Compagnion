import type { DashboardSection } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { useOwner } from '../../app/AppGate';
import { Icon, type IconName, Paw } from '../../components/Icon';
import { dogSubtitle } from '../profile/ProfilePage';
import { useMemories } from '../memories/queries';
import { useDog } from '../profile/queries';
import { DogAvatar } from '../profile/DogPhoto';
import { documents } from '../documents/queries';
import { useHealthEvents } from '../health/queries';
import { agendaItems } from '../calendar/agenda';
import { reminders } from '../calendar/queries';
import { expenses, feedingPlans, skills } from '../daily/queries';
import { describeRation } from '../daily/FeedingPage';
import { totalFor } from '../daily/ExpensesPage';
import { addDays, formatEuros } from '@eko/shared';
import { daysUntil, formatDate, relativeDays, todayIso } from '../../lib/dates';

const SECTIONS: Record<DashboardSection, { label: string; icon: IconName; to: string; empty: string }> = {
  sante: { label: 'Santé', icon: 'heart', to: '/sante', empty: 'Aucun soin enregistré' },
  alimentation: { label: 'Alimentation', icon: 'bowl', to: '/alimentation', empty: 'Aucun repas défini' },
  education: { label: 'Éducation', icon: 'cap', to: '/education', empty: 'Aucune séance' },
  souvenirs: { label: 'Souvenirs', icon: 'image', to: '/souvenirs', empty: 'Aucune photo' },
  depenses: { label: 'Dépenses', icon: 'wallet', to: '/depenses', empty: 'Aucune dépense' },
  documents: { label: 'Documents', icon: 'file', to: '/documents', empty: 'Aucun document' },
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5 || hour >= 18) return 'Bonsoir';
  return 'Bonjour';
}

export function Dashboard() {
  const me = useOwner();
  const dog = useDog();
  const events = useHealthEvents();
  const reminderList = reminders.useList();
  // Prochain élément de l'agenda : rappel (même en retard) ou échéance de santé.
  const next = agendaItems(reminderList.data ?? [], events.data ?? [], todayIso(), addDays(todayIso(), 365), todayIso(), { includeOverdue: true })[0];
  const lastCare = events.data?.[0];
  const plans = feedingPlans.useList();
  const skillList = skills.useList();
  const expenseList = expenses.useList();
  const today = todayIso();
  const currentPlan = plans.data?.find((p) => p.startDate <= today && (!p.endDate || p.endDate >= today));
  const acquired = skillList.data?.filter((s) => s.status === 'acquis').length ?? 0;
  const learning = skillList.data?.filter((s) => s.status === 'en_cours').length ?? 0;
  const monthSpent = totalFor(expenseList.data ?? [], today.slice(0, 7));
  const docList = documents.useList();
  const memoryList = useMemories(dog.isSuccess && Boolean(dog.data));

  /** Résumé réel de chaque section, ou le texte d'attente tant qu'elle est vide. */
  function summary(id: DashboardSection): string {
    switch (id) {
      case 'sante':
        return lastCare ? `Dernier soin : ${lastCare.title}, ${formatDate(lastCare.date)}` : SECTIONS.sante.empty;
      case 'alimentation':
        return currentPlan ? [currentPlan.food, describeRation(currentPlan)].filter(Boolean).join(' · ') : SECTIONS.alimentation.empty;
      case 'education':
        return acquired + learning > 0
          ? `${acquired} acquis${learning ? ` · ${learning} en cours` : ''}`
          : SECTIONS.education.empty;
      case 'depenses':
        return expenseList.data?.length ? `${formatEuros(monthSpent)} ce mois-ci` : SECTIONS.depenses.empty;
      case 'documents': {
        const count = docList.data?.length ?? 0;
        if (count === 0) return SECTIONS.documents.empty;
        return `${count} document${count > 1 ? 's' : ''} · dernier : ${docList.data![0]!.title}`;
      }
      case 'souvenirs': {
        const count = memoryList.data?.length ?? 0;
        if (count === 0) return SECTIONS.souvenirs.empty;
        return `${count} souvenir${count > 1 ? 's' : ''} · dernier le ${formatDate(memoryList.data![0]!.takenDate)}`;
      }
    }
  }
  const todayLabel = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>
            {greeting()} {me.owner.displayName} !
          </h1>
        </div>
        <Link to="/reglages" className="icon-btn" aria-label="Réglages">
          <Icon name="settings" size={20} />
        </Link>
      </header>

      <section className="hero" aria-label={dog.data?.name ?? 'Profil'}>
        <span className="hero-paw">
          <Paw size={180} />
        </span>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {dog.data ? (
            <div className="hero-identity">
              <DogAvatar dog={dog.data} size={72} />
              <div>
                <p className="hero-name">{dog.data.name}</p>
                <p>{dogSubtitle(dog.data)}</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="hero-name">{dog.isPending ? '\u00a0' : 'Bienvenue'}</p>
              <p>{dog.isPending ? '\u00a0' : 'Commence par créer le profil de ton chien.'}</p>
            </div>
          )}
          <Link to="/profil" className="btn btn-secondary">
            {dog.isSuccess && !dog.data ? 'Créer le profil' : 'Voir le profil'}
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="next-title">
        <div className="row">
          <span className="icon-tile">
            <Icon name="calendar" />
          </span>
          <div>
            <h2 id="next-title" className="eyebrow">
              Prochaine échéance
            </h2>
            {next ? (
              <Link to="/calendrier" className="stack" style={{ gap: 2, textDecoration: 'none' }}>
                <strong>{next.title}</strong>
                <span className={daysUntil(next.date) < 0 ? 'due due-late' : 'due'}>
                  {formatDate(next.date)}
                  {next.time ? ` à ${next.time.replace(':', ' h ')}` : ''} · {relativeDays(next.date)}
                </span>
              </Link>
            ) : (
              <p className="muted">Les rappels et les échéances de santé apparaîtront ici.</p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="sections-title" className="stack" style={{ gap: 12 }}>
        <h2 id="sections-title" className="visually-hidden">
          Sections
        </h2>
        <div className="grid-cards">
          {me.settings.sectionOrder.filter((id) => !me.settings.hiddenSections.includes(id)).map((id) => {
            const section = SECTIONS[id];
            return (
              <Link key={id} to={section.to} className="card section-card">
                <span className="icon-tile">
                  <Icon name={section.icon} />
                </span>
                <strong>{section.label}</strong>
                <span className="hint">
                  {summary(id)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
