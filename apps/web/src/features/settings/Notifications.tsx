import type { NotificationStatus, NotificationTestResult, PushDevice, TelegramLinkStart } from '@eko/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { api, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/dates';
import { guessDeviceLabel } from '../../lib/webauthn';

const statusKey = ['/notifications'] as const;

/** Clé publique VAPID (base64url) → octets attendus par pushManager.subscribe. */
function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Sur iPhone, les notifications web n'existent que pour l'app ajoutée à l'écran d'accueil. */
function needsHomeScreen() {
  return /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
}

function DeviceRow({ device, onRemoved }: { device: PushDevice; onRemoved: () => void }) {
  const remove = useMutation({
    mutationFn: () => api(`/notifications/push/${encodeURIComponent(device.id)}`, { method: 'DELETE' }),
    onSuccess: onRemoved,
  });
  return (
    <li className="list-item">
      <div className="contact-body">
        <strong>{device.label}</strong>
        <span className="hint">
          Ajouté le {formatDate(device.createdAt.slice(0, 10))}
          {device.lastSuccessAt ? ` · dernière notification le ${formatDate(device.lastSuccessAt.slice(0, 10))}` : ''}
        </span>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Retirer ${device.label}`}
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(`Ne plus envoyer de notifications à « ${device.label} » ?`)) remove.mutate();
        }}
      >
        <Icon name="trash" size={18} />
      </button>
    </li>
  );
}

function Telegram({ status, refresh }: { status: NotificationStatus['telegram']; refresh: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: () => api<TelegramLinkStart>('/notifications/telegram/link', { method: 'POST' }),
    onSuccess: (data) => {
      setLink(data.url);
      window.open(data.url, '_blank', 'noopener');
    },
  });
  const confirm = useMutation({
    mutationFn: () => api('/notifications/telegram/confirm', { method: 'POST' }),
    onSuccess: () => {
      setLink(null);
      refresh();
    },
  });
  const unlink = useMutation({
    mutationFn: () => api('/notifications/telegram', { method: 'DELETE' }),
    onSuccess: refresh,
  });

  if (!status.available) {
    return <p className="hint">Telegram n’est pas encore configuré sur le serveur (voir la documentation de déploiement).</p>;
  }
  const error = start.error ?? confirm.error ?? unlink.error;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {status.linked ? (
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>
            <Icon name="check" size={18} /> Conversation Telegram reliée
          </span>
          <button type="button" className="btn btn-ghost" disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            Délier
          </button>
        </div>
      ) : link ? (
        <>
          <p className="hint">
            Dans Telegram, appuie sur « Démarrer », puis reviens ici.{' '}
            <a href={link} target="_blank" rel="noopener">
              Rouvrir Telegram
            </a>
          </p>
          <button type="button" className="btn btn-primary" disabled={confirm.isPending} onClick={() => confirm.mutate()}>
            {confirm.isPending ? 'Vérification…' : 'C’est fait'}
          </button>
        </>
      ) : (
        <button type="button" className="btn btn-secondary" disabled={start.isPending} onClick={() => start.mutate()}>
          Relier Telegram
        </button>
      )}
      {error != null && (
        <p className="alert" role="alert">
          {errorMessage(error)}
        </p>
      )}
    </div>
  );
}

export function Notifications() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: statusKey, queryFn: () => api<NotificationStatus>('/notifications') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: statusKey });
  const [message, setMessage] = useState<string | null>(null);

  const enable = useMutation({
    mutationFn: async () => {
      const key = status.data?.push.publicKey;
      if (!key) throw new Error('Notifications indisponibles.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Autorise les notifications pour EKO dans les réglages du navigateur.');
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) }));
      const json = subscription.toJSON();
      await api('/notifications/push', {
        method: 'POST',
        body: { endpoint: json.endpoint, keys: json.keys, label: guessDeviceLabel() },
      });
    },
    onSuccess: () => {
      setMessage('Cet appareil recevra les rappels.');
      refresh();
    },
  });

  const test = useMutation({
    mutationFn: () => api<NotificationTestResult>('/notifications/test', { method: 'POST' }),
    onSuccess: (r) => {
      const parts = [];
      if (r.push) parts.push(`${r.push} appareil${r.push > 1 ? 's' : ''}`);
      if (r.telegram) parts.push('Telegram');
      setMessage(parts.length ? `Essai envoyé : ${parts.join(' et ')}.` : 'Aucun canal n’a pu être joint.');
      refresh();
    },
  });

  const data = status.data;
  const error = status.error ?? enable.error ?? test.error;
  return (
    <section className="card stack" aria-labelledby="notifications-title">
      <h2 id="notifications-title">Notifications</h2>
      <p className="hint">
        Chaque matin à {data?.dailyHour ?? 8} h, EKO t’envoie les rappels du jour et les échéances de santé (une semaine avant, puis
        le jour même). Telegram prend le relais si aucun appareil ne répond.
      </p>
      {data && !data.push.available && (
        <p className="hint">Les notifications ne sont pas encore configurées sur le serveur (voir la documentation de déploiement).</p>
      )}
      {data?.push.available && (
        <div className="stack" style={{ gap: 8 }}>
          {data.push.devices.length > 0 && (
            <ul className="list">
              {data.push.devices.map((d) => (
                <DeviceRow key={d.id} device={d} onRemoved={refresh} />
              ))}
            </ul>
          )}
          {!pushSupported() ? (
            <p className="hint">Ce navigateur ne gère pas les notifications web.</p>
          ) : needsHomeScreen() ? (
            <p className="hint">Sur iPhone, ajoute d’abord EKO à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), puis ouvre-le depuis l’icône.</p>
          ) : (
            <button type="button" className="btn btn-secondary" disabled={enable.isPending} onClick={() => enable.mutate()}>
              <Icon name="bell" size={18} /> {enable.isPending ? 'Activation…' : 'Activer sur cet appareil'}
            </button>
          )}
        </div>
      )}
      {data && (
        <>
          <h3 className="eyebrow">Secours : Telegram</h3>
          <Telegram status={data.telegram} refresh={refresh} />
        </>
      )}
      {data && (data.push.devices.length > 0 || data.telegram.linked) && (
        <button type="button" className="btn btn-ghost" disabled={test.isPending} onClick={() => test.mutate()}>
          Envoyer un essai
        </button>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error != null && (
        <p className="alert" role="alert">
          {error instanceof Error && !('status' in error) ? error.message : errorMessage(error)}
        </p>
      )}
    </section>
  );
}
