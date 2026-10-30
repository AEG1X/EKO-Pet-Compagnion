import { encodeCbor } from './cbor';

/**
 * Authentificateur WebAuthn logiciel (ES256, attestation « none »), suffisant pour
 * exercer de bout en bout l'enregistrement et la connexion par passkey dans les tests.
 */
const encoder = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function uint32(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

/** Convertit une signature ECDSA brute (r||s) au format DER attendu par WebAuthn. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const integer = (bytes: Uint8Array) => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    let v: Uint8Array = bytes.slice(i);
    if ((v[0] ?? 0) & 0x80) v = concat(new Uint8Array([0]), v);
    return concat(new Uint8Array([0x02, v.length]), v);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

export class VirtualAuthenticator {
  private counter = 0;
  readonly credentialId = crypto.getRandomValues(new Uint8Array(16));
  private keys?: CryptoKeyPair;
  private userHandle?: string;

  constructor(
    private readonly rpId: string,
    private readonly origin: string,
  ) {}

  get id(): string {
    return b64url(this.credentialId);
  }

  async createCredential(options: { challenge: string; user: { id: string } }) {
    this.keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    this.userHandle = options.user.id;
    const raw = new Uint8Array((await crypto.subtle.exportKey('raw', this.keys.publicKey)) as ArrayBuffer);
    const cose = encodeCbor(
      new Map<number, number | Uint8Array>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, raw.slice(1, 33)],
        [-3, raw.slice(33, 65)],
      ]),
    );
    const flags = 0x01 | 0x04 | 0x40; // présence, vérification de l'utilisateur, données attestées
    const authData = concat(
      await sha256(encoder.encode(this.rpId)),
      new Uint8Array([flags]),
      uint32(this.counter),
      new Uint8Array(16),
      new Uint8Array([0, this.credentialId.length]),
      this.credentialId,
      cose,
    );
    const attestationObject = encodeCbor(
      new Map<string, string | Uint8Array | Map<number, number>>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData],
      ]),
    );
    const clientDataJSON = encoder.encode(
      JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: this.origin, crossOrigin: false }),
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        attestationObject: b64url(attestationObject),
        transports: ['internal'],
      },
      clientExtensionResults: {},
    };
  }

  async getAssertion(options: { challenge: string }, tamper = false) {
    if (!this.keys) throw new Error('Aucune clé créée');
    this.counter += 1;
    const authenticatorData = concat(
      await sha256(encoder.encode(this.rpId)),
      new Uint8Array([0x01 | 0x04]),
      uint32(this.counter),
    );
    const clientDataJSON = encoder.encode(
      JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: this.origin, crossOrigin: false }),
    );
    const signed = concat(authenticatorData, await sha256(clientDataJSON));
    const raw = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, this.keys.privateKey, signed as Uint8Array<ArrayBuffer>),
    );
    if (tamper) raw[10] = (raw[10] ?? 0) ^ 0xff;
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authenticatorData),
        signature: b64url(rawToDer(raw)),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
    };
  }
}
