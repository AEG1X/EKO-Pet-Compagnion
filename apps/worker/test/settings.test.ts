import { describe, expect, it } from 'vitest';
import { setupOwner } from './client';

describe('réglages', () => {
  it('n’a aucune section masquée par défaut', async () => {
    const { client } = await setupOwner();
    expect(await (await client.get('/api/settings')).json()).toMatchObject({ hiddenSections: [] });
  });

  it('enregistre le thème, l’accent et l’ordre des sections', async () => {
    const { client } = await setupOwner();
    const order = ['souvenirs', 'sante', 'alimentation', 'education', 'depenses', 'documents'];
    const res = await client.patch('/api/settings', { theme: 'dark', accent: 'lac', sectionOrder: order, hiddenSections: ['souvenirs'] });
    expect(res.status).toBe(200);
    expect(await (await client.get('/api/settings')).json()).toEqual({
      theme: 'dark',
      accent: 'lac',
      sectionOrder: order,
      hiddenSections: ['souvenirs'],
    });
  });

  it('refuse une valeur inconnue', async () => {
    const { client } = await setupOwner();
    expect((await client.patch('/api/settings', { accent: 'fuchsia' })).status).toBe(400);
    expect((await client.patch('/api/settings', { sectionOrder: ['sante'] })).status).toBe(400);
    expect((await client.patch('/api/settings', { hiddenSections: ['sante', 'sante'] })).status).toBe(400);
    expect((await client.patch('/api/settings', { hiddenSections: ['meteo'] })).status).toBe(400);
  });
});
