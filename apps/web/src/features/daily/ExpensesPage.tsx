import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  type Expense,
  type ExpenseCategory,
  formatEuros,
  parseEuros,
} from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { AddButton, FormButtons, Page, QueryError, RowActions, Section } from '../../components/ui';
import { formatDate, parseIsoDate, todayIso } from '../../lib/dates';
import { useHealthEvents } from '../health/queries';
import { useDog } from '../profile/queries';
import { expenses } from './queries';

const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** Total en centimes des dépenses dont la date commence par le préfixe (« 2026 » ou « 2026-10 »). */
export function totalFor(list: Expense[], prefix: string): number {
  return list.filter((e) => e.date.startsWith(prefix)).reduce((sum, e) => sum + e.amountCents, 0);
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',').replace(',00', '');
}

export function ExpenseForm({
  expense,
  onDone,
  onSaved,
}: {
  expense?: Expense;
  onDone: () => void;
  /** Appelé après l'enregistrement à la place de onDone (ajout rapide). */
  onSaved?: () => void;
}) {
  const save = expenses.useSave();
  const events = useHealthEvents();
  const [form, setForm] = useState({
    date: expense?.date ?? todayIso(),
    amount: expense ? centsToInput(expense.amountCents) : '',
    category: expense?.category ?? ('alimentation' as ExpenseCategory),
    label: expense?.label ?? '',
    healthEventId: expense?.healthEventId ?? '',
    notes: expense?.notes ?? '',
  });
  const [amountError, setAmountError] = useState<string | null>(null);
  const p = expense ? `expense-${expense.id}` : 'expense-new';
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const amountCents = parseEuros(form.amount);
    if (amountCents === null || amountCents <= 0) {
      setAmountError('Indique un montant en euros, par exemple 64,90.');
      return;
    }
    setAmountError(null);
    const { amount: _amount, ...rest } = form;
    save.mutate(
      { id: expense?.id, input: { ...rest, amountCents, healthEventId: form.category === 'sante' ? form.healthEventId : null } },
      { onSuccess: onSaved ?? onDone },
    );
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={expense ? `Modifier ${expense.label}` : 'Nouvelle dépense'}>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor={`${p}-label`}>Libellé</label>
          <input id={`${p}-label`} className="input" required maxLength={120} placeholder="Sac de croquettes, consultation…" value={form.label} onChange={set('label')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-amount`}>Montant (€)</label>
          <input id={`${p}-amount`} className="input" inputMode="decimal" required placeholder="64,90" value={form.amount} onChange={set('amount')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-date`}>Date</label>
          <input id={`${p}-date`} className="input" type="date" required value={form.date} onChange={set('date')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-category`}>Catégorie</label>
          <select id={`${p}-category`} className="input" value={form.category} onChange={set('category')}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        {form.category === 'sante' && (
          <div className="field">
            <label htmlFor={`${p}-event`}>Soin associé</label>
            <select id={`${p}-event`} className="input" value={form.healthEventId} onChange={set('healthEventId')}>
              <option value="">Aucun</option>
              {events.data?.slice(0, 30).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} · {formatDate(ev.date)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={1000} value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      {amountError && (
        <p className="alert" role="alert">
          {amountError}
        </p>
      )}
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

/** Répartition par catégorie : barres horizontales d'une seule teinte, valeur au bout de chaque barre. */
function CategoryBars({ list, year }: { list: Expense[]; year: string }) {
  const totals = EXPENSE_CATEGORIES.map((c) => ({
    category: c,
    cents: list.filter((e) => e.category === c && e.date.startsWith(year)).reduce((s, e) => s + e.amountCents, 0),
  }))
    .filter((t) => t.cents > 0)
    .sort((a, b) => b.cents - a.cents);
  const max = Math.max(...totals.map((t) => t.cents), 1);
  if (totals.length === 0) return <p className="muted">Aucune dépense en {year}.</p>;
  return (
    <ul className="bars" aria-label={`Dépenses ${year} par catégorie`}>
      {totals.map((t) => (
        <li key={t.category}>
          <span className="bars-label">{EXPENSE_CATEGORY_LABELS[t.category]}</span>
          <span className="bars-track">
            <span className="bars-fill" style={{ width: `${Math.max((t.cents / max) * 100, 2)}%` }} />
          </span>
          <span className="bars-value">{formatEuros(t.cents)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ExpensesPage() {
  const dog = useDog();
  const list = expenses.useList();
  const remove = expenses.useRemove();
  const [editing, setEditing] = useState<string | null>(null);
  const all = list.data ?? [];
  const today = todayIso();
  const years = [...new Set([today.slice(0, 4), ...all.map((e) => e.date.slice(0, 4))])].sort().reverse();
  const [year, setYear] = useState(today.slice(0, 4));

  const byMonth = new Map<string, Expense[]>();
  for (const e of all) {
    const month = e.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), e]);
  }

  return (
    <Page title="Dépenses" needsDog={dog.isSuccess && !dog.data}>
      <div className="grid-cards stat-cards">
        <div className="card stat">
          <span className="eyebrow">Ce mois-ci</span>
          <strong>{formatEuros(totalFor(all, today.slice(0, 7)))}</strong>
        </div>
        <div className="card stat">
          <span className="eyebrow">En {today.slice(0, 4)}</span>
          <strong>{formatEuros(totalFor(all, today.slice(0, 4)))}</strong>
        </div>
      </div>

      <Section
        title="Par catégorie"
        action={
          years.length > 1 && (
            <select className="input" aria-label="Année" value={year} onChange={(e) => setYear(e.target.value)} style={{ minHeight: 40, width: 'auto' }}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )
        }
      >
        <CategoryBars list={all} year={year} />
      </Section>

      <Section title="Toutes les dépenses" action={editing === null && <AddButton onClick={() => setEditing('new')} />}>
        <QueryError error={list.error} />
        {editing === 'new' && <ExpenseForm onDone={() => setEditing(null)} />}
        {list.isSuccess && all.length === 0 && editing !== 'new' && <p className="muted">Aucune dépense enregistrée.</p>}
        {[...byMonth.entries()].map(([month, items]) => (
          <div key={month} className="stack" style={{ gap: 4 }}>
            <div className="section-head">
              <h3 className="eyebrow">{monthTitle.format(parseIsoDate(`${month}-01`))}</h3>
              <span className="hint">{formatEuros(items.reduce((s, e) => s + e.amountCents, 0))}</span>
            </div>
            <ul className="list">
              {items.map((e) =>
                editing === e.id ? (
                  <li key={e.id} className="list-item">
                    <ExpenseForm expense={e} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={e.id} className="list-item contact">
                    <div className="contact-body">
                      <span className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                        <strong>{e.label}</strong>
                        <strong>{formatEuros(e.amountCents)}</strong>
                      </span>
                      <span className="hint">
                        {EXPENSE_CATEGORY_LABELS[e.category]} · {formatDate(e.date)}
                      </span>
                      {e.notes && <span className="hint">{e.notes}</span>}
                    </div>
                    <RowActions label={e.label} busy={remove.isPending} onEdit={() => setEditing(e.id)} onDelete={() => remove.mutate(e.id)} />
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </Section>
    </Page>
  );
}
