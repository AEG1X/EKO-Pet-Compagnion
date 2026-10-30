import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Brand } from '../components/Icon';
import { api, errorMessage } from '../lib/api';
import { PinPad } from './PinPad';

/** Choix (ou changement) du PIN : saisi deux fois pour éviter une faute de frappe. */
export function PinSetupForm({ onDone }: { onDone: () => void }) {
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(pin: string) {
    if (first === null) {
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError('Les deux saisies ne correspondent pas. Recommence.');
      return;
    }
    setBusy(true);
    try {
      await api('/pin', { method: 'PUT', body: { pin } });
      onDone();
    } catch (e) {
      setFirst(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <p className="muted" aria-live="polite">
        {first === null ? 'Choisis un code à 6 chiffres.' : 'Confirme ton code.'}
      </p>
      <PinPad key={first === null ? 'first' : 'second'} onComplete={handle} disabled={busy} error={error} />
    </div>
  );
}

export function PinSetupScreen() {
  const queryClient = useQueryClient();
  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <Brand />
        <div className="stack">
          <h1>Ton code PIN</h1>
          <p className="muted">
            Il protège EKO quand tu laisses l&apos;application ouverte : il sera demandé après 5 minutes d&apos;inactivité.
          </p>
        </div>
        <PinSetupForm onDone={() => void queryClient.invalidateQueries()} />
      </div>
    </main>
  );
}
