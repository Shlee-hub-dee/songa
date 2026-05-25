'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ClaimCardProps = {
  claim: {
    id: string;
    typeLabel: string;
    distanceKm: number;
    amountKes: number;
    waypointCount: number;
    submittedAt: string | null;
    officer: { id: string; name: string; region: string | null };
    payment: { mpesaRef: string; amountKes: number; screenshotPath: string | null } | null;
  };
};

const fmtKes = (v: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(v);

export function ClaimCard({ claim }: ClaimCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}/approve`, { method: 'PATCH' });
      if (!res.ok) {
        setError((await safeMessage(res)) ?? `Approve failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleReject() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A reason is required to reject.');
      return;
    }
    setBusy('reject');
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claim.id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: trimmed }),
      });
      if (!res.ok) {
        setError((await safeMessage(res)) ?? `Reject failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
    } finally {
      setBusy(null);
    }
  }

  async function viewScreenshot() {
    if (!claim.payment?.screenshotPath) return;
    try {
      const res = await fetch(
        `/api/storage/sign/${encodeURI(claim.payment.screenshotPath)}`,
      );
      if (!res.ok) {
        setError((await safeMessage(res)) ?? 'Could not open screenshot');
        return;
      }
      const { signedUrl } = (await res.json()) as { signedUrl: string };
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open screenshot');
    }
  }

  return (
    <article className="rounded-lg border border-l-4 border-l-brand bg-card shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{claim.officer.name}</h2>
          <p className="text-xs text-muted-foreground">
            {claim.officer.region ?? 'No region'} · {claim.typeLabel}
            {claim.submittedAt
              ? ` · submitted ${new Date(claim.submittedAt).toLocaleString()}`
              : null}
          </p>
        </div>
        <span className="rounded-full bg-brand-surface px-2.5 py-0.5 text-xs font-medium text-brand">
          Pending
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
        <Field label="Distance" value={`${claim.distanceKm.toFixed(2)} km`} />
        <Field label="Amount" value={fmtKes(claim.amountKes)} />
        <Field label="Waypoints" value={claim.waypointCount.toString()} />
        <Field
          label="M-Pesa ref"
          value={claim.payment?.mpesaRef ?? '—'}
          mono={!!claim.payment}
        />
      </dl>

      {claim.payment?.screenshotPath ? (
        <div className="border-t px-4 py-3">
          <button
            type="button"
            onClick={viewScreenshot}
            className="text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            View M-Pesa screenshot
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mx-4 mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {rejecting ? (
        <div className="space-y-2 border-t p-4">
          <label htmlFor={`reason-${claim.id}`} className="text-sm font-medium">
            Reason for rejection
          </label>
          <textarea
            id={`reason-${claim.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            required
            placeholder="Tell the officer what to fix or why this can't be reimbursed."
            className="w-full rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="h-11 flex-1"
              onClick={handleReject}
              disabled={busy !== null || !reason.trim()}
            >
              {busy === 'reject' ? 'Rejecting…' : 'Confirm reject'}
            </Button>
            <Button
              variant="ghost"
              className="h-11 flex-1"
              onClick={() => {
                setRejecting(false);
                setReason('');
                setError(null);
              }}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 border-t p-4">
          <Button
            className="h-11 flex-1"
            onClick={handleApprove}
            disabled={busy !== null}
          >
            {busy === 'approve' ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            variant="outline"
            className={cn('h-11 flex-1 border-red-200 text-red-700 hover:bg-red-50')}
            onClick={() => setRejecting(true)}
            disabled={busy !== null}
          >
            Reject
          </Button>
        </div>
      )}
    </article>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-0.5 font-medium text-foreground',
          mono ? 'font-mono text-sm' : 'text-sm',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

async function safeMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? null;
  } catch {
    return null;
  }
}
