import type { Role } from '@/lib/roles';

// One source of truth for both the desktop sidebar and the mobile bottom nav.
// Order matters — first item is "Overview", subsequent items render in the
// order declared here.
//
// Routes that don't yet have a dedicated page point at the closest existing
// view; stubs live in /app/dashboard/admin/* and /app/dashboard/finance/*.

export type NavIcon =
  | 'overview'
  | 'trips'
  | 'submit'
  | 'approvals'
  | 'report'
  | 'disbursements'
  | 'statements'
  | 'users'
  | 'org'
  | 'allTrips'
  | 'settings';

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
};

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  TUPANDE_AGENT: [
    { label: 'Overview', href: '/dashboard/officer', icon: 'overview' },
    { label: 'My Trips', href: '/dashboard/officer#trips', icon: 'trips' },
    { label: 'Submit Claim', href: '/dashboard/trips/new', icon: 'submit' },
  ],
  ZONE_SUPERVISOR: [
    { label: 'Overview', href: '/dashboard/approvals', icon: 'overview' },
    { label: 'My Trips', href: '/dashboard/officer', icon: 'trips' },
    { label: 'Approvals', href: '/dashboard/approvals', icon: 'approvals' },
    { label: 'Team Report', href: '/dashboard/analytics', icon: 'report' },
  ],
  AREA_COORDINATOR: [
    { label: 'Overview', href: '/dashboard/approvals', icon: 'overview' },
    { label: 'My Trips', href: '/dashboard/officer', icon: 'trips' },
    { label: 'Approvals', href: '/dashboard/approvals', icon: 'approvals' },
    { label: 'Team Report', href: '/dashboard/analytics', icon: 'report' },
  ],
  REGIONAL_MANAGER: [
    // No My Trips or Submit Claim — RMs do not log trips.
    { label: 'Overview', href: '/dashboard/approvals', icon: 'overview' },
    { label: 'Approvals', href: '/dashboard/approvals', icon: 'approvals' },
    { label: 'Team Report', href: '/dashboard/analytics', icon: 'report' },
  ],
  FINANCE_MANAGER: [
    { label: 'Overview', href: '/dashboard/finance', icon: 'overview' },
    { label: 'Disbursements', href: '/dashboard/finance', icon: 'disbursements' },
    { label: 'Reports', href: '/dashboard/analytics', icon: 'report' },
    { label: 'Officer Statements', href: '/dashboard/finance/statements', icon: 'statements' },
  ],
  ADMIN: [
    { label: 'Overview', href: '/dashboard/admin/rates', icon: 'overview' },
    { label: 'All Trips', href: '/dashboard/admin/trips', icon: 'allTrips' },
    { label: 'Users', href: '/dashboard/admin/users', icon: 'users' },
    { label: 'Org Chart', href: '/dashboard/admin/org', icon: 'org' },
    { label: 'Reports', href: '/dashboard/analytics', icon: 'report' },
    { label: 'Settings', href: '/dashboard/admin/rates', icon: 'settings' },
  ],
};
