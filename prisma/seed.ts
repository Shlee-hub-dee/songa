/**
 * Songa seed — Tupande organisational hierarchy.
 *
 * Org tree:
 *   1   ADMIN
 *   1   FINANCE_MANAGER         (added so the disbursement flow is testable
 *                                end-to-end in dev; the spec listed 31 users
 *                                without one, but the demo isn't complete
 *                                without finance to clear the queue)
 *   2   REGIONAL_MANAGERs       (Rift Valley, Western) — do not log trips
 *   4   AREA_COORDINATORs       (2 per region) — log trips
 *   8   ZONE_SUPERVISORs        (2 per area) — log trips
 *  16   TUPANDE_AGENTs          (2 per zone) — log trips
 *
 * Plus rates, a realistic mix of trip statuses across the logging-allowed
 * roles, M-Pesa payments, and audit log entries for each state transition.
 *
 * Idempotent: wipes the tables it owns before re-seeding. Never run this
 * against production.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv();
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../lib/generated/prisma/client';
import { normalizeDbUrl } from '../lib/db-url';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local before seeding.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: normalizeDbUrl(process.env.DATABASE_URL) }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ALPHA_NO_AMBIG = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // skip 0/O/1/I/L like real M-Pesa
const usedRefs = new Set<string>();

function mpesaRef(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let s = 'QK';
    for (let i = 0; i < 8; i++) {
      s += ALPHA_NO_AMBIG[Math.floor(Math.random() * ALPHA_NO_AMBIG.length)];
    }
    if (!usedRefs.has(s)) {
      usedRefs.add(s);
      return s;
    }
  }
  throw new Error('Could not generate unique M-Pesa ref');
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function jitterCoord(base: number, spread = 0.05): number {
  return base + (Math.random() - 0.5) * spread * 2;
}

// ─── Wipe ────────────────────────────────────────────────────────────────────

async function wipe() {
  // FK constraint order: dependents first.
  await prisma.errorReport.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.mpesaPayment.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.rateConfig.deleteMany();
  await prisma.user.deleteMany();
}

// ─── Org tree ────────────────────────────────────────────────────────────────

type RegionSpec = {
  name: string;          // "Rift Valley", "Western"
  unitLabel: string;     // "Rift Valley Region"
  rmEmail: string;
  rmName: string;
  rmPhone: string;
  areas: AreaSpec[];
};

type AreaSpec = {
  name: string;          // "Nakuru", "Eldoret"
  unitLabel: string;     // "Nakuru Area"
  acEmail: string;
  acName: string;
  acPhone: string;
  zones: ZoneSpec[];
  origin: { lat: number; lng: number };
};

type ZoneSpec = {
  name: string;          // "Nakuru West"
  unitLabel: string;     // "Nakuru West Zone"
  zsEmail: string;
  zsName: string;
  zsPhone: string;
  agents: AgentSpec[];
};

type AgentSpec = { email: string; name: string; phone: string };

const ORG: RegionSpec[] = [
  {
    name: 'Rift Valley',
    unitLabel: 'Rift Valley Region',
    rmEmail: 'david.kiprop@tupande.dev',
    rmName: 'David Kiprop',
    rmPhone: '+254700001000',
    areas: [
      {
        name: 'Nakuru',
        unitLabel: 'Nakuru Area',
        acEmail: 'mercy.wairimu@tupande.dev',
        acName: 'Mercy Wairimu',
        acPhone: '+254700002001',
        origin: { lat: -0.3, lng: 36.08 },
        zones: [
          {
            name: 'Nakuru West',
            unitLabel: 'Nakuru West Zone',
            zsEmail: 'peter.macharia@tupande.dev',
            zsName: 'Peter Macharia',
            zsPhone: '+254700003001',
            agents: [
              { email: 'john.kamau@tupande.dev', name: 'John Kamau', phone: '+254712100001' },
              { email: 'faith.nyambura@tupande.dev', name: 'Faith Nyambura', phone: '+254712100002' },
            ],
          },
          {
            name: 'Nakuru East',
            unitLabel: 'Nakuru East Zone',
            zsEmail: 'sarah.chebet@tupande.dev',
            zsName: 'Sarah Chebet',
            zsPhone: '+254700003002',
            agents: [
              { email: 'paul.mwangi@tupande.dev', name: 'Paul Mwangi', phone: '+254712100003' },
              { email: 'lillian.wambui@tupande.dev', name: 'Lillian Wambui', phone: '+254712100004' },
            ],
          },
        ],
      },
      {
        name: 'Eldoret',
        unitLabel: 'Eldoret Area',
        acEmail: 'samuel.kibet@tupande.dev',
        acName: 'Samuel Kibet',
        acPhone: '+254700002002',
        origin: { lat: 0.52, lng: 35.27 },
        zones: [
          {
            name: 'Eldoret South',
            unitLabel: 'Eldoret South Zone',
            zsEmail: 'esther.wanjiru@tupande.dev',
            zsName: 'Esther Wanjiru',
            zsPhone: '+254700003003',
            agents: [
              { email: 'grace.jelagat@tupande.dev', name: 'Grace Jelagat', phone: '+254712200001' },
              { email: 'daniel.rotich@tupande.dev', name: 'Daniel Rotich', phone: '+254712200002' },
            ],
          },
          {
            name: 'Eldoret North',
            unitLabel: 'Eldoret North Zone',
            zsEmail: 'philip.langat@tupande.dev',
            zsName: 'Philip Langat',
            zsPhone: '+254700003004',
            agents: [
              { email: 'ruth.chepkurui@tupande.dev', name: 'Ruth Chepkurui', phone: '+254712200003' },
              { email: 'ben.kipruto@tupande.dev', name: 'Ben Kipruto', phone: '+254712200004' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'Western',
    unitLabel: 'Western Region',
    rmEmail: 'agnes.musungu@tupande.dev',
    rmName: 'Agnes Musungu',
    rmPhone: '+254700001001',
    areas: [
      {
        name: 'Kakamega',
        unitLabel: 'Kakamega Area',
        acEmail: 'george.shikuku@tupande.dev',
        acName: 'George Shikuku',
        acPhone: '+254700002003',
        origin: { lat: 0.28, lng: 34.75 },
        zones: [
          {
            name: 'Kakamega South',
            unitLabel: 'Kakamega South Zone',
            zsEmail: 'lydia.akinyi@tupande.dev',
            zsName: 'Lydia Akinyi',
            zsPhone: '+254700003005',
            agents: [
              { email: 'mary.nafula@tupande.dev', name: 'Mary Nafula', phone: '+254712300001' },
              { email: 'samuel.barasa@tupande.dev', name: 'Samuel Barasa', phone: '+254712300002' },
            ],
          },
          {
            name: 'Kakamega North',
            unitLabel: 'Kakamega North Zone',
            zsEmail: 'patrick.indakwa@tupande.dev',
            zsName: 'Patrick Indakwa',
            zsPhone: '+254700003006',
            agents: [
              { email: 'jane.amukune@tupande.dev', name: 'Jane Amukune', phone: '+254712300003' },
              { email: 'joseph.lugado@tupande.dev', name: 'Joseph Lugado', phone: '+254712300004' },
            ],
          },
        ],
      },
      {
        name: 'Bungoma',
        unitLabel: 'Bungoma Area',
        acEmail: 'caroline.makokha@tupande.dev',
        acName: 'Caroline Makokha',
        acPhone: '+254700002004',
        origin: { lat: 0.57, lng: 34.56 },
        zones: [
          {
            name: 'Bungoma East',
            unitLabel: 'Bungoma East Zone',
            zsEmail: 'kevin.simiyu@tupande.dev',
            zsName: 'Kevin Simiyu',
            zsPhone: '+254700003007',
            agents: [
              { email: 'esther.naliaka@tupande.dev', name: 'Esther Naliaka', phone: '+254712400001' },
              { email: 'collins.wafula@tupande.dev', name: 'Collins Wafula', phone: '+254712400002' },
            ],
          },
          {
            name: 'Bungoma West',
            unitLabel: 'Bungoma West Zone',
            zsEmail: 'janet.nasimiyu@tupande.dev',
            zsName: 'Janet Nasimiyu',
            zsPhone: '+254700003008',
            agents: [
              { email: 'henry.wekesa@tupande.dev', name: 'Henry Wekesa', phone: '+254712400003' },
              { email: 'lilian.namalwa@tupande.dev', name: 'Lilian Namalwa', phone: '+254712400004' },
            ],
          },
        ],
      },
    ],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Wiping existing seed data...');
  await wipe();

  // 1. Admin (org-wide; not pinned to a region)
  console.log('Creating users: 1 admin, 1 finance manager, 2 RM, 4 AC, 8 ZS, 16 TA...');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@tupande.dev',
      name: 'Naomi Otieno',
      phone: '+254700000001',
      role: 'ADMIN',
      region: 'HQ Nairobi',
      lastLoginAt: daysAgo(1),
    },
  });

  // 2. Finance manager (org-wide). RMs report up to admin; finance is a peer.
  const finance = await prisma.user.create({
    data: {
      email: 'finance@tupande.dev',
      name: 'Joyce Mutembei',
      phone: '+254700000002',
      role: 'FINANCE_MANAGER',
      region: 'HQ Nairobi',
      lastLoginAt: daysAgo(1),
    },
  });

  type AgentRow = {
    id: string;
    role: 'TUPANDE_AGENT' | 'ZONE_SUPERVISOR' | 'AREA_COORDINATOR';
    region: string;
    areaOrigin: { lat: number; lng: number };
  };

  const allLoggers: AgentRow[] = [];
  // approverFor[loggerId] = the direct manager id (for picking realistic approvers later)
  const approverFor = new Map<string, string>();

  for (const region of ORG) {
    const rm = await prisma.user.create({
      data: {
        email: region.rmEmail,
        name: region.rmName,
        phone: region.rmPhone,
        role: 'REGIONAL_MANAGER',
        organisationalUnit: region.unitLabel,
        unitLevel: 'REGION',
        region: region.name,
        managerId: admin.id,
        lastLoginAt: daysAgo(2),
      },
    });

    for (const area of region.areas) {
      const ac = await prisma.user.create({
        data: {
          email: area.acEmail,
          name: area.acName,
          phone: area.acPhone,
          role: 'AREA_COORDINATOR',
          organisationalUnit: area.unitLabel,
          unitLevel: 'AREA',
          region: region.name,
          managerId: rm.id,
          lastLoginAt: daysAgo(1),
        },
      });
      allLoggers.push({ id: ac.id, role: 'AREA_COORDINATOR', region: region.name, areaOrigin: area.origin });
      approverFor.set(ac.id, rm.id);

      for (const zone of area.zones) {
        const zs = await prisma.user.create({
          data: {
            email: zone.zsEmail,
            name: zone.zsName,
            phone: zone.zsPhone,
            role: 'ZONE_SUPERVISOR',
            organisationalUnit: zone.unitLabel,
            unitLevel: 'ZONE',
            region: region.name,
            managerId: ac.id,
            lastLoginAt: daysAgo(Math.floor(Math.random() * 3) + 1),
          },
        });
        allLoggers.push({ id: zs.id, role: 'ZONE_SUPERVISOR', region: region.name, areaOrigin: area.origin });
        approverFor.set(zs.id, ac.id);

        for (const agent of zone.agents) {
          const ta = await prisma.user.create({
            data: {
              email: agent.email,
              name: agent.name,
              phone: agent.phone,
              role: 'TUPANDE_AGENT',
              organisationalUnit: zone.unitLabel,
              unitLevel: 'ZONE',
              region: region.name,
              managerId: zs.id,
              lastLoginAt: daysAgo(Math.floor(Math.random() * 5) + 1),
            },
          });
          allLoggers.push({
            id: ta.id,
            role: 'TUPANDE_AGENT',
            region: region.name,
            areaOrigin: area.origin,
          });
          approverFor.set(ta.id, zs.id);
        }
      }
    }
  }

  // ── Rate history ──
  console.log('Creating rate history...');
  const [rate80, rate90, rate100] = await Promise.all([
    prisma.rateConfig.create({
      data: {
        ratePerKm: 80,
        effectiveDate: daysAgo(180),
        notes: 'Initial rate set at program launch.',
        createdById: admin.id,
      },
    }),
    prisma.rateConfig.create({
      data: {
        ratePerKm: 90,
        effectiveDate: daysAgo(90),
        notes: 'Q2 fuel-price adjustment.',
        createdById: admin.id,
      },
    }),
    prisma.rateConfig.create({
      data: {
        ratePerKm: 100,
        effectiveDate: daysAgo(30),
        notes: 'Aligned with latest motorbike fuel benchmark.',
        createdById: admin.id,
      },
    }),
  ]);
  const ratesDesc = [rate100, rate90, rate80];
  function resolveRateFor(startTime: Date) {
    return ratesDesc.find((r) => r.effectiveDate <= startTime) ?? rate80;
  }

  await prisma.auditLog.createMany({
    data: [rate80, rate90, rate100].map((r) => ({
      actorId: admin.id,
      entityType: 'RateConfig',
      entityId: r.id,
      action: 'RATE_CHANGED' as const,
      newValues: { ratePerKm: Number(r.ratePerKm), effectiveDate: r.effectiveDate.toISOString() },
    })),
  });

  // ── Trips ──
  console.log('Creating trips for logging-allowed users...');

  // 30 trips spread across DRAFT/PENDING/APPROVED/REJECTED/REIMBURSED.
  // Submitters are picked from allLoggers (AGENT/ZS/AC); approvers come from
  // approverFor so the manager chain is consistent with the API rules.
  const statusPlan: { status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED'; hasPayment: boolean }[] = [
    ...Array(4).fill({ status: 'DRAFT' as const, hasPayment: false }),
    ...Array(2).fill({ status: 'DRAFT' as const, hasPayment: true }),
    ...Array(8).fill({ status: 'PENDING' as const, hasPayment: true }),
    ...Array(8).fill({ status: 'APPROVED' as const, hasPayment: true }),
    ...Array(4).fill({ status: 'REJECTED' as const, hasPayment: true }),
    ...Array(4).fill({ status: 'REIMBURSED' as const, hasPayment: true }),
  ];

  const TRIP_TYPES = [
    'FARMER_ENROLLMENT',
    'GROUP_TRAINING',
    'LOAN_FOLLOWUP',
    'INPUT_DISTRIBUTION',
    'OTHER',
  ] as const;

  const NOTES_BY_TYPE: Record<(typeof TRIP_TYPES)[number], string[]> = {
    FARMER_ENROLLMENT: [
      'Signed up 12 new farmers in Bahati ward.',
      'Visit to Kiamunyi farmer group; 8 enrolled.',
      'Door-to-door enrollment, Bondeni cluster.',
    ],
    GROUP_TRAINING: [
      'Top-dress application training; 22 attendees.',
      'Maize storage best-practices workshop.',
      'Demo plot review with two farmer groups.',
    ],
    LOAN_FOLLOWUP: [
      'Repayment check-in for late accounts.',
      'Three farmers reconciled; one rescheduled.',
      'Visit to defaulted accounts in Subukia.',
    ],
    INPUT_DISTRIBUTION: [
      'Delivered fertilizer to depot point B.',
      'Distributed seed packs to 30 households.',
      'Top-up urea handed out at meeting point.',
    ],
    OTHER: ['Site survey for next planting cycle.', 'Coordinated with extension officer.'],
  };

  const REJECTION_REASONS = [
    'Distance exceeds typical route — please reconfirm waypoints.',
    'M-Pesa reference does not match the amount.',
    'Trip overlaps with another reimbursed claim. Please clarify.',
    'GPS trail looks incomplete; consider re-recording.',
  ];

  // Shuffle plan so no single submitter ends up only with REIMBURSED, etc.
  for (let i = statusPlan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [statusPlan[i], statusPlan[j]] = [statusPlan[j], statusPlan[i]];
  }

  let tripIdx = 0;
  for (const slot of statusPlan) {
    tripIdx += 1;
    const submitter = allLoggers[tripIdx % allLoggers.length];
    const approverId = approverFor.get(submitter.id) ?? admin.id;

    const type = pick(TRIP_TYPES);
    const notes = pick(NOTES_BY_TYPE[type]);
    const origin = submitter.areaOrigin;

    const startTime = daysAgo(Math.floor(Math.random() * 150) + 1);
    const durationMinutes = Math.floor(randomBetween(25, 180));
    const endTime = addMinutes(startTime, durationMinutes);

    const distanceKm = Number(randomBetween(4, 48).toFixed(2));
    const rate = resolveRateFor(startTime);
    const ratePerKm = Number(rate.ratePerKm);
    const amountKes = Number((distanceKm * ratePerKm).toFixed(2));

    const gpsPointCount = Math.floor(randomBetween(18, 90));
    const gpsAccuracyM = Number(randomBetween(4, 22).toFixed(2));
    const trail = Array.from({ length: 6 }).map((_, i) => ({
      lat: jitterCoord(origin.lat, 0.08),
      lng: jitterCoord(origin.lng, 0.08),
      ts: addMinutes(startTime, (durationMinutes / 5) * i).getTime(),
      accuracy: Number(randomBetween(5, 25).toFixed(1)),
    }));

    const submittedAt =
      slot.status === 'DRAFT' ? null : addHours(endTime, randomBetween(0.5, 6));
    const approvedAt =
      slot.status === 'APPROVED' || slot.status === 'REIMBURSED'
        ? addHours(submittedAt!, randomBetween(2, 36))
        : null;
    const rejectedAt =
      slot.status === 'REJECTED' ? addHours(submittedAt!, randomBetween(1, 24)) : null;
    const reimbursedAt =
      slot.status === 'REIMBURSED' ? addHours(approvedAt!, randomBetween(4, 48)) : null;

    const rejectionReason = slot.status === 'REJECTED' ? pick(REJECTION_REASONS) : null;
    const recordedApproverId = approvedAt || rejectedAt ? approverId : null;

    const trip = await prisma.trip.create({
      data: {
        userId: submitter.id,
        type,
        notes,
        startTime,
        endTime,
        startLat: jitterCoord(origin.lat, 0.02),
        startLng: jitterCoord(origin.lng, 0.02),
        endLat: jitterCoord(origin.lat, 0.06),
        endLng: jitterCoord(origin.lng, 0.06),
        gpsAccuracyM,
        gpsPointCount,
        gpsTrail: trail,
        distanceKm,
        ratePerKm,
        amountKes,
        rateConfigId: rate.id,
        status: slot.status,
        submittedAt,
        approvedAt,
        rejectedAt,
        reimbursedAt,
        approverId: recordedApproverId,
        rejectionReason,
      },
    });

    if (slot.hasPayment) {
      // For REIMBURSED trips finance is the payer (disbursement); otherwise
      // it's the trip owner attaching their own M-Pesa receipt as evidence.
      const paidById = slot.status === 'REIMBURSED' ? finance.id : submitter.id;
      const paidAt =
        reimbursedAt ?? approvedAt ?? submittedAt ?? addHours(endTime, 1);

      // Find the submitter's phone — picked from the org tree we built earlier.
      const submitterPhone = await prisma.user.findUnique({
        where: { id: submitter.id },
        select: { phone: true },
      });

      await prisma.mpesaPayment.create({
        data: {
          tripId: trip.id,
          mpesaRef: mpesaRef(),
          amountKes,
          recipientPhone: submitterPhone?.phone ?? '+254700000000',
          paidById,
          paidAt,
          screenshotPath:
            Math.random() < 0.6
              ? `${trip.id}/${trip.id}-screenshot.jpg`
              : null,
        },
      });
    }

    // Audit per state transition.
    const auditRows: {
      actorId: string;
      action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
      createdAt: Date;
    }[] = [{ actorId: submitter.id, action: 'CREATED', createdAt: trip.createdAt }];
    if (submittedAt)
      auditRows.push({ actorId: submitter.id, action: 'SUBMITTED', createdAt: submittedAt });
    if (approvedAt)
      auditRows.push({ actorId: approverId, action: 'APPROVED', createdAt: approvedAt });
    if (rejectedAt)
      auditRows.push({ actorId: approverId, action: 'REJECTED', createdAt: rejectedAt });
    if (reimbursedAt)
      auditRows.push({ actorId: finance.id, action: 'REIMBURSED', createdAt: reimbursedAt });

    await prisma.auditLog.createMany({
      data: auditRows.map((r) => ({
        actorId: r.actorId,
        entityType: 'Trip',
        entityId: trip.id,
        action: r.action,
        createdAt: r.createdAt,
        metadata: { tripStatus: slot.status },
      })),
    });
  }

  // ── Analytics events so the analytics page isn't empty ──
  console.log('Sprinkling analytics events...');
  const allActiveUsers = await prisma.user.findMany({ select: { id: true } });
  const events: { userId: string; sessionId: string; eventName: string; createdAt: Date }[] = [];
  for (const u of allActiveUsers) {
    const sessions = Math.floor(Math.random() * 3) + 1;
    for (let s = 0; s < sessions; s++) {
      events.push({
        userId: u.id,
        sessionId: `${u.id}-s${s}`,
        eventName: 'page_visit',
        createdAt: addMinutes(new Date(), -Math.floor(Math.random() * 600)),
      });
    }
  }
  await prisma.analyticsEvent.createMany({ data: events });

  console.log('\nSeed complete.');
  console.log(
    `   1 admin · 1 finance · 2 regional · 4 area · 8 zone · 16 agents = ${allActiveUsers.length} users`,
  );
  console.log(`   ${statusPlan.length} trips · ${usedRefs.size} M-Pesa payments`);
  console.log('   Rate history: KES 80 → 90 → 100');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
