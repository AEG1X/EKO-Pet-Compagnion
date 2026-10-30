import type { MeResponse } from '@eko/shared';
import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { LockScreen } from '../auth/LockScreen';
import { LoginScreen } from '../auth/LoginScreen';
import { PinSetupScreen } from '../auth/PinSetupScreen';
import { RecoveryScreen } from '../auth/RecoveryScreen';
import { SetupScreen } from '../auth/SetupScreen';
import { meKey, useMe, useSetupStatus } from '../auth/queries';
import { useIdleLock } from '../auth/useIdleLock';
import { Brand } from '../components/Icon';
import { api, errorMessage, onAuthError } from '../lib/api';
import { applyAppearance, watchSystemTheme } from '../lib/theme';

const MeContext = createContext<MeResponse | null>(null);

/** Propriétaire connecté et déverrouillé ; utilisable uniquement sous AppGate. */
export function useOwner(): MeResponse {
  const me = useContext(MeContext);
  if (!me) throw new Error('useOwner doit être utilisé sous AppGate');
  return me;
}

function Splash({ message }: { message?: string }) {
  return (
    <main className="auth-screen" aria-busy={!message}>
      <div className="auth-panel">
        <Brand />
        {message ? (
          <p className="alert" role="alert">
            {message}
          </p>
        ) : (
          <p className="muted">Chargement…</p>
        )}
      </div>
    </main>
  );
}

/**
 * Décide de l'écran à afficher : configuration initiale, connexion, récupération,
 * verrouillage, choix du PIN, ou l'application elle-même.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const setup = useSetupStatus();
  const me = useMe();
  const [notice, setNotice] = useState<string | undefined>();
  const data = me.data;

  useEffect(
    () =>
      onAuthError(() => {
        // Seulement si l'on se croyait connecté et déverrouillé : évite une boucle quand /me répond 401.
        const current = queryClient.getQueryData<MeResponse | null>(meKey);
        if (current && !current.locked) {
          void queryClient.invalidateQueries({ queryKey: meKey }, { cancelRefetch: false });
        }
      }),
    [queryClient],
  );

  useEffect(() => {
    if (data) applyAppearance(data.settings.theme, data.settings.accent);
  }, [data]);

  useEffect(() => watchSystemTheme(() => data?.settings.theme ?? 'system'), [data?.settings.theme]);

  const active = Boolean(data && data.sessionKind === 'full' && data.pinEnabled && !data.locked);
  useIdleLock(active, () => {
    void api('/auth/lock', { method: 'POST', body: {} }).finally(() =>
      queryClient.invalidateQueries({ queryKey: meKey }),
    );
  });

  if (setup.isPending || me.isPending) return <Splash />;
  if (setup.isError) return <Splash message={errorMessage(setup.error)} />;
  if (me.isError) return <Splash message={errorMessage(me.error)} />;
  if (setup.data.needsSetup) return <SetupScreen />;
  if (!data) return <LoginScreen notice={notice} />;
  if (data.sessionKind === 'recovery') {
    return (
      <RecoveryScreen
        onRelogin={() => {
          setNotice('Nouvelle passkey enregistrée. Connecte-toi avec elle.');
          void queryClient.invalidateQueries({ queryKey: meKey });
        }}
      />
    );
  }
  if (data.locked) return <LockScreen displayName={data.owner.displayName} />;
  if (!data.pinEnabled) return <PinSetupScreen />;
  return <MeContext.Provider value={data}>{children}</MeContext.Provider>;
}
