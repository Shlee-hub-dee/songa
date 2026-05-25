'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  officers: { id: string; name: string }[];
  regions: string[];
  initial: { from: string; to: string; officerId: string; region: string };
};

export function FiltersForm({ officers, regions, initial }: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [officerId, setOfficerId] = useState(initial.officerId);
  const [region, setRegion] = useState(initial.region);
  const [pending, startTransition] = useTransition();

  function buildQuery() {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (officerId) params.set('officerId', officerId);
    if (region) params.set('region', region);
    return params.toString();
  }

  function handleApply(e: React.FormEvent) {
    e.preventDefault();
    const qs = buildQuery();
    startTransition(() => router.push(`/dashboard/finance${qs ? `?${qs}` : ''}`));
  }

  function handleReset() {
    setFrom('');
    setTo('');
    setOfficerId('');
    setRegion('');
    startTransition(() => router.push('/dashboard/finance'));
  }

  return (
    <form
      onSubmit={handleApply}
      className="grid gap-3 rounded-lg border bg-card p-4 shadow-sm sm:grid-cols-5"
    >
      <FilterField id="from" label="Approved from">
        <input
          id="from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </FilterField>

      <FilterField id="to" label="Approved to">
        <input
          id="to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </FilterField>

      <FilterField id="officer" label="Officer">
        <select
          id="officer"
          value={officerId}
          onChange={(e) => setOfficerId(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All officers</option>
          {officers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField id="region" label="Region">
        <select
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </FilterField>

      <div className="flex items-end gap-2">
        <Button type="submit" className="h-10 flex-1" disabled={pending}>
          {pending ? 'Loading…' : 'Apply'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10"
          onClick={handleReset}
          disabled={pending}
        >
          Reset
        </Button>
      </div>
    </form>
  );
}

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
