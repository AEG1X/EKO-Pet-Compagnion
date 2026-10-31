import { type WeightEntry, formatWeight } from '@eko/shared';
import { type PointerEvent, useMemo, useState } from 'react';
import { daysUntil, formatDate, formatMonthYear, formatShortDate, parseIsoDate } from '../../lib/dates';

const WIDTH = 480;
const HEIGHT = 220;
const PAD = { top: 16, right: 60, bottom: 26, left: 36 };

/** Graduations rondes (pas de 0,5, 1, 2 ou 5 kg) couvrant l'intervalle. */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const step = [0.5, 1, 2, 5, 10].find((s) => span / s <= 5) ?? 10;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return ticks;
}

/**
 * Courbe de poids : une seule série, donc pas de légende (le titre la nomme).
 * Survol ou toucher : repère vertical et infobulle sur la pesée la plus proche.
 */
export function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const [active, setActive] = useState<number | null>(null);

  const geometry = useMemo(() => {
    const times = entries.map((e) => parseIsoDate(e.date).getTime());
    const kilos = entries.map((e) => e.grams / 1000);
    const ticks = niceTicks(Math.min(...kilos), Math.max(...kilos));
    const yMin = ticks[0]!;
    const yMax = ticks[ticks.length - 1]!;
    const tMin = Math.min(...times);
    const tSpan = Math.max(...times) - tMin || 1;
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const x = (t: number) => PAD.left + (entries.length === 1 ? innerW / 2 : ((t - tMin) / tSpan) * innerW);
    const y = (kg: number) => PAD.top + (1 - (kg - yMin) / (yMax - yMin || 1)) * innerH;
    const points = entries.map((e, i) => ({ x: x(times[i]!), y: y(kilos[i]!), entry: e }));
    return { ticks, y, points, baseline: PAD.top + innerH };
  }, [entries]);

  const { ticks, y, points, baseline } = geometry;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1]!.x.toFixed(1)},${baseline} L${points[0]!.x.toFixed(1)},${baseline} Z`;
  const last = points[points.length - 1]!;
  const first = points[0]!;
  const hovered = active === null ? null : points[active];
  // Au-delà de dix mois, le jour importe moins que l'année.
  const axisDate = daysUntil(last.entry.date, first.entry.date) > 300 ? formatMonthYear : formatShortDate;

  function pick(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - px) < Math.abs(points[best]!.x - px)) best = i;
    });
    setActive(best);
  }

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Courbe de poids : ${entries.length} pesées, dernière ${formatWeight(last.entry.grams)} le ${formatDate(last.entry.date)}`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {String(t).replace('.', ',')}
            </text>
          </g>
        ))}
        <text className="chart-axis" x={first.x} y={HEIGHT - 6} textAnchor={points.length === 1 ? 'middle' : 'start'}>
          {axisDate(first.entry.date)}
        </text>
        {points.length > 1 && (
          <text className="chart-axis" x={last.x} y={HEIGHT - 6} textAnchor="end">
            {axisDate(last.entry.date)}
          </text>
        )}
        <path className="chart-area" d={area} />
        <path className="chart-line" d={line} />
        {hovered && <line className="chart-cross" x1={hovered.x} x2={hovered.x} y1={PAD.top} y2={baseline} />}
        {points.map((p, i) => (
          <circle key={p.entry.id} className="chart-dot" cx={p.x} cy={p.y} r={i === active ? 6 : 4} />
        ))}
        <text className="chart-value" x={last.x + 10} y={last.y} dy="0.32em">
          {formatWeight(last.entry.grams)}
        </text>
      </svg>
      {hovered && (
        <div
          className="chart-tooltip"
          role="status"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `${(hovered.y / HEIGHT) * 100}%`,
          }}
        >
          <strong>{formatWeight(hovered.entry.grams)}</strong>
          <span>{formatDate(hovered.entry.date)}</span>
        </div>
      )}
    </div>
  );
}
