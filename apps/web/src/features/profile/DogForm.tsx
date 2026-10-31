import { type Dog, type DogInput, SEX_LABELS } from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { Icon } from '../../components/Icon';
import { errorMessage } from '../../lib/api';
import { useSaveDog } from './queries';

type FormState = Record<
  'name' | 'breed' | 'sex' | 'birthDate' | 'neutered' | 'coat' | 'chipNumber' | 'passportNumber' | 'address' | 'area' | 'notes',
  string
>;

function toForm(dog: Dog | null): FormState {
  return {
    name: dog?.name ?? '',
    breed: dog?.breed ?? '',
    sex: dog?.sex ?? '',
    birthDate: dog?.birthDate ?? '',
    neutered: dog?.neutered == null ? '' : dog.neutered ? 'oui' : 'non',
    coat: dog?.coat ?? '',
    chipNumber: dog?.chipNumber ?? '',
    passportNumber: dog?.passportNumber ?? '',
    address: dog?.address ?? '',
    area: dog?.area ?? '',
    notes: dog?.notes ?? '',
  };
}

function toInput(form: FormState): DogInput {
  return {
    name: form.name,
    breed: form.breed,
    sex: form.sex === 'male' || form.sex === 'femelle' ? form.sex : null,
    birthDate: form.birthDate || null,
    neutered: form.neutered === '' ? null : form.neutered === 'oui',
    coat: form.coat,
    chipNumber: form.chipNumber,
    passportNumber: form.passportNumber,
    address: form.address,
    area: form.area,
    notes: form.notes,
  };
}

/** Création ou modification du profil. Les champs privés sont regroupés et signalés comme tels. */
export function DogForm({ dog, onDone }: { dog: Dog | null; onDone?: () => void }) {
  const [form, setForm] = useState(() => toForm(dog));
  const save = useSaveDog();
  const today = new Date().toISOString().slice(0, 10);

  function field(name: keyof FormState) {
    return {
      id: `dog-${name}`,
      name,
      value: form[name],
      onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value })),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate(toInput(form), { onSuccess: () => onDone?.() });
  }

  return (
    <form className="stack" onSubmit={submit} noValidate={false}>
      <section className="card stack" aria-labelledby="identity-title">
        <h2 id="identity-title">Identité</h2>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="dog-name">Nom</label>
            <input className="input" required maxLength={40} autoComplete="off" placeholder="Eko" {...field('name')} />
          </div>
          <div className="field">
            <label htmlFor="dog-breed">Race</label>
            <input className="input" maxLength={60} autoComplete="off" placeholder="Eurasier" {...field('breed')} />
          </div>
          <div className="field">
            <label htmlFor="dog-sex">Sexe</label>
            <select className="input" {...field('sex')}>
              <option value="">Non renseigné</option>
              <option value="male">{SEX_LABELS.male}</option>
              <option value="femelle">{SEX_LABELS.femelle}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dog-birthDate">Date de naissance</label>
            <input className="input" type="date" max={today} {...field('birthDate')} />
          </div>
          <div className="field">
            <label htmlFor="dog-neutered">Stérilisé</label>
            <select className="input" {...field('neutered')}>
              <option value="">Non renseigné</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dog-coat">Robe</label>
            <input className="input" maxLength={60} autoComplete="off" placeholder="Fauve, loup, noir…" {...field('coat')} />
          </div>
          <div className="field span-2">
            <label htmlFor="dog-area">Secteur de résidence</label>
            <input className="input" maxLength={80} autoComplete="off" placeholder="Quartier ou ville" {...field('area')} />
            <span className="hint">Assez vague pour pouvoir figurer plus tard sur la fiche publique de la médaille.</span>
          </div>
        </div>
      </section>

      <section className="card stack" aria-labelledby="private-title">
        <div className="row">
          <Icon name="lock" size={20} />
          <h2 id="private-title">Informations privées</h2>
        </div>
        <p className="hint">Visibles uniquement par toi, jamais publiées sur la fiche de la médaille.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="dog-chipNumber">Numéro de puce</label>
            <input className="input" inputMode="numeric" maxLength={30} autoComplete="off" {...field('chipNumber')} />
          </div>
          <div className="field">
            <label htmlFor="dog-passportNumber">Numéro de passeport</label>
            <input className="input" maxLength={30} autoComplete="off" {...field('passportNumber')} />
          </div>
          <div className="field span-2">
            <label htmlFor="dog-address">Adresse</label>
            <input className="input" maxLength={200} autoComplete="street-address" {...field('address')} />
          </div>
          <div className="field span-2">
            <label htmlFor="dog-notes">Notes</label>
            <textarea className="input" maxLength={2000} {...field('notes')} />
          </div>
        </div>
      </section>

      {save.isError && (
        <p className="alert" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="form-actions">
        {onDone && dog && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Annuler
          </button>
        )}
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Enregistrement…' : dog ? 'Enregistrer' : 'Créer le profil'}
        </button>
      </div>
    </form>
  );
}
