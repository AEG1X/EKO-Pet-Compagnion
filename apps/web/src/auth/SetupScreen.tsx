import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Brand } from '../components/Icon';
import { errorMessage } from '../lib/api';
import { passkeysSupported, registerPasskey } from '../lib/webauthn';
import { RecoveryCodes } from './RecoveryCodes';
import { meKey } from './queries';

/** Toute première ouverture : création du compte et de la première passkey. */
export function SetupScreen() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await registerPasskey<{ recoveryCodes: string[] }>(
        '/auth/setup/options',
        '/auth/setup/verify',
        { setupToken: setupToken.trim(), displayName: displayName.trim() },
      );
      setCodes(result.recoveryCodes);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    await queryClient.invalidateQueries();
  }

  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <Brand />
        {codes ? (
          <RecoveryCodes codes={codes} onDone={finish} />
        ) : (
          <form className="stack" onSubmit={submit}>
            <div className="stack">
              <h1>Bienvenue dans EKO</h1>
              <p className="muted">
                Crée ton compte. Ta connexion utilisera Face ID, Touch ID ou Windows Hello : aucun mot de passe à retenir.
              </p>
            </div>
            {!passkeysSupported() && (
              <p className="alert" role="alert">
                Ce navigateur ne gère pas les passkeys. Utilise Safari, Chrome, Edge ou Firefox à jour.
              </p>
            )}
            <div className="field">
              <label htmlFor="displayName">Ton prénom</label>
              <input
                id="displayName"
                className="input"
                autoComplete="given-name"
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="setupToken">Jeton de configuration</label>
              <input
                id="setupToken"
                className="input"
                autoComplete="off"
                spellCheck={false}
                required
                minLength={16}
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
              />
              <span className="hint">Défini lors du déploiement ; il ne sert qu&apos;une fois.</span>
            </div>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary btn-block" disabled={busy || !passkeysSupported()}>
              {busy ? 'Création…' : 'Créer ma passkey'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
