import { KES } from '../_lib/formatters';

export type PipelineStage = {
  key:
    | 'DRAFT'
    | 'PENDING'
    | 'APPROVED'
    | 'PENDING_DISBURSEMENT'
    | 'DISBURSED'
    | 'REJECTED';
  label: string;
  tone: 'neutral' | 'pending' | 'positive' | 'rejected';
  count: number;
  amount: number;
};

const TONE_CARD: Record<PipelineStage['tone'], string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-800',
  pending: 'border-amber-200 bg-amber-50 text-amber-900',
  positive: 'border-brand/30 bg-brand-surface text-brand',
  rejected: 'border-red-200 bg-red-50 text-red-900',
};

const TONE_DOT: Record<PipelineStage['tone'], string> = {
  neutral: 'bg-slate-400',
  pending: 'bg-amber-500',
  positive: 'bg-brand',
  rejected: 'bg-red-500',
};

export function PipelineStrip({ stages }: { stages: PipelineStage[] }) {
  return (
    <ol
      aria-label="Trip pipeline"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
    >
      {stages.map((s, i) => (
        <li key={s.key}>
          <div className={`relative h-full rounded-lg border p-3 ${TONE_CARD[s.tone]}`}>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${TONE_DOT[s.tone]}`}
                aria-hidden
              >
                {i + 1}
              </span>
              <p className="text-[11px] font-medium uppercase tracking-wide">
                {s.label}
              </p>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{s.count}</p>
            <p className="mt-0.5 text-xs opacity-80">{KES.format(s.amount)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
