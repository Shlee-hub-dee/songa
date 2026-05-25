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

### User roles (enum)
FIELD_OFFICER | MANAGER | FINANCE | ADMIN

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
- Manager can only see trips from their own team
  (users WHERE manager_id = current_user.id)

### UI conventions
- Mobile-first, responsive at 600px+ for tablet
- Touch targets minimum 44px
- All forms: label → input pattern
- Status pills: coloured border-left on trip cards
- Bottom navigation: 4-5 tabs, role-aware