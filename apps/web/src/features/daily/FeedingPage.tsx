import type { FeedingPlan } from '@eko/shared';
import { type FormEvent, useState } from 'react';
import { AddButton, FormButtons, Page, QueryError, RowActions, Section } from '../../components/ui';
import { formatDate, todayIso } from '../../lib/dates';
import { useDog } from '../profile/queries';
import { feedingPlans } from './queries';

/** « 320 g par jour, en 2 repas de 160 g » : uniquement ce qui est renseigné. */
export function describeRation(plan: Pick<FeedingPlan, 'dailyGrams' | 'mealsPerDay'>): string | null {
  const { dailyGrams, mealsPerDay } = plan;
  if (dailyGrams && mealsPerDay) {
    const meal = Math.round(dailyGrams / mealsPerDay);
    return `${dailyGrams} g par jour, en ${mealsPerDay} repas${mealsPerDay > 1 ? ` de ${meal} g` : ''}`;
  }
  if (dailyGrams) return `${dailyGrams} g par jour`;
  if (mealsPerDay) return `${mealsPerDay} repas par jour`;
  return null;
}

function toInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function PlanForm({ plan, onDone }: { plan?: FeedingPlan; onDone: () => void }) {
  const save = feedingPlans.useSave();
  const [form, setForm] = useState({
    food: plan?.food ?? '',
    dailyGrams: plan?.dailyGrams?.toString() ?? '',
    mealsPerDay: plan?.mealsPerDay?.toString() ?? '',
    startDate: plan?.startDate ?? todayIso(),
    endDate: plan?.endDate ?? '',
    notes: plan?.notes ?? '',
  });
  const p = plan ? `plan-${plan.id}` : 'plan-new';
  const set = (name: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [name]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        id: plan?.id,
        input: { ...form, dailyGrams: toInt(form.dailyGrams), mealsPerDay: toInt(form.mealsPerDay) },
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form className="stack" onSubmit={submit} aria-label={plan ? `Modifier ${plan.food}` : 'Nouvelle alimentation'}>
      <div className="form-grid">
        <div className="field span-2">
          <label htmlFor={`${p}-food`}>Aliment</label>
          <input id={`${p}-food`} className="input" required maxLength={120} placeholder="Marque et gamme de croquettes, ration ménagère…" value={form.food} onChange={set('food')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-grams`}>Ration quotidienne (g)</label>
          <input id={`${p}-grams`} className="input" type="number" inputMode="numeric" min={1} max={5000} value={form.dailyGrams} onChange={set('dailyGrams')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-meals`}>Repas par jour</label>
          <input id={`${p}-meals`} className="input" type="number" inputMode="numeric" min={1} max={10} value={form.mealsPerDay} onChange={set('mealsPerDay')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-start`}>Depuis le</label>
          <input id={`${p}-start`} className="input" type="date" required value={form.startDate} onChange={set('startDate')} />
        </div>
        <div className="field">
          <label htmlFor={`${p}-end`}>Jusqu’au</label>
          <input id={`${p}-end`} className="input" type="date" min={form.startDate} value={form.endDate} onChange={set('endDate')} />
          {!plan && <span className="hint">Laisse vide : l’alimentation précédente s’arrêtera la veille.</span>}
        </div>
        <div className="field span-2">
          <label htmlFor={`${p}-notes`}>Notes</label>
          <textarea id={`${p}-notes`} className="input" maxLength={2000} placeholder="Transition, friandises, intolérances…" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
      <FormButtons pending={save.isPending} onCancel={onDone} error={save.isError ? save.error : null} />
    </form>
  );
}

export function FeedingPage() {
  const dog = useDog();
  const plans = feedingPlans.useList();
  const remove = feedingPlans.useRemove();
  const [editing, setEditing] = useState<string | null>(null);
  const list = plans.data ?? [];
  const today = todayIso();
  const current = list.find((p) => p.startDate <= today && (!p.endDate || p.endDate >= today));

  return (
    <Page title="Alimentation" needsDog={dog.isSuccess && !dog.data}>
      <Section title="Alimentation actuelle" action={editing === null && <AddButton onClick={() => setEditing('new')} label="Changer" />}>
        <QueryError error={plans.error} />
        {editing === 'new' && <PlanForm onDone={() => setEditing(null)} />}
        {current ? (
          <div className="stack" style={{ gap: 4 }}>
            <strong style={{ fontSize: '1.1rem' }}>{current.food}</strong>
            {describeRation(current) && <span>{describeRation(current)}</span>}
            <span className="hint">Depuis le {formatDate(current.startDate)}</span>
            {current.notes && <span className="hint" style={{ whiteSpace: 'pre-line' }}>{current.notes}</span>}
          </div>
        ) : (
          plans.isSuccess && editing !== 'new' && <p className="muted">Indique ce que mange Eko et sa ration quotidienne.</p>
        )}
      </Section>

      {list.length > 0 && (
        <Section title="Historique">
          <ul className="list">
            {list.map((plan) =>
              editing === plan.id ? (
                <li key={plan.id} className="list-item">
                  <PlanForm plan={plan} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={plan.id} className="list-item contact">
                  <div className="contact-body">
                    <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <strong>{plan.food}</strong>
                      {plan.id === current?.id && <span className="badge">Actuelle</span>}
                    </span>
                    {describeRation(plan) && <span className="hint">{describeRation(plan)}</span>}
                    <span className="hint">
                      {plan.endDate ? `Du ${formatDate(plan.startDate)} au ${formatDate(plan.endDate)}` : `Depuis le ${formatDate(plan.startDate)}`}
                    </span>
                  </div>
                  <RowActions label={plan.food} busy={remove.isPending} onEdit={() => setEditing(plan.id)} onDelete={() => remove.mutate(plan.id)} />
                </li>
              ),
            )}
          </ul>
        </Section>
      )}
    </Page>
  );
}
