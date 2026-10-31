// Génère une paire de clés VAPID (P-256) pour les notifications Web Push.
// Usage : pnpm --filter @eko/worker vapid
// Copie chaque valeur dans les secrets du Worker (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY), puis ferme le terminal.
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
const jwk = await crypto.subtle.exportKey('jwk', privateKey);
const b64url = (bytes) => Buffer.from(bytes).toString('base64url');
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log('\nLa clé privée est un secret : ne la colle nulle part ailleurs que dans Cloudflare.');
