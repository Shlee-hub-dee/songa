# Songa — Field Transport Manager
## One Acre Fund

### Project overview
Mobile-first PWA for field officer transport reimbursement.
Songa = "move forward" in Swahili.

### Brand
- Primary green: #006B3F (One Acre Fund)
- Secondary green: #7AB648
- Orange accent: #F7941D
- Background: #F2F7F4

### Tech stack
- Framework: Next.js 14, App Router, TypeScript
- Styling: Tailwind CSS + shadcn/ui
- ORM: Prisma
- Database: Supabase PostgreSQL
- Auth: Supabase Auth + NextAuth.js
- Storage: Supabase Storage (private bucket: mpesa-screenshots)
- Realtime: Supabase Realtime (WebSocket notifications)
- Deployment: Vercel

### User roles (enum) — Tupande organisational hierarchy
TUPANDE_AGENT | ZONE_SUPERVISOR | AREA_COORDINATOR |
REGIONAL_MANAGER | FINANCE_MANAGER | ADMIN

### Organisational unit
- organisationalUnit: free-text label, e.g. "Nakuru West Zone",
  "Rift Valley Region"
- unitLevel: ZONE | AREA | REGION (null for FINANCE_MANAGER, ADMIN)

### Trip logging permissions
- TUPANDE_AGENT: can log trips
- ZONE_SUPERVISOR: can log trips
- AREA_COORDINATOR: can log trips
- REGIONAL_MANAGER: cannot log trips — approvals only
- FINANCE_MANAGER: cannot log trips — disbursements only
- ADMIN: cannot log trips — system management only

Enforcement is three-layered: middleware redirects from
/dashboard/trips/new for blocked roles, the page layout
server-guards the same route, and POST /api/trips returns 403
ROLE_CANNOT_LOG_TRIPS.

### Approval rules (enforced in every API route)
- TUPANDE_AGENT trips → approved only by their assigned
  ZONE_SUPERVISOR
- ZONE_SUPERVISOR trips → approved only by their assigned
  AREA_COORDINATOR
- AREA_COORDINATOR trips → approved only by their assigned
  REGIONAL_MANAGER
- REGIONAL_MANAGER trips → approved by ADMIN; FINANCE_MANAGER
  disburses afterwards
- No user can approve their own trip — ever, including ADMIN
- Each approver only sees trips from their direct reports
  (users WHERE manager_id = current_user.id)
- Single source of truth for who-approves-whom: lib/roles.ts
  → APPROVER_ROLE_FOR

### Trip status (enum)
DRAFT | PENDING | APPROVED | REJECTED | REIMBURSED

### Trip types
Farmer Enrollment | Group Training | Loan Follow-up
Input Distribution | Other

### Key rules
- Rate is always resolved server-side: SELECT rate_per_km FROM
  rate_configs WHERE effective_date <= trip.start_time
  ORDER BY effective_date DESC LIMIT 1
- mpesa_ref has UNIQUE constraint (fraud guard)
- GPS uses watchPosition + accuracy filter (reject > 50m)
- Every state change writes to audit_log
- Disbursal is FINANCE_MANAGER's exclusive responsibility —
  ADMIN is not a fallback (separation of duties)

### UI conventions
- Mobile-first, responsive at 600px+ for tablet
- Touch targets minimum 44px
- All forms: label → input pattern
- Status pills: coloured border-left on trip cards
- Bottom navigation: 4-5 tabs, role-aware