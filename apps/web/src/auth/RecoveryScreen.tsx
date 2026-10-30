import { type FormEvent, useState } from 'react';
import { Brand } from '../components/Icon';
import { errorMessage } from '../lib/api';
import { guessDeviceLabel, registerPasskey } from '../lib/webauthn';

/** Session ouverte par un code de secours : seule action possible, enregistrer une nouvelle passkey. */
export function RecoveryScreen({ onRelogin }: { onRelogin: () => void }) {
  const [label, setLabel] = useState(guessDeviceLabel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await registerPasskey('/passkeys/options', '/passkeys/verify', {}, { label: label.trim() });
      onRelogin();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={submit}>
        <Brand />
        <div className="stack">
          <h1>Nouvel appareil</h1>
          <p className="muted">
            Enregistre une passkey sur cet appareil. Par sécurité, toutes les autres connexions seront fermées.
          </p>
        </div>
        <div className="field">
          <label htmlFor="label">Nom de l&apos;appareil</label>
          <input id="label" className="input" required maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Enregistrement…' : 'Enregistrer ma passkey'}
        </button>
      </form>
    </main>
  );
}
