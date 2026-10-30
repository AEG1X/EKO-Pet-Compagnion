import { SECURITY } from '@eko/shared';
import { useEffect, useRef } from 'react';

const IDLE_MS = SECURITY.IDLE_LOCK_MINUTES * 60 * 1000;
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Verrouille l'application après 5 minutes sans interaction, ou au retour
 * si elle est restée en arrière-plan plus longtemps. Le serveur applique la même règle.
 */
export function useIdleLock(enabled: boolean, onIdle: () => void) {
  const last = useRef(Date.now());
  const callback = useRef(onIdle);
  callback.current = onIdle;

  useEffect(() => {
    if (!enabled) return;
    last.current = Date.now();
    const touch = () => {
      last.current = Date.now();
    };
    const check = () => {
      if (Date.now() - last.current >= IDLE_MS) callback.current();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    EVENTS.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(check, 15_000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, touch));
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [enabled]);
}
