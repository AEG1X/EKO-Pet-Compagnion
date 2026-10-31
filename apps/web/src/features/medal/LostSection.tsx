import { type FinderReport, type LostStatus, mapUrl } from '@eko/shared';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { QueryError, Section } from '../../components/ui';
import { formatDate } from '../../lib/dates';
import { useDeleteReport, useEndLost, useLost, useStartLost } from './queries';

/** Date et heure lisibles, à l'heure de l'appareil. */
function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function looksLikePhone(value: string) {
  return /^\+?[0-9 ().-]{6,20}$/.test(value.trim());
}

function ReportItem({ report }: { report: FinderReport }) {
  const remove = useDeleteReport();
  return (
    <li className="report">
      <div className="report-head">
        <strong>{formatDateTime(report.createdAt)}</strong>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Supprimer le signalement du ${formatDateTime(report.createdAt)}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm('Supprimer ce signalement ?')) remove.mutate(report.id);
          }}
        >
          <Icon name="trash" size={18} />
        </button>
      </div>
      {report.message && <p>{report.message}</p>}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {report.position && (
          <a className="btn btn-secondary" href={mapUrl(report.position.latitude, report.position.longitude)} target="_blank" rel="noreferrer">
            Voir sur la carte
            {report.position.accuracy !== null && <span className="hint"> (± {Math.round(report.position.accuracy)} m)</span>}
          </a>
        )}
        {report.contact &&
          (looksLikePhone(report.contact) ? (
            <a className="btn btn-secondary" href={`tel:${report.contact.replace(/[^0-9+]/g, '')}`}>
              Rappeler {report.contact}
            </a>
          ) : (
            <span className="hint">Contact : {report.contact}</span>
          ))}
        {!report.position && <span className="hint">Position non partagée</span>}
      </div>
    </li>
  );
}

function History({ status }: { status: LostStatus }) {
  if (status.history.length === 0) return null;
  return (
    <details className="medal-help">
      <summary>Historique ({status.history.length})</summary>
      <ul className="list">
        {status.history.map((e) => (
          <li key={e.id} className="list-item" style={{ display: 'block' }}>
            Perdu du {formatDate(e.startedAt.slice(0, 10))} au {formatDate(e.endedAt!.slice(0, 10))} ·{' '}
            {e.reportCount === 0 ? 'aucun signalement' : e.reportCount === 1 ? '1 signalement' : `${e.reportCount} signalements`}
            <span className="hint" style={{ display: 'block' }}>
              {e.purged
                ? 'Signalements effacés.'
                : `Signalements effacés automatiquement le ${formatDate(e.purgeAt!.slice(0, 10))}.`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function LostSection({ dogName, medalActive }: { dogName: string; medalActive: boolean }) {
  const lost = useLost();
  const start = useStartLost();
  const end = useEndLost();
  const current = lost.data?.current ?? null;
  const [message, setMessage] = useState('');

  useEffect(() => {
    setMessage(current?.message ?? '');
  }, [current?.message]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!current && !window.confirm(`Déclarer ${dogName} perdu ? La fiche publique affichera une alerte et chaque scan te sera signalé.`)) return;
    start.mutate({ message });
  }

  const reports = lost.data?.reports.filter((r) => r.episodeId === current?.id) ?? [];
  const pastReports = lost.data?.reports.filter((r) => r.episodeId !== current?.id) ?? [];

  return (
    <Section title="Mode perdu">
      <QueryError error={lost.error ?? start.error ?? end.error} />
      {current ? (
        <div className="lost-banner" role="status">
          <Icon name="bell" />
          <div>
            <strong>{dogName} est déclaré perdu</strong>
            <span>depuis le {formatDateTime(current.startedAt)}</span>
          </div>
        </div>
      ) : (
        <p>
          Si {dogName} se perd, active ce mode : la fiche publique affiche une alerte et un formulaire de signalement, et tu es prévenu
          à chaque scan et à chaque signalement, par notification et par Telegram s’il est relié.
        </p>
      )}
      {!medalActive && !current && <p className="notice">Active d’abord la médaille ci-dessus : c’est elle qui mène à la fiche.</p>}
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="lost-message">Message d’alerte sur la fiche (facultatif)</label>
          <textarea
            id="lost-message"
            className="input"
            maxLength={300}
            placeholder="Perdu le 2 novembre vers le parc de la Tête d’Or. Il a peur : ne lui cours pas après."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div className="form-actions">
          {current && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={end.isPending}
              onClick={() => {
                if (window.confirm(`${dogName} est retrouvé ? La fiche redevient normale.`)) end.mutate(undefined);
              }}
            >
              <Icon name="check" size={18} /> {dogName} est retrouvé
            </button>
          )}
          <button className={current ? 'btn btn-ghost' : 'btn btn-danger'} disabled={start.isPending || (!current && !medalActive)}>
            {current ? 'Mettre à jour le message' : `Déclarer ${dogName} perdu`}
          </button>
        </div>
      </form>
      {current && (
        <p className="hint">
          Vérifie que les notifications sont actives dans les <Link to="/reglages">Réglages</Link> pour recevoir les alertes.
        </p>
      )}

      {current && (
        <div className="stack" style={{ gap: 8 }}>
          <h3 className="eyebrow">Signalements</h3>
          {reports.length === 0 ? (
            <p className="muted">Aucun signalement pour l’instant. Ils apparaissent ici dès qu’ils arrivent.</p>
          ) : (
            <ul className="reports">
              {reports.map((r) => (
                <ReportItem key={r.id} report={r} />
              ))}
            </ul>
          )}
        </div>
      )}
      {pastReports.length > 0 && (
        <details className="medal-help">
          <summary>Signalements des épisodes précédents ({pastReports.length})</summary>
          <ul className="reports">
            {pastReports.map((r) => (
              <ReportItem key={r.id} report={r} />
            ))}
          </ul>
        </details>
      )}
      {lost.data && <History status={lost.data} />}
    </Section>
  );
}
