// Tupande role hierarchy and authorization rules.
//
// Single source of truth for who can do what; every middleware/page/API route
// imports from here so changing the org policy means editing one file.

export type Role =
  | 'TUPANDE_AGENT'
  | 'ZONE_SUPERVISOR'
  | 'AREA_COORDINATOR'
  | 'REGIONAL_MANAGER'
  | 'FINANCE_MANAGER'
  | 'ADMIN';

export type UnitLevel = 'ZONE' | 'AREA' | 'REGION';

export const ALL_ROLES: readonly Role[] = [
  'TUPANDE_AGENT',
  'ZONE_SUPERVISOR',
  'AREA_COORDINATOR',
  'REGIONAL_MANAGER',
  'FINANCE_MANAGER',
  'ADMIN',
] as const;

// Roles that may LOG (create) trips. RM / FM / ADMIN are blocked at the
// middleware, page, and API layers — three rings of defence.
export const LOGGING_ROLES: readonly Role[] = [
  'TUPANDE_AGENT',
  'ZONE_SUPERVISOR',
  'AREA_COORDINATOR',
] as const;

export function canLogTrips(role: Role): boolean {
  return (LOGGING_ROLES as readonly Role[]).includes(role);
}

// Approval chain: for each role that can submit a trip, which role must the
// approver hold? Enforced in API routes alongside the "must be your direct
// manager" check.
//
//   TUPANDE_AGENT     → approved by ZONE_SUPERVISOR
//   ZONE_SUPERVISOR   → approved by AREA_COORDINATOR
//   AREA_COORDINATOR  → approved by REGIONAL_MANAGER
//   REGIONAL_MANAGER  → approved by ADMIN (finance disburses after)
//   FINANCE_MANAGER   → does not submit trips (no entry)
//   ADMIN             → does not submit trips (no entry)
export const APPROVER_ROLE_FOR: Partial<Record<Role, Role>> = {
  TUPANDE_AGENT: 'ZONE_SUPERVISOR',
  ZONE_SUPERVISOR: 'AREA_COORDINATOR',
  AREA_COORDINATOR: 'REGIONAL_MANAGER',
  REGIONAL_MANAGER: 'ADMIN',
};

// Reverse view: which roles does a given approver act on?
export const REPORTS_ROLES_FOR: Partial<Record<Role, readonly Role[]>> = {
  ZONE_SUPERVISOR: ['TUPANDE_AGENT'],
  AREA_COORDINATOR: ['ZONE_SUPERVISOR'],
  REGIONAL_MANAGER: ['AREA_COORDINATOR'],
  ADMIN: ['REGIONAL_MANAGER'],
};

export function expectedApproverRole(submitterRole: Role): Role | null {
  return APPROVER_ROLE_FOR[submitterRole] ?? null;
}

export function isApproverRole(role: Role): boolean {
  return role in REPORTS_ROLES_FOR;
}

// Only FINANCE_MANAGER disburses. ADMIN is intentionally NOT a fallback —
// disbursal is finance's exclusive responsibility per the org policy.
export function canDisburse(role: Role): boolean {
  return role === 'FINANCE_MANAGER';
}

export function canManageRates(role: Role): boolean {
  return role === 'ADMIN';
}

// Where each role lands after sign-in.
export const ROLE_HOME: Record<Role, string> = {
  TUPANDE_AGENT: '/dashboard/officer',
  ZONE_SUPERVISOR: '/dashboard/approvals',
  AREA_COORDINATOR: '/dashboard/approvals',
  REGIONAL_MANAGER: '/dashboard/approvals',
  FINANCE_MANAGER: '/dashboard/finance',
  ADMIN: '/dashboard/admin',
};

// Short human labels for chips/headers.
export const ROLE_LABEL: Record<Role, string> = {
  TUPANDE_AGENT: 'Tupande Agent',
  ZONE_SUPERVISOR: 'Zone Supervisor',
  AREA_COORDINATOR: 'Area Coordinator',
  REGIONAL_MANAGER: 'Regional Manager',
  FINANCE_MANAGER: 'Finance Manager',
  ADMIN: 'Admin',
};
