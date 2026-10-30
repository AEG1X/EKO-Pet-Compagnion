import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { api } from './api';

export const passkeysSupported = () => browserSupportsWebAuthn();

interface Challenge<T> {
  challengeId: string;
  options: T;
}

/** Démarre puis termine un enregistrement de passkey auprès du Worker. */
export async function registerPasskey<R>(
  optionsPath: string,
  verifyPath: string,
  optionsBody: unknown,
  extra: Record<string, unknown> = {},
): Promise<R> {
  const { challengeId, options } = await api<Challenge<PublicKeyCredentialCreationOptionsJSON>>(optionsPath, {
    method: 'POST',
    body: optionsBody,
  });
  const response = await startRegistration({ optionsJSON: options });
  return api<R>(verifyPath, { method: 'POST', body: { challengeId, response, ...extra } });
}

export async function loginWithPasskey(): Promise<void> {
  const { challengeId, options } = await api<Challenge<PublicKeyCredentialRequestOptionsJSON>>(
    '/auth/login/options',
    { method: 'POST', body: {} },
  );
  const response = await startAuthentication({ optionsJSON: options });
  await api('/auth/login/verify', { method: 'POST', body: { challengeId, response } });
}

/** Nom lisible de l'appareil, proposé par défaut pour une nouvelle passkey. */
export function guessDeviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC Windows';
  return 'Nouvel appareil';
}
