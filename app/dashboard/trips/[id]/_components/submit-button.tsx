'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

type Props = {
  tripId: string;
  hasPayment: boolean;
};

export function SubmitForApprovalButton({ tripId, hasPayment }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/submit`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Submit failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="h-14 w-full text-base"
        onClick={handleSubmit}
        disabled={!hasPayment || submitting}
        title={!hasPayment ? 'Attach an M-Pesa payment first' : undefined}
      >
        {submitting ? 'Submitting…' : 'Submit for approval'}
      </Button>
      {!hasPayment ? (
        <p className="text-center text-xs text-muted-foreground">
          Attach an M-Pesa payment above to enable submission.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
    </div>
  );
}
