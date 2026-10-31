import type { ReactNode } from 'react';
import { errorMessage } from '../lib/api';
import { Icon } from './Icon';

/** Carte titrée, avec une action facultative à droite du titre. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  const id = `section-${title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\W+/g, '-')
    .toLowerCase()}`;
  return (
    <section className="card stack" aria-labelledby={id}>
      <div className="section-head">
        <h2 id={id}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AddButton({ onClick, label = 'Ajouter' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="btn btn-secondary" onClick={onClick}>
      <Icon name="plus" size={18} /> {label}
    </button>
  );
}

/** Boutons Modifier / Supprimer d'une ligne ; la suppression demande confirmation. */
export function RowActions({
  label,
  onEdit,
  onDelete,
  busy,
}: {
  label: string;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="contact-actions">
      <button type="button" className="icon-btn" aria-label={`Modifier ${label}`} onClick={onEdit}>
        <Icon name="edit" size={18} />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Supprimer ${label}`}
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Supprimer « ${label} » ?`)) onDelete();
        }}
      >
        <Icon name="trash" size={18} />
      </button>
    </div>
  );
}

export function FormButtons({ pending, onCancel, error }: { pending: boolean; onCancel: () => void; error: unknown }) {
  return (
    <>
      {error != null && (
        <p className="alert" role="alert">
          {errorMessage(error)}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </>
  );
}

export function QueryError({ error }: { error: unknown }) {
  if (error == null) return null;
  return (
    <p className="alert" role="alert">
      {errorMessage(error)}
    </p>
  );
}

/** Page d'une section : titre, et rappel de créer le profil tant qu'il n'existe pas. */
export function Page({ title, needsDog, children }: { title: string; needsDog?: boolean; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="topbar">
        <h1>{title}</h1>
      </header>
      {needsDog ? <p className="notice">Crée d’abord le profil de ton chien depuis la page Profil.</p> : children}
    </div>
  );
}

/** Onglets accessibles (rôle tablist) ; le contenu du panneau actif est rendu par l'appelant. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="stack" style={{ gap: 20 }} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </div>
  );
}
