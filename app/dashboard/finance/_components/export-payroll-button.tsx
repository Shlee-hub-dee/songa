'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/roles';

export type PayrollRow = {
  officerId: string;
  name: string;
  phone: string | null;
  mpesaNumber: string | null;
  organisationalUnit: string | null;
  role: Role;
  totalTrips: number;
  totalKm: number;
  totalAmount: number;
};

// Generates an .xlsx file in the browser using SheetJS. One row per officer
// with pending claims; columns match the payroll-team spec.
export function ExportPayrollButton({ rows }: { rows: PayrollRow[] }) {
  const [busy, setBusy] = useState(false);

  async function exportFile() {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      // Lazy-import xlsx to keep the (~600kB) library out of the initial
      // finance-page bundle. Cost only paid the first time the FM clicks
      // the button.
      const XLSX = await import('xlsx');
      const data = rows.map((r) => ({
        'Officer name': r.name,
        'Phone number': r.phone ?? '',
        'M-Pesa number': r.mpesaNumber ?? r.phone ?? '',
        'Organisational unit': r.organisationalUnit ?? '',
        Role: ROLE_LABEL[r.role],
        'Total trips': r.totalTrips,
        'Total KMs': Number(r.totalKm.toFixed(2)),
        'Total amount (KES)': Number(r.totalAmount.toFixed(2)),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      // Set readable column widths.
      ws['!cols'] = [
        { wch: 24 }, { wch: 16 }, { wch: 16 }, { wch: 24 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Disbursement');
      const ymd = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `songa-disbursement-${ymd}.xlsx`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={exportFile}
      disabled={busy || rows.length === 0}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
    >
      <Download className="h-4 w-4" aria-hidden />
      {busy ? 'Generating…' : 'Export to payroll'}
    </button>
  );
}
