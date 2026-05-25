'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

// datetime-local needs "YYYY-MM-DDTHH:MM" in local time. Build it without
// timezone gymnastics from the user.
function nowLocalDatetimeInputValue() {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewRateForm() {
  const router = useRouter();
  const [rate, setRate] = useState('');
  const [effective, setEffective] = useState(nowLocalDatetimeInputValue());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setError('Rate must be greater than 0.');
      return;
    }
    if (!effective) {
      setError('Effective date is required.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/rates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ratePerKm: rateNum,
          // datetime-local has no zone; convert to an ISO string.
          effectiveDate: new Date(effective).toISOString(),
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      setOkMsg('Rate saved.');
      setRate('');
      setNotes('');
      setEffective(nowLocalDatetimeInputValue());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-5 shadow-sm"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Set a new rate
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Trips that start on or after the effective date use this rate.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="rate" className="text-sm font-medium">
          Rate per km (KES)
        </label>
        <input
          id="rate"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g. 35.00"
          required
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="effective" className="text-sm font-medium">
          Effective from
        </label>
        <input
          id="effective"
          type="datetime-local"
          value={effective}
          onChange={(e) => setEffective(e.target.value)}
          required
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Fuel price change, policy update, etc."
          maxLength={500}
          className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {okMsg ? (
        <p className="rounded-md bg-brand-surface px-3 py-2 text-sm text-brand">{okMsg}</p>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Save rate'}
      </Button>
    </form>
  );
}
