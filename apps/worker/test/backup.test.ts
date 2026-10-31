import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { dumpDatabase } from '../src/routes/backup';
import { ORIGIN, setupOwner } from './client';

const TOKEN = 'jeton-de-sauvegarde-de-test-0123456789';
const configured = { ...env, BACKUP_TOKEN: TOKEN };

function pull(path: string, token: string | null = TOKEN, bindings: object = configured) {
  return app.request(
    path,
    { headers: { 'cf-connecting-ip': '198.51.100.7', ...(token ? { authorization: `Bearer ${token}` } : {}) } },
    bindings,
  );
}

async function seed() {
  const { client } = await setupOwner();
  await client.put('/api/dog', { name: 'Eko', notes: "Aime l'eau,\nsurtout la mer ; « Ondine »" });
  await client.post('/api/health-events', { kind: 'vaccin', date: '2026-03-01', title: 'Rage', nextDueDate: '2027-03-01' });
  const pdf = new TextEncoder().encode('%PDF-1.7\n%test\n');
  const file = (await (await client.upload(pdf, 'application/pdf', 'ordo.pdf')).json()) as { id: string };
  await client.post('/api/documents', { title: 'Ordonnance', category: 'ordonnance', date: '2026-03-01', fileId: file.id });
  return { client, fileId: file.id, pdf };
}

describe('sauvegarde', () => {
  it('n’existe pas tant que le jeton n’est pas configuré', async () => {
    expect((await pull('/api/backup/d1.sql', TOKEN, env)).status).toBe(404);
  });

  it('refuse un jeton absent ou faux, y compris une session ordinaire', async () => {
    const { client } = await seed();
    expect((await pull('/api/backup/d1.sql', null)).status).toBe(401);
    expect((await pull('/api/backup/d1.sql', 'mauvais')).status).toBe(401);
    const withSession = await app.request('/api/backup/d1.sql', { headers: { cookie: client.cookie!, origin: ORIGIN } }, configured);
    expect(withSession.status).toBe(401);
  });

  it('exporte une base restaurable, sans les sessions', async () => {
    await seed();
    const res = await pull('/api/backup/d1.sql');
    expect(res.status).toBe(200);
    const dump = await res.text();
    expect(dump).not.toContain('INSERT INTO "session"');
    expect(dump).toContain('INSERT INTO "dog"');
    // Le propriétaire passe avant le chien, le chien avant ses soins.
    expect(dump.indexOf('INSERT INTO "owner"')).toBeLessThan(dump.indexOf('INSERT INTO "dog"'));
    expect(dump.indexOf('INSERT INTO "dog"')).toBeLessThan(dump.indexOf('INSERT INTO "health_event"'));

    // Restauration : on vide la base puis on rejoue l'export.
    const before = await env.DB.prepare('SELECT name, notes FROM dog').first();
    const statements = dump
      .split(/;\n(?=INSERT|PRAGMA|--|$)/)
      .map((s) => s.replace(/^(--[^\n]*\n)+/, '').trim())
      .filter((s) => s.startsWith('INSERT'));
    await env.DB.batch([
      env.DB.prepare('PRAGMA defer_foreign_keys = on'),
      ...['document', 'stored_file', 'health_event', 'dog', 'audit_log', 'passkey', 'recovery_code', 'settings', 'owner'].map((t) =>
        env.DB.prepare(`DELETE FROM ${t}`),
      ),
    ]);
    await env.DB.batch([env.DB.prepare('PRAGMA defer_foreign_keys = on'), ...statements.map((s) => env.DB.prepare(s))]);
    expect(await env.DB.prepare('SELECT name, notes FROM dog').first()).toEqual(before);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM document').first())?.n).toBe(1);
  });

  it('liste et sert les fichiers rattachés, et journalise chaque export', async () => {
    const { fileId, pdf } = await seed();
    const list = (await (await pull('/api/backup/files')).json()) as { id: string; size: number }[];
    expect(list).toEqual([expect.objectContaining({ id: fileId, size: pdf.byteLength })]);
    const file = await pull(`/api/backup/files/${fileId}`);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(pdf);
    expect((await pull('/api/backup/files/inconnu')).status).toBe(404);
    await pull('/api/backup/d1.sql');
    const events = await env.DB.prepare("SELECT detail FROM audit_log WHERE event = 'backup_exported'").all();
    expect(events.results.map((e) => e.detail)).toEqual([`fichier ${fileId}`, 'base']);
  });

  it('échappe les valeurs SQL', async () => {
    await seed();
    const dump = await dumpDatabase(env.DB);
    expect(dump).toContain("'Aime l''eau,\nsurtout la mer ; « Ondine »'");
  });
});
