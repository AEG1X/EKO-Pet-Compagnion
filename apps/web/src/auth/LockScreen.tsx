import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Brand } from '../components/Icon';
import { ApiError, api, errorMessage } from '../lib/api';
import { loginWithPasskey } from '../lib/webauthn';
import { PinPad } from './PinPad';

export function LockScreen({ displayName }: { displayName: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);

  async function unlock(pin: string) {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/unlock', { method: 'POST', body: { pin } });
      await queryClient.invalidateQueries();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'pin_locked' && e.retryAfter) {
        const minutes = Math.ceil(e.retryAfter / 60);
        setError(`Trop d’erreurs. Réessaie dans ${minutes} min ou utilise ta passkey.`);
      } else {
        setError(errorMessage(e));
      }
      setFailures((n) => n + 1);
      if (e instanceof ApiError && e.status === 401 && e.code === 'unauthenticated') {
        await queryClient.invalidateQueries();
      }
    } finally {
      setBusy(false);
    }
  }

  async function usePasskey() {
    setError(null);
    try {
      await loginWithPasskey();
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <Brand />
        <div className="stack">
          <h1>EKO est verrouillé</h1>
          <p className="muted">Bonjour {displayName}, saisis ton PIN pour continuer.</p>
        </div>
        <PinPad
          onComplete={unlock}
          disabled={busy}
          error={error}
          errorKey={failures}
          extraKey={{ label: 'Passkey', onPress: usePasskey }}
        />
      </div>
    </main>
  );
}
