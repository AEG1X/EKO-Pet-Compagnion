import { MEDAL_GALLERY_MAX, type MedalSettings, type MedalStatus, type PublicMedal } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { encode } from 'uqr';
import { Icon } from '../../components/Icon';
import { Page, QueryError, Section } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { useAlbums } from '../memories/queries';
import { useDog } from '../profile/queries';
import { LostSection } from './LostSection';
import { useDeactivateMedal, useMedal, useNewMedalLink, usePublicPreview, useSaveMedalSettings } from './queries';

// ---------------------------------------------------------------- QR code

/** Chemin SVG du QR code : un carré par module, marge de 4 modules (norme). */
function qrPath(url: string) {
  const { data, size } = encode(url, { ecc: 'Q', border: 4 });
  let d = '';
  data.forEach((row, y) =>
    row.forEach((on, x) => {
      if (on) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { d, size };
}

function qrSvgFile(url: string) {
  const { d, size } = qrPath(url);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function QrCode({ url }: { url: string }) {
  const { d, size } = useMemo(() => qrPath(url), [url]);
  return (
    <svg className="qr" viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code de la médaille">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function download(name: string, content: string, type: string) {
  const href = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

// ---------------------------------------------------------------- Adresse et QR

function LinkSection({ status }: { status: MedalStatus }) {
  const create = useNewMedalLink();
  const deactivate = useDeactivateMedal();
  const [copied, setCopied] = useState(false);
  const url = status.url;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (!url) {
    return (
      <Section title="Médaille inactive">
        <p>
          Active la médaille pour obtenir l’adresse de la fiche publique, son QR code à faire graver et l’adresse à écrire dans la
          puce NFC. Les deux mènent à la même page.
        </p>
        <p className="hint">Tant qu’elle est inactive, personne ne peut voir la fiche.</p>
        <QueryError error={create.error} />
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate(undefined)}>
            <Icon name="tag" size={18} /> Activer la médaille
          </button>
        </div>
      </Section>
    );
  }

  return (
    <Section title="Ta médaille">
      <div className="medal-link">
        <QrCode url={url} />
        <div className="stack" style={{ gap: 8, minWidth: 0 }}>
          <label htmlFor="medal-url" className="eyebrow">
            Adresse de la fiche publique
          </label>
          <input id="medal-url" className="input" readOnly value={url} onFocus={(e) => e.target.select()} />
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? 'Copiée' : 'Copier l’adresse'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => download('eko-medaille-qr.svg', qrSvgFile(url), 'image/svg+xml')}>
              <Icon name="download" size={18} /> QR code (SVG)
            </button>
            <a className="btn btn-ghost" href={url} target="_blank" rel="noreferrer">
              Voir la fiche
            </a>
          </div>
          <p className="hint">
            {status.scanCount === 0
              ? 'Pas encore consultée.'
              : `Consultée ${status.scanCount} fois, la dernière le ${formatDate(status.lastScanAt!.slice(0, 10))}.`}
          </p>
        </div>
      </div>
      <details className="medal-help">
        <summary>Graver le QR code et écrire la puce NFC</summary>
        <ol>
          <li>Télécharge le QR code (SVG) et envoie-le au graveur : le format vectoriel reste net à toutes les tailles.</li>
          <li>
            Pour la puce NFC, installe une application comme « NFC Tools », choisis « Écrire », ajoute un enregistrement « URL » avec
            l’adresse ci-dessus, puis approche la médaille du téléphone.
          </li>
          <li>Teste ensuite les deux avec un autre téléphone : la fiche doit s’ouvrir.</li>
        </ol>
      </details>
      <QueryError error={create.error ?? deactivate.error} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={create.isPending}
          onClick={() => {
            if (window.confirm('Remplacer l’adresse ? La médaille actuelle cessera aussitôt de fonctionner : il faudra en graver une nouvelle.')) {
              create.mutate(undefined);
            }
          }}
        >
          Remplacer l’adresse
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={deactivate.isPending}
          onClick={() => {
            if (window.confirm('Désactiver la médaille ? La fiche publique ne s’affichera plus tant que tu ne la réactives pas.')) {
              deactivate.mutate(undefined);
            }
          }}
        >
          Désactiver
        </button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- Réglages

type Form = Omit<MedalSettings, 'phone' | 'ownerName' | 'emergencyInfo' | 'message'> & {
  phone: string;
  ownerName: string;
  emergencyInfo: string;
  message: string;
};

function toForm(s: MedalSettings): Form {
  return { ...s, phone: s.phone ?? '', ownerName: s.ownerName ?? '', emergencyInfo: s.emergencyInfo ?? '', message: s.message ?? '' };
}

const TOGGLES: { key: 'showPhoto' | 'showAge' | 'showArea' | 'showVet'; label: string; hint: string }[] = [
  { key: 'showPhoto', label: 'Photo', hint: 'La photo du profil.' },
  { key: 'showAge', label: 'Âge', hint: 'Calculé depuis la date de naissance.' },
  { key: 'showArea', label: 'Secteur de résidence', hint: 'Le secteur du profil (ville ou quartier), jamais l’adresse.' },
  { key: 'showVet', label: 'Vétérinaire référent', hint: 'Nom, adresse et téléphone du cabinet.' },
];

function SettingsSection({ status }: { status: MedalStatus }) {
  const save = useSaveMedalSettings();
  const albums = useAlbums();
  const [form, setForm] = useState<Form>(() => toForm(status.settings));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(toForm(status.settings));
  }, [status.settings]);

  const text = (key: 'phone' | 'ownerName' | 'emergencyInfo' | 'message') => (e: { target: { value: string } }) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: e.target.value }));
  };
  const toggle = (key: keyof Form) => () => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: !f[key] }));
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(form, { onSuccess: () => setSaved(true) });
  }

  return (
    <Section title="Ce que la fiche affiche">
      <form className="stack" onSubmit={submit} aria-label="Réglages de la fiche publique">
        <p className="hint">Le nom, la race et le sexe sont toujours affichés. L’adresse, le numéro de puce et les documents ne le sont jamais.</p>
        <ul className="list">
          {TOGGLES.map((t) => (
            <li key={t.key} className="list-item">
              <label className="check" style={{ flexGrow: 1 }}>
                <input type="checkbox" checked={form[t.key]} onChange={toggle(t.key)} />
                <span>
                  {t.label}
                  <span className="hint" style={{ display: 'block', fontWeight: 400 }}>
                    {t.hint}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <fieldset className="medal-phone">
          <legend>Numéro à appeler</legend>
          <label className="check">
            <input type="checkbox" checked={form.showPhone} onChange={toggle('showPhone')} />
            <span>Afficher mon numéro avec un bouton d’appel</span>
          </label>
          <p className="notice">
            Toute personne qui scanne la médaille verra ce numéro. Tu peux le masquer ici à tout moment : la fiche est mise à jour
            immédiatement.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="medal-phone">Téléphone</label>
              <input id="medal-phone" className="input" type="tel" autoComplete="tel" placeholder="06 12 34 56 78" value={form.phone} onChange={text('phone')} />
            </div>
            <div className="field">
              <label htmlFor="medal-owner">Prénom (facultatif)</label>
              <input id="medal-owner" className="input" maxLength={40} placeholder="Johan" value={form.ownerName} onChange={text('ownerName')} />
            </div>
          </div>
          {form.showPhone && !form.phone.trim() && <p className="hint">Indique un numéro pour qu’il apparaisse.</p>}
        </fieldset>

        <div className="field">
          <label htmlFor="medal-emergency">Informations médicales d’urgence</label>
          <textarea
            id="medal-emergency"
            className="input"
            maxLength={500}
            placeholder="Allergie, traitement à ne pas interrompre, peur des bruits…"
            value={form.emergencyInfo}
            onChange={text('emergencyInfo')}
          />
        </div>
        <div className="field">
          <label htmlFor="medal-message">Message pour la personne qui le trouve</label>
          <textarea
            id="medal-message"
            className="input"
            maxLength={300}
            placeholder="Je suis gentil mais craintif, parle-moi doucement."
            value={form.message}
            onChange={text('message')}
          />
        </div>

        <div className="field">
          <label htmlFor="medal-album">Photos affichées sur la fiche</label>
          <select
            id="medal-album"
            className="input"
            value={form.albumId ?? ''}
            onChange={(e) => {
              setSaved(false);
              setForm((f) => ({ ...f, albumId: e.target.value || null }));
            }}
          >
            <option value="">Aucune</option>
            {albums.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
          <p className="hint">
            Les {MEDAL_GALLERY_MAX} plus récentes de l’album, en aperçu (jamais les originaux). Crée un album dédié dans{' '}
            <Link to="/souvenirs/albums">Souvenirs › Albums</Link> pour choisir exactement ce qui est visible.
          </p>
        </div>

        {save.isError && (
          <p className="alert" role="alert">
            {errorMessage(save.error)}
          </p>
        )}
        <div className="form-actions">
          {saved && (
            <span className="hint" role="status">
              <Icon name="check" size={16} /> Fiche mise à jour
            </span>
          )}
          <button className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------- Aperçu

function Preview({ medal, photoUrl }: { medal: PublicMedal; photoUrl: string | null }) {
  const facts = [medal.breed, medal.sex, medal.age].filter(Boolean).join(' · ');
  return (
    <Section title="Aperçu de la fiche">
      <div className="medal-preview">
        <div className="medal-preview-hero">
          {medal.hasPhoto && photoUrl ? <img src={photoUrl} alt="" /> : <span aria-hidden="true">🐾</span>}
          <strong>{medal.name}</strong>
          {facts && <span>{facts}</span>}
          {medal.area && <span>J’habite à {medal.area}</span>}
        </div>
        <ul className="medal-preview-list">
          <li>{medal.owner ? `Bouton d’appel : ${medal.owner.phone}` : 'Pas de numéro affiché : la fiche invite à passer chez un vétérinaire.'}</li>
          {medal.emergencyInfo && <li>Santé : {medal.emergencyInfo}</li>}
          {medal.vet && <li>Vétérinaire : {medal.vet.organization ?? medal.vet.name}</li>}
          {medal.message && <li>Message : {medal.message}</li>}
        </ul>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- Page

export function MedalPage() {
  const dog = useDog();
  const hasDog = dog.isSuccess && Boolean(dog.data);
  const medal = useMedal();
  const preview = usePublicPreview();

  return (
    <Page title="Médaille et mode perdu" needsDog={dog.isSuccess && !dog.data}>
      <QueryError error={medal.error} />
      {hasDog && medal.data && (
        <>
          <LinkSection status={medal.data} />
          <LostSection dogName={dog.data!.name} medalActive={Boolean(medal.data.url)} />
          <SettingsSection status={medal.data} />
          {preview.data && <Preview medal={preview.data} photoUrl={dog.data?.photoUrl ?? null} />}
        </>
      )}
    </Page>
  );
}
