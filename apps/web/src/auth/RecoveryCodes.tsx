import { useId, useState } from 'react';

/** Affiche une seule fois les codes de secours, avec copie et impression. */
export function RecoveryCodes({ codes, onDone, doneLabel = 'Continuer' }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const checkboxId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="stack" aria-labelledby="codes-title">
      <div className="stack">
        <h1 id="codes-title">Tes codes de secours</h1>
        <p className="muted">
          Chaque code permet une seule fois de retrouver l&apos;accès si tu perds tous tes appareils. Imprime-les ou
          range-les dans un endroit sûr : ils ne seront plus jamais affichés.
        </p>
      </div>
      <ol className="codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <div className="row-wrap no-print">
        <button type="button" className="btn btn-secondary" onClick={copy}>
          {copied ? 'Copiés' : 'Copier'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          Imprimer
        </button>
      </div>
      <label className="row no-print" htmlFor={checkboxId}>
        <input id={checkboxId} type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        <span>J&apos;ai mis ces codes en lieu sûr</span>
      </label>
      <button type="button" className="btn btn-primary btn-block no-print" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </section>
  );
}
