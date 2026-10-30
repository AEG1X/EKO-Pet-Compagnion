import { SECURITY } from '@eko/shared';
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Pavé numérique accessible : clavier physique, lecteur d'écran et tactile.
 * Appelle onComplete dès que les 6 chiffres sont saisis.
 */
export function PinPad({
  onComplete,
  disabled,
  error,
  errorKey,
  extraKey,
}: {
  onComplete: (pin: string) => void;
  disabled?: boolean;
  error?: string | null;
  /** Change à chaque nouvel échec, pour relancer l'animation même si le message est identique. */
  errorKey?: number;
  extraKey?: { label: string; onPress: () => void };
}) {
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (!error) return;
    setValue('');
    setShake(true);
    const t = window.setTimeout(() => setShake(false), 450);
    return () => window.clearTimeout(t);
  }, [error, errorKey]);

  function press(digit: string) {
    if (disabled) return;
    setValue((current) => {
      if (current.length >= SECURITY.PIN_LENGTH) return current;
      const next = current + digit;
      if (next.length === SECURITY.PIN_LENGTH) window.setTimeout(() => onComplete(next), 80);
      return next;
    });
  }

  function erase() {
    setValue((v) => v.slice(0, -1));
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') erase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="stack">
      <div
        className={`pin-dots${shake ? ' pin-shake' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={`${value.length} chiffre(s) sur ${SECURITY.PIN_LENGTH}`}
      >
        {Array.from({ length: SECURITY.PIN_LENGTH }, (_, i) => (
          <span key={i} className={`pin-dot${i < value.length ? ' filled' : ''}`} />
        ))}
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" className="key" disabled={disabled} onClick={() => press(k)}>
            {k}
          </button>
        ))}
        {extraKey ? (
          <button type="button" className="key key-plain" onClick={extraKey.onPress}>
            {extraKey.label}
          </button>
        ) : (
          <span />
        )}
        <button type="button" className="key" disabled={disabled} onClick={() => press('0')}>
          0
        </button>
        <button type="button" className="key key-plain" aria-label="Effacer" onClick={erase}>
          <Icon name="backspace" />
        </button>
      </div>
    </div>
  );
}
