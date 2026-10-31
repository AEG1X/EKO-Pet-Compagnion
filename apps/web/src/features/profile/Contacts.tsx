import { CONTACT_KINDS, CONTACT_KIND_LABELS, type Contact, type ContactKind } from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { useContacts, useDeleteContact, useSaveContact } from './queries';

interface FormState {
  kind: ContactKind;
  name: string;
  organization: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  primary: boolean;
}

function toForm(contact?: Contact): FormState {
  return {
    kind: contact?.kind ?? 'veterinaire',
    name: contact?.name ?? '',
    organization: contact?.organization ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    address: contact?.address ?? '',
    notes: contact?.notes ?? '',
    primary: contact?.primary ?? false,
  };
}

/** Lien tel: sans espaces ni ponctuation, compris par tous les téléphones. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function ContactForm({ contact, onDone }: { contact?: Contact; onDone: () => void }) {
  const [form, setForm] = useState(() => toForm(contact));
  const save = useSaveContact();
  const prefix = contact ? `contact-${contact.id}` : 'contact-new';

  function text(name: Exclude<keyof FormState, 'kind' | 'primary'>) {
    return {
      id: `${prefix}-${name}`,
      value: form[name],
      onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({ id: contact?.id, input: form }, { onSuccess: onDone });
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={contact ? `Modifier ${contact.name}` : 'Nouveau contact'}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}-kind`}>Type</label>
          <select
            id={`${prefix}-kind`}
            className="input"
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as ContactKind }))}
          >
            {CONTACT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CONTACT_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-name`}>Nom</label>
          <input className="input" required maxLength={80} autoComplete="off" {...text('name')} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-organization`}>Établissement</label>
          <input className="input" maxLength={80} autoComplete="off" placeholder="Clinique, salon…" {...text('organization')} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-phone`}>Téléphone</label>
          <input className="input" type="tel" maxLength={20} autoComplete="off" {...text('phone')} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-email`}>E-mail</label>
          <input className="input" type="email" maxLength={120} autoComplete="off" {...text('email')} />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-address`}>Adresse</label>
          <input className="input" maxLength={200} autoComplete="off" {...text('address')} />
        </div>
        <div className="field span-2">
          <label htmlFor={`${prefix}-notes`}>Notes</label>
          <textarea className="input" maxLength={1000} placeholder="Horaires, accès, numéro client…" {...text('notes')} />
        </div>
        {form.kind === 'veterinaire' && (
          <label className="check span-2">
            <input
              type="checkbox"
              checked={form.primary}
              onChange={(e) => setForm((f) => ({ ...f, primary: e.target.checked }))}
            />
            Vétérinaire référent
          </label>
        )}
      </div>
      {save.isError && (
        <p className="alert" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

function ContactItem({ contact, onEdit }: { contact: Contact; onEdit: () => void }) {
  const remove = useDeleteContact();
  return (
    <li className="list-item contact">
      <div className="contact-body">
        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <strong>{contact.name}</strong>
          {contact.primary && <span className="badge">Référent</span>}
        </span>
        <span className="hint">
          {[CONTACT_KIND_LABELS[contact.kind], contact.organization].filter(Boolean).join(' · ')}
        </span>
        {contact.address && <span className="hint">{contact.address}</span>}
        {contact.notes && <span className="hint">{contact.notes}</span>}
        {remove.isError && (
          <span className="alert" role="alert">
            {errorMessage(remove.error)}
          </span>
        )}
      </div>
      <div className="contact-actions">
        {contact.phone && (
          <a className="icon-btn" href={telHref(contact.phone)} aria-label={`Appeler ${contact.name} au ${contact.phone}`}>
            <Icon name="phone" size={18} />
          </a>
        )}
        {contact.email && (
          <a className="icon-btn" href={`mailto:${contact.email}`} aria-label={`Écrire à ${contact.name}`}>
            <Icon name="mail" size={18} />
          </a>
        )}
        <button type="button" className="icon-btn" aria-label={`Modifier ${contact.name}`} onClick={onEdit}>
          <Icon name="edit" size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Supprimer ${contact.name}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Supprimer le contact « ${contact.name} » ?`)) remove.mutate(contact.id);
          }}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
    </li>
  );
}

export function Contacts() {
  const contacts = useContacts();
  /** 'new' pour un ajout, l'identifiant du contact en cours de modification, ou null. */
  const [editing, setEditing] = useState<string | null>(null);
  const list = contacts.data ?? [];

  return (
    <section className="card stack" aria-labelledby="contacts-title">
      <div className="section-head">
        <h2 id="contacts-title">Contacts</h2>
        {editing === null && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> Ajouter
          </button>
        )}
      </div>
      {contacts.isError && (
        <p className="alert" role="alert">
          {errorMessage(contacts.error)}
        </p>
      )}
      {editing === 'new' && <ContactForm onDone={() => setEditing(null)} />}
      {contacts.isSuccess && list.length === 0 && editing !== 'new' && (
        <p className="muted">Ajoute le vétérinaire d’Eko, puis le toiletteur, la pension ou l’éducateur.</p>
      )}
      {list.length > 0 && (
        <ul className="list">
          {list.map((contact) =>
            editing === contact.id ? (
              <li key={contact.id} className="list-item">
                <ContactForm contact={contact} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <ContactItem key={contact.id} contact={contact} onEdit={() => setEditing(contact.id)} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}
