import { AlertCircle } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/roles';

// Inline banner rendered at the top of a role-home page when middleware or
// a route guard redirected the user there because they tried to enter a
// section their role isn't allowed in.
//
// Pass `role` when known so the message names the user's role explicitly.

export type BlockedReason =
  | 'trip-log'
  | 'admin-only'
  | 'finance-only'
  | 'approvers-only';

const ALL_REASONS: readonly BlockedReason[] = [
  'trip-log',
  'admin-only',
  'finance-only',
  'approvers-only',
] as const;

// Helper used by every role-home page so they all parse the `?blocked=` query
// parameter consistently. Returns `null` for unknown / missing values.
export function parseBlockedReason(raw: string | undefined): BlockedReason | null {
  if (!raw) return null;
  return (ALL_REASONS as readonly string[]).includes(raw)
    ? (raw as BlockedReason)
    : null;
}

const REASON_TITLE: Record<BlockedReason, string> = {
  'trip-log': 'Trip logging is not available for your role',
  'admin-only': 'Admin area is restricted',
  'finance-only': 'Finance area is restricted',
  'approvers-only': 'Approvals are restricted to direct managers',
};

function messageFor(reason: BlockedReason, roleLabel: string): string {
  switch (reason) {
    case 'trip-log':
      return (
        `This action is not available for ${roleLabel}s. Trip recording is ` +
        `reserved for Tupande Agents, Zone Supervisors, and Area Coordinators.`
      );
    case 'admin-only':
      return (
        `This area is restricted to Admins. ${roleLabel}s can find their ` +
        `tools through the sidebar.`
      );
    case 'finance-only':
      return (
        `This area is restricted to Finance Managers and Admins. ` +
        `${roleLabel}s don't have access to disbursement tools.`
      );
    case 'approvers-only':
      return (
        `Approvals are restricted to managers who have direct reports. ` +
        `${roleLabel}s can submit their own trips but cannot approve others'.`
      );
  }
}

export function BlockedNotice({
  role,
  reason,
}: {
  role?: Role;
  reason: BlockedReason;
}) {
  const roleLabel = role ? ROLE_LABEL[role] : 'your role';
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">{REASON_TITLE[reason]}</p>
        <p className="mt-0.5 opacity-90">{messageFor(reason, roleLabel)}</p>
      </div>
    </div>
  );
}
