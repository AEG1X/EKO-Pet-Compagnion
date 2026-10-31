import { ACCENTS, ACCENT_IDS, type DashboardSection, type PasskeySummary, type Settings, type Theme } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useOwner } from '../../app/AppGate';
import { PinSetupForm } from '../../auth/PinSetupScreen';
import { RecoveryCodes } from '../../auth/RecoveryCodes';
import { Notifications } from './Notifications';
import { meKey } from '../../auth/queries';
import { Icon } from '../../components/Icon';
import { api, errorMessage } from '../../lib/api';
import { applyAppearance } from '../../lib/theme';
import { guessDeviceLabel, registerPasskey } from '../../lib/webauthn';

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'Automatique' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

const SECTION_LABELS: Record<DashboardSection, string> = {
  sante: 'Santé',
  alimentation: 'Alimentation',
  education: 'Éducation',
  souvenirs: 'Souvenirs',
  depenses: 'Dépenses',
  documents: 'Documents',
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });

function Appearance() {
  const me = useOwner();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (patch: Partial<Settings>) => api<Settings>('/settings', { method: 'PATCH', body: patch }),
    onMutate: (patch) => {
      const next = { ...me.settings, ...patch };
      applyAppearance(next.theme, next.accent);
      queryClient.setQueryData(meKey, { ...me, settings: next });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: meKey }),
  });
  const { theme, accent, sectionOrder } = me.settings;

  function move(index: number, delta: -1 | 1) {
    const next = [...sectionOrder];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    save.mutate({ sectionOrder: next });
  }

  return (
    <section className="card stack" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Apparence</h2>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow" id="theme-label">
          Thème
        </span>
        <div className="segmented" role="group" aria-labelledby="theme-label">
          {THEMES.map((t) => (
            <button key={t.value} type="button" aria-pressed={theme === t.value} onClick={() => save.mutate({ theme: t.value })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow" id="accent-label">
          Couleur d&apos;accent
        </span>
        <div className="row-wrap" role="group" aria-labelledby="accent-label">
          {ACCENT_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className="swatch"
              aria-pressed={accent === id}
              aria-label={ACCENTS[id].label}
              title={ACCENTS[id].label}
              style={{ background: ACCENTS[id].light }}
              onClick={() => save.mutate({ accent: id })}
            />
          ))}
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Ordre des sections du tableau de bord</span>
        <ol className="list">
          {sectionOrder.map((id, index) => (
            <li key={id} className="list-item">
              <span style={{ flexGrow: 1, fontWeight: 600 }}>{SECTION_LABELS[id]}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Monter ${SECTION_LABELS[id]}`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <Icon name="up" size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Descendre ${SECTION_LABELS[id]}`}
                disabled={index === sectionOrder.length - 1}
                onClick={() => move(index, 1)}
              >
                <Icon name="down" size={18} />
              </button>
            </li>
          ))}
        </ol>
      </div>
      {save.isError && (
        <p className="alert" role="alert">
          {errorMessage(save.error)}
        </p>
      )}
    </section>
  );
}

function Passkeys() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ['passkeys'], queryFn: () => api<PasskeySummary[]>('/passkeys') });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    const label = window.prompt('Nom de cet appareil', guessDeviceLabel());
    if (!label) return;
    setBusy(true);
    setError(null);
    try {
      await registerPasskey('/passkeys/options', '/passkeys/verify', {}, { label: label.trim().slice(0, 60) });
      await queryClient.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(passkey: PasskeySummary) {
    if (!window.confirm(`Supprimer la passkey « ${passkey.label} » ? Cet appareil ne pourra plus se connecter.`)) return;
    setError(null);
    try {
      await api(`/passkeys/${encodeURIComponent(passkey.id)}`, { method: 'DELETE' });
      await queryClient.invalidateQueries({ queryKey: ['passkeys'] });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="card-title">
        <span className="eyebrow">Passkeys</span>
        <button type="button" className="btn btn-ghost" onClick={add} disabled={busy}>
          <Icon name="plus" size={18} /> Ajouter cet appareil
        </button>
      </div>
      <ul className="list">
        {list.data?.map((p) => (
          <li key={p.id} className="list-item">
            <span className="icon-tile">
              <Icon name="key" />
            </span>
            <span style={{ flexGrow: 1 }}>
              <strong>{p.label}</strong>
              <br />
              <span className="hint">
                Ajoutée le {dateFormat.format(new Date(p.createdAt))}
                {p.lastUsedAt ? ` · utilisée le ${dateFormat.format(new Date(p.lastUsedAt))}` : ''}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-danger"
              disabled={(list.data?.length ?? 0) <= 1}
              onClick={() => remove(p)}
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Security() {
  const queryClient = useQueryClient();
  const [changingPin, setChangingPin] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const remaining = useQuery({
    queryKey: ['recovery-codes'],
    queryFn: () => api<{ remaining: number }>('/recovery-codes'),
  });

  async function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <section className="card stack" aria-labelledby="security-title">
      <h2 id="security-title">Sécurité</h2>
      <Passkeys />

      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Code PIN</span>
        {changingPin ? (
          <PinSetupForm
            onDone={() => {
              setChangingPin(false);
              setMessage('PIN modifié.');
            }}
          />
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => setChangingPin(true)}>
            <Icon name="lock" size={18} /> Changer mon PIN
          </button>
        )}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Codes de secours</span>
        {codes ? (
          <RecoveryCodes codes={codes} doneLabel="Terminé" onDone={() => setCodes(null)} />
        ) : (
          <>
            <p className="hint">
              {remaining.data ? `${remaining.data.remaining} code(s) encore utilisable(s).` : ' '}
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                run(async () => {
                  if (!window.confirm('Générer de nouveaux codes ? Les anciens ne fonctionneront plus.')) return;
                  const result = await api<{ recoveryCodes: string[] }>('/recovery-codes/regenerate', {
                    method: 'POST',
                    body: {},
                  });
                  setCodes(result.recoveryCodes);
                  await queryClient.invalidateQueries({ queryKey: ['recovery-codes'] });
                })
              }
            >
              Générer de nouveaux codes
            </button>
          </>
        )}
      </div>

      <div className="row-wrap">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() =>
            run(async () => {
              await api('/sessions/revoke-others', { method: 'POST', body: {} });
              setMessage('Les autres appareils ont été déconnectés.');
            })
          }
        >
          Déconnecter les autres appareils
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() =>
            run(async () => {
              await api('/auth/logout', { method: 'POST', body: {} });
              await queryClient.invalidateQueries();
            })
          }
        >
          <Icon name="logout" size={18} /> Se déconnecter
        </button>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="topbar">
        <h1>Réglages</h1>
      </header>
      <Appearance />
      <Notifications />
      <Security />
    </div>
  );
}
