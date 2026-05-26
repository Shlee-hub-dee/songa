import { AlertCircle } from 'lucide-react';
import { ROLE_LABEL, type Role } from '@/lib/roles';

// Inline banner rendered at the top of a role-home page when middleware /
// route layout redirected the user there because they attempted something
// not permitted by their role (currently: trip logging for RM / FM / ADMIN).
//
// Pass `role` when known so the message names the user's role explicitly.
export function BlockedNotice({ role, reason }: { role?: Role; reason: 'trip-log' }) {
  const roleLabel = role ? ROLE_LABEL[role] : 'your role';
  const messageByReason: Record<'trip-log', string> = {
    'trip-log':
      `Trip logging is not available for ${roleLabel}s. Trip recording is reserved for ` +
      `Tupande Agents, Zone Supervisors, and Area Coordinators.`,
  };

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-sm"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">Action not available for your role</p>
        <p className="mt-0.5 opacity-90">{messageByReason[reason]}</p>
      </div>
    </div>
  );
}
