/**
 * Envoi de notifications Web Push sans dépendance : chiffrement « aes128gcm » (RFC 8291)
 * et authentification VAPID (RFC 8292), avec l'API WebCrypto du Worker.
 */
import { fromBase64Url, toBase64Url } from './crypto';

export interface PushSubscriptionKeys {
  endpoint: string;
  /** Clé publique P-256 du navigateur (65 octets, base64url). */
  p256dh: string;
  /** Secret d'authentification du navigateur (16 octets, base64url). */
  auth: string;
}

export interface VapidKeys {
  /** Clé publique P-256 non compressée (65 octets, base64url). */
  publicKey: string;
  /** Clé privée P-256 (32 octets, base64url). */
  privateKey: string;
  /** Contact transmis au service de push (mailto: ou https:). */
  subject: string;
}

/**
 * Services de push des navigateurs : seule cette liste est acceptée comme adresse d'abonnement,
 * pour que le Worker ne puisse pas être utilisé pour appeler une adresse quelconque.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.port === '' && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

const encoder = new TextEncoder();
/** Octets UTF-8 sur un ArrayBuffer ordinaire, comme l'exigent les types WebCrypto. */
const utf8 = (value: string) => new Uint8Array(encoder.encode(value));

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(
  ikm: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Chiffre le message pour un abonnement : renvoie le corps « aes128gcm » complet. */
export async function encryptPayload(
  subscription: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  payload: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = fromBase64Url(subscription.p256dh);
  const authSecret = fromBase64Url(subscription.auth);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Les types du Worker nomment ce champ « $public » ; l'API WebCrypto attend « public ».
  const ecdh = { name: 'ECDH', public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, local.privateKey, 256));

  const keyInfo = concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(ecdhSecret, authSecret, keyInfo, 32);
  const cek = await hkdf(ikm, salt, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, utf8('Content-Encoding: nonce\0'), 12);

  // Un seul enregistrement : le message suivi du délimiteur de dernier enregistrement (0x02).
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

/** Jeton VAPID (JWT ES256) valable 12 h pour l'origine du service de push. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const publicKey = fromBase64Url(vapid.publicKey);
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    d: vapid.privateKey,
    ext: false,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${vapid.publicKey}`;
}

export type PushResult = 'sent' | 'gone' | 'failed';

/**
 * Envoie une notification. « gone » : l'abonnement n'existe plus (404/410), il faut l'oublier.
 * `fetcher` est remplaçable pour les tests.
 */
export async function sendPush(
  subscription: PushSubscriptionKeys,
  message: unknown,
  vapid: VapidKeys,
  fetcher: typeof fetch = fetch,
): Promise<PushResult> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) return 'gone';
  const body = await encryptPayload(subscription, utf8(JSON.stringify(message)));
  const res = await fetcher(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      // Un rappel garde son intérêt une journée : au-delà, inutile de le livrer.
      ttl: '86400',
      urgency: 'normal',
    },
    body,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'sent' : 'failed';
}
