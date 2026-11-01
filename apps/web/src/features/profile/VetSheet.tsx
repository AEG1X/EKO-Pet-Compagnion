import {
  CONTACT_KIND_LABELS,
  type Contact,
  type Dog,
  HEALTH_EVENT_LABELS,
  MILESTONE_LABELS,
  PARENT_ROLE_LABELS,
  type Parent,
  SEX_LABELS,
  formatAge,
  litterMilestones,
} from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { Icon } from '../../components/Icon';
import { QueryError } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/dates';
import { useHealthEvents } from '../health/queries';
import { milestoneDate } from './Litter';
import { useLitter, useParents } from './litterQueries';
import { parentFullName, testSummary } from './Parents';
import { ofName } from './ProfilePage';
import { useContacts, useDog } from './queries';

/** Ligne « libellé : valeur », omise quand la valeur manque : une fiche courte se lit mieux. */
function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ContactLine({ contact }: { contact: Contact }) {
  return (
    <li>
      <strong>{contact.name}</strong>
      {' · '}
      {[CONTACT_KIND_LABELS[contact.kind], contact.organization, contact.phone, contact.email].filter(Boolean).join(' · ')}
    </li>
  );
}

function ParentBlock({ parent }: { parent: Parent }) {
  return (
    <section className="sheet-block" aria-labelledby={`sheet-${parent.role}`}>
      <h2 id={`sheet-${parent.role}`}>
        {PARENT_ROLE_LABELS[parent.role]} : {parentFullName(parent)}
      </h2>
      <dl className="facts">
        <Row label="Race" value={parent.breed} />
        <Row label="Naissance" value={parent.birthDate ? `${formatDate(parent.birthDate)} (${formatAge(parent.birthDate)})` : null} />
        <Row label="Robe" value={parent.coat} />
        <Row label="N° LOF" value={parent.registration} />
        <Row label="N° de puce" value={parent.chipNumber} />
        <Row label="Cotation, titres" value={parent.titles} />
        <Row label="Pedigree" value={parent.pedigreeUrl} />
      </dl>
      {parent.tests.length > 0 && (
        <table className="sheet-table">
          <caption className="eyebrow">Tests de santé</caption>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {parent.tests.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  {testSummary(t) || '—'}
                  {t.document && <span className="hint"> · justificatif : {t.document.title}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {parent.notes && <p style={{ whiteSpace: 'pre-line' }}>{parent.notes}</p>}
    </section>
  );
}

function birthLine(dog: Dog, estimate: ReturnType<typeof litterMilestones>[number] | undefined): string | null {
  if (dog.birthDate) return `${formatDate(dog.birthDate)} (${formatAge(dog.birthDate)})`;
  if (estimate) return `Pas encore né · naissance estimée ${estimate.approximate ? milestoneDate(estimate) : `le ${milestoneDate(estimate)}`}`;
  return 'Pas encore né';
}

/** Fiche récapitulative à montrer ou imprimer chez le vétérinaire : chiot, portée, parents et contacts. */
export function VetSheetPage() {
  const dog = useDog();
  const litter = useLitter(dog.isSuccess && Boolean(dog.data));
  const parents = useParents();
  const contacts = useContacts();
  const events = useHealthEvents();

  if (dog.isPending) return <p className="muted">Chargement…</p>;
  if (!dog.data) {
    return (
      <p className="notice">
        Crée d’abord le profil de ton chien depuis la page <Link to="/profil">Profil</Link>.
      </p>
    );
  }
  const d = dog.data;
  const milestones = litterMilestones(litter.data ?? null, d.birthDate);
  const estimate = milestones.find((m) => m.kind === 'naissance');
  const care = (events.data ?? []).slice(0, 12);
  const useful = (contacts.data ?? []).filter((c) => c.kind === 'veterinaire' || c.kind === 'urgences' || c.kind === 'eleveur');
  const neutered = d.neutered == null ? null : d.neutered ? 'Oui' : 'Non';

  return (
    <article className="stack vet-sheet" style={{ gap: 20 }}>
      <header className="topbar no-print">
        <Link to="/profil" className="icon-btn" aria-label="Retour au profil">
          <Icon name="back" size={20} />
        </Link>
        <h1>Fiche vétérinaire</h1>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="download" size={18} /> Imprimer ou PDF
        </button>
      </header>
      <QueryError error={litter.error ?? parents.error ?? contacts.error ?? events.error} />

      <div className="card stack sheet">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">Fiche {ofName(d.name)}</p>
            <h2 className="sheet-title">{d.name}</h2>
          </div>
          <p className="hint">Éditée le {formatDate(todayIso())}</p>
        </div>

        <section className="sheet-block" aria-labelledby="sheet-dog">
          <h2 id="sheet-dog">Chiot</h2>
          <dl className="facts">
            <Row label="Race" value={d.breed} />
            <Row label="Sexe" value={d.sex ? SEX_LABELS[d.sex] : null} />
            <Row label="Naissance" value={birthLine(d, estimate)} />
            <Row label="Robe" value={d.coat} />
            <Row label="Stérilisé" value={neutered} />
            <Row label="N° de puce" value={d.chipNumber} />
            <Row label="N° de passeport" value={d.passportNumber} />
          </dl>
          {d.notes && <p style={{ whiteSpace: 'pre-line' }}>{d.notes}</p>}
        </section>

        {milestones.length > 0 && (
          <section className="sheet-block" aria-labelledby="sheet-litter">
            <h2 id="sheet-litter">Portée</h2>
            <dl className="facts">
              {milestones.map((m) => (
                <Row
                  key={m.kind}
                  label={MILESTONE_LABELS[m.kind]}
                  value={`${milestoneDate(m)}${m.estimated && !m.approximate ? ' (estimation)' : ''}`}
                />
              ))}
              <Row label="Échographie" value={litter.data?.ultrasoundResult} />
            </dl>
          </section>
        )}

        {care.length > 0 && (
          <section className="sheet-block" aria-labelledby="sheet-care">
            <h2 id="sheet-care">Derniers soins</h2>
            <table className="sheet-table">
              <tbody>
                {care.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.date)}</td>
                    <td>
                      {HEALTH_EVENT_LABELS[e.kind]} : {e.title}
                      {e.nextDueDate ? <span className="hint"> · à refaire le {formatDate(e.nextDueDate)}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {(parents.data ?? []).map((p) => (
          <ParentBlock key={p.id} parent={p} />
        ))}
        {parents.isSuccess && parents.data.length === 0 && (
          <p className="muted no-print">Ajoute la mère et le père depuis le profil pour les voir ici.</p>
        )}

        {useful.length > 0 && (
          <section className="sheet-block" aria-labelledby="sheet-contacts">
            <h2 id="sheet-contacts">Contacts</h2>
            <ul className="sheet-contacts">
              {useful.map((c) => (
                <ContactLine key={c.id} contact={c} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </article>
  );
}
