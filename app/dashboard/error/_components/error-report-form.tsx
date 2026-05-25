'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const ISSUE_TYPES = [
  { value: 'GPS_NOT_WORKING', label: 'GPS not working / poor accuracy' },
  { value: 'TRIP_LOST', label: 'A trip disappeared or wouldn’t save' },
  { value: 'WRONG_AMOUNT', label: 'Wrong reimbursement amount' },
  { value: 'MPESA_UPLOAD_FAILED', label: 'M-Pesa screenshot wouldn’t upload' },
  { value: 'APP_CRASH', label: 'App crashed or froze' },
  { value: 'CANNOT_LOGIN', label: 'Can’t sign in' },
  { value: 'OTHER', label: 'Something else' },
] as const;

export function ErrorReportForm() {
  const [issueType, setIssueType] = useState<(typeof ISSUE_TYPES)[number]['value']>(
    'GPS_NOT_WORKING',
  );
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!description.trim()) {
      setError('Please describe what happened.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/error-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueType,
          description: description.trim(),
          // Auto-attached context — populated client-side because that's where
          // the truth lives. Server stamps its own createdAt independently.
          appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown',
          userAgent: navigator.userAgent,
          url: window.location.href,
          occurredAt: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Could not submit (${res.status})`);
        return;
      }
      setOk(true);
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit');
    } finally {
      setBusy(false);
    }
  }

  if (ok) {
    return (
      <div className="rounded-lg border border-l-4 border-l-brand bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold text-brand">Thanks — we got it.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Someone from the team will look into this. You don&apos;t need to do anything else.
        </p>
        <Button variant="outline" className="mt-4 h-11 w-full" onClick={() => setOk(false)}>
          Report another problem
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border bg-card p-5 shadow-sm"
    >
      <div className="space-y-1.5">
        <label htmlFor="issueType" className="text-sm font-medium">
          What went wrong?
        </label>
        <select
          id="issueType"
          value={issueType}
          onChange={(e) =>
            setIssueType(e.target.value as (typeof ISSUE_TYPES)[number]['value'])
          }
          className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ISSUE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Describe what happened
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          placeholder="What were you trying to do? What did you see? Anything else we should know?"
          className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          maxLength={4000}
        />
        <p className="text-[11px] text-muted-foreground">
          {description.length}/4000 characters
        </p>
      </div>

      <details className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-medium">
          What we&apos;ll attach automatically
        </summary>
        <ul className="mt-2 space-y-0.5">
          <li>App version: {process.env.NEXT_PUBLIC_APP_VERSION ?? 'unknown'}</li>
          <li>Browser / device (read from your browser at submit)</li>
          <li>Time of report</li>
          <li>Your user ID (if signed in)</li>
        </ul>
      </details>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>
        {busy ? 'Sending…' : 'Send report'}
      </Button>
    </form>
  );
}
