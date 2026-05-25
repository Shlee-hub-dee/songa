'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ClaimRow = {
  id: string;
  typeLabel: string;
  typeCode: string;
  distanceKm: number;
  ratePerKm: number;
  amountKes: number;
  startTime: string;
  endTime: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  officer: { id: string; name: string; email: string; region: string | null };
  approverName: string | null;
  payment: {
    mpesaRef: string;
    amountKes: number;
    recipientPhone: string;
    paidAt: string;
  } | null;
};

const fmtKes = (v: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(v);

const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-KE', { dateStyle: 'short' }).format(new Date(iso)) : '—';

export function ClaimsTable({ rows }: { rows: ClaimRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'export' | 'reimburse' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const selectedTotal = useMemo(
    () => rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.amountKes, 0),
    [rows, selected],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  async function handleExport() {
    setBusy('export');
    setError(null);
    try {
      // Dynamic import — keeps the ~400KB xlsx bundle out of the initial page.
      const XLSX = await import('xlsx');
      const data = rows.map((r) => ({
        'Trip ID': r.id,
        Officer: r.officer.name,
        Email: r.officer.email,
        Region: r.officer.region ?? '',
        'Trip type': r.typeLabel,
        'Start time': r.startTime,
        'End time': r.endTime ?? '',
        Submitted: r.submittedAt ?? '',
        Approved: r.approvedAt ?? '',
        'Approved by': r.approverName ?? '',
        'Distance (km)': r.distanceKm,
        'Rate per km': r.ratePerKm,
        'Amount (KES)': r.amountKes,
        'M-Pesa ref': r.payment?.mpesaRef ?? '',
        'M-Pesa amount': r.payment?.amountKes ?? '',
        Recipient: r.payment?.recipientPhone ?? '',
        'Paid at': r.payment?.paidAt ?? '',
        Notes: r.notes ?? '',
      }));
      const sheet = XLSX.utils.json_to_sheet(data);
      // Reasonable column widths so it's readable on open.
      sheet['!cols'] = [
        { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 18 },
        { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 16 }, { wch: 20 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Approved claims');
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `songa-approved-claims-${stamp}.xlsx`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleReimburse() {
    if (selected.size === 0) return;
    setBusy('reimburse');
    setError(null);
    setOkMsg(null);
    try {
      const res = await fetch('/api/claims/reimburse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tripIds: Array.from(selected) }),
      });
      const body = (await res.json().catch(() => null)) as
        | { reimbursed: string[]; skipped: string[]; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Reimburse failed (${res.status})`);
        return;
      }
      const n = body?.reimbursed.length ?? 0;
      const skipped = body?.skipped.length ?? 0;
      setOkMsg(
        `Reimbursed ${n} ${n === 1 ? 'claim' : 'claims'}${skipped ? `, skipped ${skipped}` : ''}.`,
      );
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reimburse failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleExport}
          disabled={rows.length === 0 || busy !== null}
        >
          {busy === 'export' ? 'Exporting…' : 'Export to Excel'}
        </Button>
        <Button
          type="button"
          onClick={handleReimburse}
          disabled={selected.size === 0 || busy !== null}
        >
          {busy === 'reimburse'
            ? 'Reimbursing…'
            : selected.size > 0
              ? `Reimburse ${selected.size} (${fmtKes(selectedTotal)})`
              : 'Reimburse selected'}
        </Button>
        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear selection
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {okMsg ? (
        <p className="rounded-md bg-brand-surface px-3 py-2 text-sm text-brand">{okMsg}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-brand-surface text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  disabled={rows.length === 0}
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Approved</th>
              <th className="px-3 py-2.5 font-medium">Officer</th>
              <th className="px-3 py-2.5 font-medium">Region</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium text-right">Distance</th>
              <th className="px-3 py-2.5 font-medium text-right">Amount</th>
              <th className="px-3 py-2.5 font-medium">M-Pesa ref</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  No claims match these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className={cn(selected.has(r.id) && 'bg-brand-surface/50')}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select claim ${r.id}`}
                    />
                  </td>
                  <td className="px-3 py-2.5">{fmtDate(r.approvedAt)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-foreground">{r.officer.name}</div>
                    <div className="text-xs text-muted-foreground">{r.officer.email}</div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {r.officer.region ?? '—'}
                  </td>
                  <td className="px-3 py-2.5">{r.typeLabel}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.distanceKm.toFixed(2)} km
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                    {fmtKes(r.amountKes)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {r.payment?.mpesaRef ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
