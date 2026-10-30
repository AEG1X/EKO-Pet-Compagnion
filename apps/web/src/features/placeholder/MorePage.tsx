import { Link } from '@tanstack/react-router';
import { Icon } from '../../components/Icon';
import { NAV } from '../../app/navigation';

/** Menu « Plus » sur mobile : toutes les sections. */
export function MorePage() {
  return (
    <div className="stack">
      <header className="topbar">
        <h1>Toutes les sections</h1>
      </header>
      <ul className="card list">
        {NAV.filter((e) => e.to !== '/').map((entry) => (
          <li key={entry.to}>
            <Link to={entry.to} className="list-item" style={{ textDecoration: 'none' }}>
              <span className="icon-tile">
                <Icon name={entry.icon} />
              </span>
              <span style={{ flexGrow: 1, fontWeight: 600 }}>{entry.label}</span>
              <Icon name="chevron" size={18} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
