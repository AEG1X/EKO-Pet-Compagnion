import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from '../src/lib/crypto';
import { encryptPayload, isAllowedPushEndpoint, sendPush, vapidAuthorization } from '../src/lib/webpush';

const encoder = new TextEncoder();
const enc = { encode: (value: string) => new Uint8Array(encoder.encode(value)) };

async function p256Pair(usage: 'ECDH' | 'ECDSA') {
  const pair = (await crypto.subtle.generateKey(
    { name: usage, namedCurve: 'P-256' },
    true,
    usage === 'ECDH' ? ['deriveBits'] : ['sign', 'verify'],
  )) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { pair, raw, d: jwk.d! };
}

async function hkdf(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Déchiffrement côté navigateur (RFC 8291), pour vérifier l'aller-retour. */
async function decrypt(body: Uint8Array, ua: { pair: CryptoKeyPair; raw: Uint8Array<ArrayBuffer> }, auth: Uint8Array<ArrayBuffer>) {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idLen = body[20]!;
  const asPublic = body.slice(21, 21 + idLen);
  const cipher = body.slice(21 + idLen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, ua.pair.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...ua.raw, ...asPublic]);
  const ikm = await hkdf(secret, auth, info, 32);
  const cek = await hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  return { rs, idLen, text: new TextDecoder().decode(plain.slice(0, -1)), delimiter: plain.at(-1) };
}

describe('Web Push', () => {
  it('chiffre un message que le navigateur sait déchiffrer', async () => {
    const ua = await p256Pair('ECDH');
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encryptPayload({ p256dh: toBase64Url(ua.raw), auth: toBase64Url(auth) }, enc.encode('{"title":"Brossage"}'));
    expect(await decrypt(body, ua, auth)).toEqual({ rs: 4096, idLen: 65, text: '{"title":"Brossage"}', delimiter: 2 });
  });

  it('signe un jeton VAPID vérifiable avec la clé publique', async () => {
    const vapid = await p256Pair('ECDSA');
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', {
      publicKey: toBase64Url(vapid.raw),
      privateKey: vapid.d,
      subject: 'mailto:test@example.org',
    });
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(toBase64Url(vapid.raw));
    const [h, c, s] = jwt!.split('.');
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(c!)))).toMatchObject({ aud: 'https://fcm.googleapis.com', sub: 'mailto:test@example.org' });
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      vapid.pair.publicKey,
      fromBase64Url(s!),
      enc.encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
  });

  it('n’accepte que les services de push connus', () => {
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isAllowedPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isAllowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isAllowedPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://evil.example/fcm.googleapis.com')).toBe(false);
    expect(isAllowedPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false);
    expect(isAllowedPushEndpoint('https://localhost:8787/api')).toBe(false);
  });

  it('signale un abonnement expiré', async () => {
    const ua = await p256Pair('ECDH');
    const vapid = await p256Pair('ECDSA');
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: toBase64Url(ua.raw), auth: toBase64Url(new Uint8Array(16)) };
    const keys = { publicKey: toBase64Url(vapid.raw), privateKey: vapid.d, subject: 'mailto:a@b.c' };
    const calls: RequestInit[] = [];
    const gone = await sendPush(sub, { title: 'x' }, keys, (async (_u: string, init: RequestInit) => {
      calls.push(init);
      return new Response(null, { status: 410 });
    }) as unknown as typeof fetch);
    expect(gone).toBe('gone');
    expect((calls[0]!.headers as Record<string, string>)['content-encoding']).toBe('aes128gcm');
    const sent = await sendPush(sub, { title: 'x' }, keys, (async () => new Response(null, { status: 201 })) as unknown as typeof fetch);
    expect(sent).toBe('sent');
  });
});
