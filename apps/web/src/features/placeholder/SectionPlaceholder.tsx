import { Link } from '@tanstack/react-router';
import { Icon } from '../../components/Icon';
import type { NavEntry } from '../../app/navigation';

/** Section prévue dans une phase ultérieure : on l'annonce clairement plutôt que d'afficher de fausses données. */
export function SectionPlaceholder({ entry }: { entry: NavEntry }) {
  return (
    <div className="stack">
      <header className="topbar">
        <h1>{entry.label}</h1>
      </header>
      <section className="card empty">
        <span className="icon-tile">
          <Icon name={entry.icon} />
        </span>
        <h2>Bientôt disponible</h2>
        <p className="muted">{entry.description}</p>
        {entry.phase && <p className="hint">Prévu en phase {entry.phase} du plan de développement.</p>}
        <Link to="/" className="btn btn-secondary">
          Retour au tableau de bord
        </Link>
      </section>
    </div>
  );
}
