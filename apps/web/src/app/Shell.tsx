import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Icon, Paw } from '../components/Icon';
import { MOBILE_NAV, NAV, type NavEntry } from './navigation';
import { useOwner } from './AppGate';

function isActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

function MobileLink({ entry, pathname }: { entry: NavEntry; pathname: string }) {
  return (
    <Link to={entry.to} className="nav-item" aria-current={isActive(pathname, entry.to) ? 'page' : undefined}>
      <Icon name={entry.icon} />
      <span>{entry.label}</span>
    </Link>
  );
}

export function Shell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const me = useOwner();

  return (
    <div className="shell">
      <a className="visually-hidden" href="#contenu">
        Aller au contenu
      </a>
      <nav className="sidebar" aria-label="Navigation principale">
        <div className="brand">
          <Paw />
          <span className="brand-name">EKO</span>
        </div>
        {NAV.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            className="side-link"
            aria-current={isActive(pathname, entry.to) ? 'page' : undefined}
          >
            <Icon name={entry.icon} size={20} />
            {entry.label}
          </Link>
        ))}
        <div className="sidebar-footer side-link" aria-label="Compte">
          <Icon name="user" size={20} />
          {me.owner.displayName}
        </div>
      </nav>

      <main id="contenu" className="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {MOBILE_NAV.left.map((entry) => (
          <MobileLink key={entry.to} entry={entry} pathname={pathname} />
        ))}
        <Link to="/ajouter" className="fab" aria-label="Ajouter">
          <Icon name="plus" size={26} />
        </Link>
        {MOBILE_NAV.right.map((entry) => (
          <MobileLink key={entry.to} entry={entry} pathname={pathname} />
        ))}
      </nav>
    </div>
  );
}
