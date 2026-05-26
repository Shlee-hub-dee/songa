// Status pill matching the palette used elsewhere (officer dashboard,
// approvals card). Exported here so every admin table renders the same chip.

const STATUS_PILL: Record<
  'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED',
  { label: string; className: string }
> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-100 text-slate-700' },
  PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-900' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-900' },
  REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-900' },
  REIMBURSED: { label: 'Disbursed', className: 'bg-brand text-white' },
};

export function StatusPill({
  status,
}: {
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
}) {
  const cfg = STATUS_PILL[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
