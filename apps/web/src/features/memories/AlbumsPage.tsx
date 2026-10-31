import { type Album, type AlbumInput, type Memory, SHARE_DURATIONS, SHARE_DURATION_LABELS, type ShareLink, groupByMonth } from '@eko/shared';
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { FormButtons, Page, QueryError, Section } from '../../components/ui';
import { formatDate, formatMonthYear, formatShortDate } from '../../lib/dates';
import { useDog } from '../profile/queries';
import { Tile, Viewer } from './MemoryViewer';
import { ExportPanel, MemoriesNav } from './parts';
import { useAlbumMembers, useAlbums, useDeleteAlbum, useMemories, useSaveAlbum, useShareActions, useShares } from './queries';

function period(album: Album): string | null {
  if (!album.firstDate || !album.lastDate) return null;
  const first = formatMonthYear(album.firstDate);
  const last = formatMonthYear(album.lastDate);
  return first === last ? first : `${first} – ${last}`;
}

// ---------------------------------------------------------------- Formulaire

function AlbumForm({ album, onDone }: { album?: Album; onDone: (saved?: Album) => void }) {
  const save = useSaveAlbum();
  const [form, setForm] = useState<AlbumInput>({ name: album?.name ?? '', description: album?.description ?? '' });
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ id: album?.id, input: form }, { onSuccess: (saved) => onDone(saved) });
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="album-name">Nom de l’album</label>
        <input
          id="album-name"
          className="input"
          required
          maxLength={80}
          placeholder="Premiers jours, Vacances à la mer…"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
      </div>
      <div className="field">
        <label htmlFor="album-description">Description (facultative)</label>
        <textarea
          id="album-description"
          className="input"
          rows={2}
          maxLength={500}
          value={form.description ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <FormButtons pending={save.isPending} onCancel={() => onDone()} error={save.error} />
    </form>
  );
}

// ---------------------------------------------------------------- Liste

export function AlbumsPage() {
  const dog = useDog();
  const hasDog = dog.isSuccess && Boolean(dog.data);
  const albums = useAlbums(hasDog);
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <Page title="Souvenirs" needsDog={dog.isSuccess && !dog.data}>
      <MemoriesNav />
      {creating ? (
        <Section title="Nouvel album">
          <AlbumForm
            onDone={(saved) => {
              setCreating(false);
              if (saved) void navigate({ to: '/souvenirs/albums/$albumId', params: { albumId: saved.id } });
            }}
          />
        </Section>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={18} /> Nouvel album
          </button>
        </div>
      )}
      <QueryError error={albums.error} />
      {albums.isSuccess && albums.data.length === 0 && !creating && (
        <section className="card empty-state">
          <Icon name="image" size={32} />
          <p>
            <strong>Aucun album pour l’instant.</strong>
          </p>
          <p className="hint">Regroupe tes souvenirs (une balade, des vacances, la première année…) et partage un album avec un lien privé.</p>
        </section>
      )}
      <ul className="albums">
        {albums.data?.map((a) => (
          <li key={a.id}>
            <Link to="/souvenirs/albums/$albumId" params={{ albumId: a.id }} className="album-card">
              <span className="album-cover">{a.coverUrl ? <img src={a.coverUrl} alt="" loading="lazy" /> : <Icon name="image" size={28} />}</span>
              <span className="album-body">
                <strong>{a.name}</strong>
                <span className="hint">
                  {a.count} souvenir{a.count > 1 ? 's' : ''}
                  {period(a) && ` · ${period(a)}`}
                </span>
                {a.activeShares > 0 && (
                  <span className="badge">
                    Partagé · {a.activeShares} lien{a.activeShares > 1 ? 's' : ''}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}

// ---------------------------------------------------------------- Sélection de souvenirs

function MemoryPicker({ candidates, onConfirm, onClose, pending }: { candidates: Memory[]; onConfirm: (ids: string[]) => void; onClose: () => void; pending: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupByMonth(candidates), [candidates]);
  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <dialog ref={dialog} className="picker" onClose={onClose} aria-label="Ajouter des souvenirs à l’album">
      <div className="picker-bar">
        <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => dialog.current?.close()}>
          <Icon name="close" />
        </button>
        <strong>Choisir des souvenirs</strong>
        <button type="button" className="btn btn-primary" disabled={selected.size === 0 || pending} onClick={() => onConfirm([...selected])}>
          Ajouter{selected.size > 0 && ` (${selected.size})`}
        </button>
      </div>
      <div className="picker-body">
        {candidates.length === 0 && <p className="muted">Tous les souvenirs sont déjà dans cet album.</p>}
        {groups.map((g) => (
          <section key={g.month} className="timeline-month">
            <h2 className="timeline-title">{formatMonthYear(`${g.month}-01`)}</h2>
            <div className="tiles">
              {g.items.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="tile tile-select"
                  aria-pressed={selected.has(m.id)}
                  aria-label={`${m.kind === 'video' ? 'Vidéo' : 'Photo'} du ${formatDate(m.takenDate)}`}
                  onClick={() => toggle(m.id)}
                >
                  {m.previewUrl ? <img src={m.previewUrl} alt="" loading="lazy" /> : <span className="tile-empty"><Icon name={m.kind === 'video' ? 'play' : 'image'} /></span>}
                  <span className="tile-check" aria-hidden="true">
                    <Icon name="check" size={16} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </dialog>
  );
}

// ---------------------------------------------------------------- Partage

function shareState(link: ShareLink): string {
  if (link.status === 'revoked') return 'Désactivé';
  if (link.status === 'expired') return 'Expiré';
  return link.expiresAt ? `Valable jusqu’au ${formatShortDate(link.expiresAt.slice(0, 10))}` : 'Sans expiration';
}

function ShareRow({ link, albumId }: { link: ShareLink; albumId: string }) {
  const { revoke, remove } = useShareActions(albumId);
  const [copied, setCopied] = useState(false);
  const active = link.status === 'active';
  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copie ce lien :', link.url);
    }
  }
  return (
    <li className={`list-item share-row${active ? '' : ' is-off'}`}>
      <div className="share-row-main">
        <strong>{link.label}</strong>
        <span className="hint">
          {shareState(link)}
          {link.allowDownload && ' · téléchargement permis'}
          {' · '}
          {link.viewCount === 0 ? 'jamais ouvert' : `ouvert ${link.viewCount} fois, dernière fois le ${formatShortDate(link.lastViewedAt!.slice(0, 10))}`}
        </span>
        {active && <code className="share-url">{link.url}</code>}
      </div>
      <div className="share-row-actions">
        {active ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
              {copied ? <Icon name="check" size={18} /> : null} {copied ? 'Copié' : 'Copier'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={revoke.isPending}
              onClick={() => {
                if (window.confirm(`Désactiver le lien « ${link.label} » ? Il cessera de fonctionner immédiatement.`)) revoke.mutate(link.id);
              }}
            >
              Désactiver
            </button>
          </>
        ) : (
          <button type="button" className="icon-btn" aria-label={`Effacer le lien ${link.label}`} disabled={remove.isPending} onClick={() => remove.mutate(link.id)}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

function SharePanel({ album }: { album: Album }) {
  const shares = useShares(album.id);
  const { create } = useShareActions(album.id);
  const [form, setForm] = useState({ label: '', days: '30', allowDownload: false });
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<ShareLink | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate(
      { label: form.label, days: form.days === 'null' ? null : Number(form.days), allowDownload: form.allowDownload },
      {
        onSuccess: (link) => {
          setCreated(link);
          setOpen(false);
          setForm({ label: '', days: '30', allowDownload: false });
          void navigator.clipboard?.writeText(link.url).catch(() => undefined);
        },
      },
    );
  }

  const list = shares.data ?? [];
  return (
    <Section
      title="Partager"
      action={
        !open && (
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={18} /> Nouveau lien
          </button>
        )
      }
    >
      <p className="hint">
        Un lien privé permet de voir cet album sans compte, en lecture seule. Il n’est pas indexé par les moteurs de recherche et tu peux le
        désactiver à tout moment. La personne qui le reçoit peut toujours enregistrer ce qu’elle voit.
      </p>
      {created && (
        <p className="notice" role="status">
          Lien « {created.label} » créé et copié : colle-le dans un message.
        </p>
      )}
      {open && (
        <form className="stack card-inset" onSubmit={submit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="share-label">Pour qui ?</label>
              <input
                id="share-label"
                className="input"
                required
                maxLength={60}
                placeholder="Famille, Mamie, Éleveur…"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="field">
              <label htmlFor="share-days">Durée</label>
              <select id="share-days" className="input" value={form.days} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}>
                {SHARE_DURATIONS.map((d) => (
                  <option key={String(d)} value={String(d)}>
                    {SHARE_DURATION_LABELS[String(d)]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.allowDownload} onChange={(e) => setForm((f) => ({ ...f, allowDownload: e.target.checked }))} />
            Permettre de télécharger les originaux
          </label>
          <FormButtons pending={create.isPending} onCancel={() => setOpen(false)} error={create.error} />
        </form>
      )}
      <QueryError error={shares.error} />
      {list.length > 0 && (
        <ul className="list">
          {list.map((l) => (
            <ShareRow key={l.id} link={l} albumId={album.id} />
          ))}
        </ul>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- Détail

const albumRoute = getRouteApi('/souvenirs/albums/$albumId');

export function AlbumPage() {
  const { albumId } = albumRoute.useParams();
  const dog = useDog();
  const hasDog = dog.isSuccess && Boolean(dog.data);
  const albums = useAlbums(hasDog);
  const memories = useMemories(hasDog);
  const members = useAlbumMembers();
  const remove = useDeleteAlbum();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const album = albums.data?.find((a) => a.id === albumId);
  const all = memories.data ?? [];
  const inside = useMemo(() => groupByMonth(all.filter((m) => m.albumIds.includes(albumId))), [all, albumId]);
  const ordered = useMemo(() => inside.flatMap((g) => g.items), [inside]);

  if (albums.isSuccess && !album) {
    return (
      <Page title="Album introuvable">
        <p className="muted">Cet album n’existe plus.</p>
        <Link to="/souvenirs/albums" className="btn btn-secondary">
          Retour aux albums
        </Link>
      </Page>
    );
  }

  return (
    <Page title={album?.name ?? 'Album'} needsDog={dog.isSuccess && !dog.data}>
      <Link to="/souvenirs/albums" className="back-link">
        <Icon name="back" size={18} /> Albums
      </Link>
      <QueryError error={albums.error ?? memories.error ?? members.error ?? remove.error} />
      {album && (
        <>
          {editing ? (
            <Section title="Modifier l’album">
              <AlbumForm album={album} onDone={() => setEditing(false)} />
            </Section>
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              {album.description && <p>{album.description}</p>}
              <p className="hint">
                {album.count} souvenir{album.count > 1 ? 's' : ''}
                {period(album) && ` · ${period(album)}`}
              </p>
              <div className="row row-wrap" style={{ gap: 8 }}>
                <button type="button" className="btn btn-primary" onClick={() => setPicking(true)}>
                  <Icon name="plus" size={18} /> Ajouter des souvenirs
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
                  <Icon name="edit" size={18} /> Modifier
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(`Supprimer l’album « ${album.name} » ? Ses souvenirs restent dans la galerie ; ses liens de partage cessent de fonctionner.`)) {
                      remove.mutate(album.id, { onSuccess: () => void navigate({ to: '/souvenirs/albums' }) });
                    }
                  }}
                >
                  <Icon name="trash" size={18} /> Supprimer
                </button>
              </div>
            </div>
          )}

          {memories.isSuccess && ordered.length === 0 && <p className="muted">Cet album est vide : ajoute des souvenirs de la frise.</p>}
          {inside.map((group) => (
            <section key={group.month} className="timeline-month" aria-label={formatMonthYear(`${group.month}-01`)}>
              <h2 className="timeline-title">
                {formatMonthYear(`${group.month}-01`)} <span className="hint">· {group.items.length}</span>
              </h2>
              <div className="tiles">
                {group.items.map((m) => (
                  <Tile key={m.id} memory={m} onOpen={() => setOpen(ordered.indexOf(m))} />
                ))}
              </div>
            </section>
          ))}

          <SharePanel album={album} />
          {ordered.length > 0 && <ExportPanel memories={ordered} albums={albums.data ?? []} label={`album-${album.name}`} choices={false} />}

          {picking && (
            <MemoryPicker
              candidates={all.filter((m) => !m.albumIds.includes(album.id))}
              pending={members.isPending}
              onClose={() => setPicking(false)}
              onConfirm={(ids) => members.mutate({ id: album.id, add: ids }, { onSuccess: () => setPicking(false) })}
            />
          )}
          {open !== null && ordered[open] && <Viewer list={ordered} index={open} onIndex={setOpen} onClose={() => setOpen(null)} album={album} />}
        </>
      )}
    </Page>
  );
}

