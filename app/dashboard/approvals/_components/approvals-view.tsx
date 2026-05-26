'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { type Role } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { TripSidePanel } from '@/components/trip/trip-side-panel';
import { ClaimCard, type ClaimCardProps } from './claim-card';
import { TeamReportSection, type TeamTripRow } from './team-report';
import { MyTripsTable, type MyTripRow } from './my-trips-table';
import { StatusBreakdownChart } from '../../analytics/_components/status-breakdown-chart';

// Top-level interactive shell for the approvals page. Owns:
//  - the tab state (Approvals / My Trips for ZS+AC; Approvals only for RM)
//  - the side-panel state (which trip is open)
// The Team Report section + status donut render below the tabs and are
// always visible regardless of which tab is selected.

const STATUS_DONUT_COLORS: Record<string, string> = {
  Pending: '#F59E0B',
  Approved: '#7AB648',
  Rejected: '#EF4444',
  Disbursed: '#006B3F',
};

export function ApprovalsView({
  role,
  claims,
  myTrips,
  teamTrips,
  monthBreakdown,
  showMyTripsTab,
}: {
  role: Role;
  claims: ClaimCardProps['claim'][];
  myTrips: MyTripRow[];
  teamTrips: TeamTripRow[];
  monthBreakdown: { status: string; count: number }[];
  /** ZS / AC can log trips so they get a My Trips tab; RM does not. */
  showMyTripsTab: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'approvals' | 'mytrips'>('approvals');
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);

  const donutData = monthBreakdown
    .map((s) => ({
      status: s.status,
      count: s.count,
      color: STATUS_DONUT_COLORS[s.status] ?? '#94A3B8',
    }))
    .filter((d) => d.count >= 0);

  return (
    <>
      {/* ── Tab strip ── */}
      {showMyTripsTab ? (
        <div
          role="tablist"
          aria-label="Approver tabs"
          className="mb-4 inline-flex rounded-md border bg-card p-0.5 text-sm font-medium"
        >
          <TabButton active={tab === 'approvals'} onClick={() => setTab('approvals')}>
            Approvals
            {claims.length > 0 ? (
              <span className="ml-1.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">
                {claims.length}
              </span>
            ) : null}
          </TabButton>
          <TabButton active={tab === 'mytrips'} onClick={() => setTab('mytrips')}>
            My Trips
          </TabButton>
        </div>
      ) : null}

      {/* ── Tab body ── */}
      {tab === 'approvals' ? (
        <section aria-label="Pending approvals">
          {claims.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              Nothing waiting on you right now. When your direct reports submit
              trips, they&apos;ll appear here.
            </div>
          ) : (
            <ul className="grid gap-3 tablet:grid-cols-2">
              {claims.map((c) => (
                <li key={c.id}>
                  <ClaimCard claim={c} onOpen={setSelectedTripId} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <MyTripsTable rows={myTrips} onOpen={setSelectedTripId} />
      )}

      {/* ── Below tabs: always visible ── */}
      <section className="mt-6 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
        <header className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-foreground sm:text-lg">
            This month — status breakdown
          </h2>
          <p className="hidden text-xs text-muted-foreground tablet:block">
            Direct-report trips only
          </p>
        </header>
        <div className="h-56 w-full sm:h-64">
          <StatusBreakdownChart data={donutData} />
        </div>
      </section>

      <TeamReportSection rows={teamTrips} onOpen={setSelectedTripId} />

      <TripSidePanel
        tripId={selectedTripId}
        onClose={() => setSelectedTripId(null)}
        approver={{
          // Approve/Reject in the side panel re-uses /api/claims/[id]/approve|reject
          // — the same APIs the inline card buttons hit. Both paths enforce
          // no-self, direct-report, and role-tier rules server-side.
          onChanged: () => router.refresh(),
        }}
      />

      {/* role var is purely informational here, but ESLint flags unused props */}
      <span className="sr-only">{role}</span>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded px-3 py-1.5 transition-colors',
        active ? 'bg-brand text-white' : 'text-muted-foreground hover:text-brand',
      )}
    >
      {children}
    </button>
  );
}
