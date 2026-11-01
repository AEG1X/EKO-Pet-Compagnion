import { type Dog, SEX_LABELS, formatAge } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon, Paw } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { Contacts } from './Contacts';
import { DogForm } from './DogForm';
import { DogAvatar, DogPhotoControls } from './DogPhoto';
import { LitterSection } from './Litter';
import { ParentsSection } from './Parents';
import { useDog } from './queries';

/** « de Max », mais « d’Eko » : élision devant une voyelle ou un h muet. */
export function ofName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûü]/i.test(name) ? `d’${name}` : `de ${name}`;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

/** « Eurasier · Mâle · 2 ans et 3 mois » : uniquement les éléments renseignés. */
export function dogSubtitle(dog: Dog): string {
  return [dog.breed, dog.sex ? SEX_LABELS[dog.sex] : null, dog.birthDate ? formatAge(dog.birthDate) : null]
    .filter(Boolean)
    .join(' · ');
}

/** Sous-titre d'un chien pas encore né : « Eurasier · à naître ». */
export function unbornSubtitle(dog: Dog): string {
  return [dog.breed, dog.sex ? SEX_LABELS[dog.sex] : null, 'à naître'].filter(Boolean).join(' · ');
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

function DogDetails({ dog, onEdit }: { dog: Dog; onEdit: () => void }) {
  const neutered = dog.neutered == null ? null : dog.neutered ? 'Oui' : 'Non';
  return (
    <>
      <section className="hero" aria-label={dog.name}>
        <span className="hero-paw">
          <Paw size={180} />
        </span>
        <div className="hero-identity">
          <DogAvatar dog={dog} size={96} />
          <div>
            <p className="hero-name">{dog.name}</p>
            <p>{dog.birthDate ? dogSubtitle(dog) || 'Profil à compléter' : unbornSubtitle(dog)}</p>
          </div>
        </div>
        <DogPhotoControls dog={dog} />
      </section>

      <section className="card stack" aria-labelledby="identity-title">
        <div className="section-head">
          <h2 id="identity-title">Identité</h2>
          <button type="button" className="btn btn-secondary" onClick={onEdit}>
            <Icon name="edit" size={18} /> Modifier
          </button>
        </div>
        <dl className="facts">
          <Fact label="Race" value={dog.breed} />
          <Fact label="Sexe" value={dog.sex ? SEX_LABELS[dog.sex] : null} />
          <Fact
            label="Date de naissance"
            value={dog.birthDate ? dateFormat.format(new Date(`${dog.birthDate}T00:00:00`)) : 'À naître'}
          />
          <Fact label="Stérilisé" value={neutered} />
          <Fact label="Robe" value={dog.coat} />
          <Fact label="Secteur de résidence" value={dog.area} />
        </dl>
      </section>

      <section className="card stack" aria-labelledby="private-title">
        <div className="row">
          <Icon name="lock" size={20} />
          <h2 id="private-title">Informations privées</h2>
        </div>
        <dl className="facts">
          <Fact label="Numéro de puce" value={dog.chipNumber} />
          <Fact label="Numéro de passeport" value={dog.passportNumber} />
          <Fact label="Adresse" value={dog.address} />
        </dl>
        {dog.notes && <p className="hint" style={{ whiteSpace: 'pre-line' }}>{dog.notes}</p>}
      </section>
    </>
  );
}

export function ProfilePage() {
  const dog = useDog();
  const [editing, setEditing] = useState(false);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="topbar">
        <h1>{dog.data ? `Profil ${ofName(dog.data.name)}` : 'Profil'}</h1>
      </header>

      {dog.isPending && <p className="muted">Chargement…</p>}
      {dog.isError && (
        <p className="alert" role="alert">
          {errorMessage(dog.error)}
        </p>
      )}

      {dog.isSuccess && !dog.data && (
        <>
          <p className="notice">
            Commence par l’identité de ton chien. Tout peut être complété ou corrigé plus tard.
          </p>
          <DogForm dog={null} />
        </>
      )}

      {dog.data &&
        (editing ? (
          <DogForm dog={dog.data} onDone={() => setEditing(false)} />
        ) : (
          <>
            <DogDetails dog={dog.data} onEdit={() => setEditing(true)} />
            <LitterSection dog={dog.data} />
            <ParentsSection defaultBreed={dog.data.breed} />
            <Contacts />
            <section className="card row" aria-labelledby="vet-sheet-title" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div className="stack" style={{ gap: 2 }}>
                <h2 id="vet-sheet-title">Fiche vétérinaire</h2>
                <span className="hint">Chiot, portée, parents, tests de santé et contacts sur une page, à montrer ou imprimer.</span>
              </div>
              <Link to="/profil/fiche" className="btn btn-secondary">
                <Icon name="file" size={18} /> Ouvrir la fiche
              </Link>
            </section>
          </>
        ))}
    </div>
  );
}
