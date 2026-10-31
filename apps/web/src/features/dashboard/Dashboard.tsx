import type { DashboardSection } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { useOwner } from '../../app/AppGate';
import { Icon, type IconName, Paw } from '../../components/Icon';
import { dogSubtitle } from '../profile/ProfilePage';
import { useDog } from '../profile/queries';

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
  const today = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{today}</p>
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
        <p className="eyebrow" style={{ color: 'inherit', opacity: 0.8 }}>
          Photo de couverture à venir
        </p>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {dog.data ? (
            <div>
              <p className="hero-name">{dog.data.name}</p>
              <p>{dogSubtitle(dog.data)}</p>
            </div>
          ) : (
            <div>
              <p className="hero-name">{dog.isPending ? '\u00a0' : 'Bienvenue'}</p>
              <p>{dog.isPending ? '\u00a0' : 'Commence par créer le profil de ton chien.'}</p>
            </div>
          )}
          <Link to="/profil" className="btn btn-secondary" style={{ color: 'var(--text)' }}>
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
            <p className="muted">Les rappels de santé et les rendez-vous apparaîtront ici.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="sections-title" className="stack" style={{ gap: 12 }}>
        <h2 id="sections-title" className="visually-hidden">
          Sections
        </h2>
        <div className="grid-cards">
          {me.settings.sectionOrder.map((id) => {
            const section = SECTIONS[id];
            return (
              <Link key={id} to={section.to} className="card section-card">
                <span className="icon-tile">
                  <Icon name={section.icon} />
                </span>
                <strong>{section.label}</strong>
                <span className="hint">{section.empty}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
