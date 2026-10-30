import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Brand, Icon } from '../components/Icon';
import { api, errorMessage } from '../lib/api';
import { loginWithPasskey, passkeysSupported } from '../lib/webauthn';

export function LoginScreen({ notice }: { notice?: string | undefined }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'passkey' | 'recovery'>('passkey');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function submitRecovery(event: FormEvent) {
    event.preventDefault();
    void run(() => api('/auth/recovery', { method: 'POST', body: { code } }));
  }

  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <Brand />
        <div className="stack">
          <h1>Bon retour !</h1>
          <p className="muted">Toute la vie d&apos;Eko, au même endroit.</p>
        </div>
        {notice && <p className="notice">{notice}</p>}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {mode === 'passkey' ? (
          <div className="stack">
            <button
              className="btn btn-primary btn-block"
              disabled={busy || !passkeysSupported()}
              onClick={() => run(loginWithPasskey)}
            >
              <Icon name="key" /> {busy ? 'Connexion…' : 'Se connecter avec ma passkey'}
            </button>
            <button className="btn btn-ghost" onClick={() => setMode('recovery')}>
              J&apos;ai perdu mon appareil
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={submitRecovery}>
            <div className="field">
              <label htmlFor="code">Code de secours</label>
              <input
                id="code"
                className="input"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <span className="hint">Tu pourras ensuite enregistrer une nouvelle passkey.</span>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy}>
              Utiliser ce code
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setMode('passkey')}>
              Revenir à la passkey
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
