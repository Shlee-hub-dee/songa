'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ROLE_LABEL, type Role } from '@/lib/roles';
import { parsePeriod, periodToString } from '../_lib/period';

// Server-fetch driven filter bar: every change rewrites the URL search
// params and the server re-fetches with the new filter set. Keeps the
// query state shareable and deep-linkable.

const ROLE_OPTIONS: readonly Role[] = [
  'TUPANDE_AGENT',
  'ZONE_SUPERVISOR',
  'AREA_COORDINATOR',
] as const;

export function FilterBar({ regions }: { regions: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  const period = useMemo(() => parsePeriod(sp.get('period') ?? undefined), [sp]);
  const periodType = period.type;
  const periodValue = periodToString(period);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, sp],
  );

  const onPeriodTypeChange = useCallback(
    (newType: 'all' | 'month' | 'quarter') => {
      if (newType === 'all') {
        setParam('period', null);
        return;
      }
      const now = new Date();
      if (newType === 'month') {
        setParam(
          'period',
          `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        );
      } else {
        const q = Math.floor(now.getMonth() / 3) + 1;
        setParam('period', `${now.getFullYear()}-Q${q}`);
      }
    },
    [setParam],
  );

  return (
    <div className="grid grid-cols-2 gap-2 tablet:grid-cols-4">
      <Field label="Period type">
        <select
          value={periodType}
          onChange={(e) =>
            onPeriodTypeChange(e.target.value as 'all' | 'month' | 'quarter')
          }
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All time</option>
          <option value="month">Month</option>
          <option value="quarter">Quarter</option>
        </select>
      </Field>

      {periodType === 'month' ? (
        <Field label="Month">
          <input
            type="month"
            value={periodValue}
            onChange={(e) => setParam('period', e.target.value || null)}
            className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>
      ) : periodType === 'quarter' ? (
        <Field label="Quarter">
          <select
            value={periodValue}
            onChange={(e) => setParam('period', e.target.value || null)}
            className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {buildQuarterOptions().map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div /> /* spacer */
      )}

      <Field label="Region">
        <select
          value={sp.get('region') ?? ''}
          onChange={(e) => setParam('region', e.target.value || null)}
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Role">
        <select
          value={sp.get('role') ?? ''}
          onChange={(e) => setParam('role', e.target.value || null)}
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All roles</option>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function buildQuarterOptions(): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 1; y--) {
    for (let q = 4; q >= 1; q--) {
      out.push(`${y}-Q${q}`);
    }
  }
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
