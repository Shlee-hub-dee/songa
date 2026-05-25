/**
 * Songa seed — populates a development database with realistic data.
 *
 *   1 admin + 2 managers + 8 field officers (4 per manager)
 *   3 rate history entries (KES 80 → 90 → 100)
 *   30 trips mixed across DRAFT/PENDING/APPROVED/REJECTED/REIMBURSED
 *   Matching M-Pesa payments with "QK"-prefixed references
 *   Audit log entries for each state transition
 *
 * Idempotent: wipes the tables it owns before re-seeding, so it's safe to
 * run repeatedly during development. Never run this against production.
 */
// Mirror Next.js env precedence so `npx prisma db seed` uses the same
// DATABASE_URL the app does (.env.local wins, .env is the fallback).
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

/** Small Lat/Lng perturbation around a base point (in degrees). */
function jitterCoord(base: number, spread = 0.05): number {
  return base + (Math.random() - 0.5) * spread * 2;
}

// ─── Wipe ────────────────────────────────────────────────────────────────────

async function wipe() {
  // Order matters because of FK constraints. RESTRICT relations (RateConfig
  // and MpesaPayment → User) require us to delete dependents first.
  await prisma.errorReport.deleteMany();
  await prisma.analyticsEvent.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.mpesaPayment.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.rateConfig.deleteMany();
  await prisma.user.deleteMany();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧹 Wiping existing seed data…');
  await wipe();

  // ── Users ──
  console.log('👥 Creating users…');
  const admin = await prisma.user.create({
    data: {
      email: 'admin@songa.dev',
      name: 'Naomi Otieno',
      phone: '+254700000001',
      role: 'ADMIN',
      region: 'HQ Nairobi',
      lastLoginAt: daysAgo(1),
    },
  });

  const managers = await Promise.all([
    prisma.user.create({
      data: {
        email: 'david.kiprop@songa.dev',
        name: 'David Kiprop',
        phone: '+254700000010',
        role: 'MANAGER',
        region: 'Nakuru West',
        lastLoginAt: daysAgo(2),
      },
    }),
    prisma.user.create({
      data: {
        email: 'esther.wanjiru@songa.dev',
        name: 'Esther Wanjiru',
        phone: '+254700000011',
        role: 'MANAGER',
        region: 'Eldoret South',
        lastLoginAt: daysAgo(1),
      },
    }),
  ]);
  const [nakuruMgr, eldoretMgr] = managers;

  // 4 officers per manager
  const nakuruOfficers = await Promise.all(
    [
      ['peter.macharia@songa.dev', 'Peter Macharia', '+254712100001'],
      ['mercy.chebet@songa.dev', 'Mercy Chebet', '+254712100002'],
      ['john.kamau@songa.dev', 'John Kamau', '+254712100003'],
      ['faith.nyambura@songa.dev', 'Faith Nyambura', '+254712100004'],
    ].map(([email, name, phone]) =>
      prisma.user.create({
        data: {
          email,
          name,
          phone,
          role: 'FIELD_OFFICER',
          region: 'Nakuru West',
          managerId: nakuruMgr.id,
          lastLoginAt: daysAgo(Math.floor(Math.random() * 5) + 1),
        },
      }),
    ),
  );

  const eldoretOfficers = await Promise.all(
    [
      ['samuel.kibet@songa.dev', 'Samuel Kibet', '+254712200001'],
      ['grace.jelagat@songa.dev', 'Grace Jelagat', '+254712200002'],
      ['daniel.rotich@songa.dev', 'Daniel Rotich', '+254712200003'],
      ['ruth.chepkurui@songa.dev', 'Ruth Chepkurui', '+254712200004'],
    ].map(([email, name, phone]) =>
      prisma.user.create({
        data: {
          email,
          name,
          phone,
          role: 'FIELD_OFFICER',
          region: 'Eldoret South',
          managerId: eldoretMgr.id,
          lastLoginAt: daysAgo(Math.floor(Math.random() * 5) + 1),
        },
      }),
    ),
  );

  // ── Rate history ──
  console.log('💰 Creating rate history…');
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

  // Audit the rate changes.
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
  console.log('🚗 Creating 30 trips…');

  // Status distribution (sums to 30):
  //   6  DRAFT (2 of them already carry a payment)
  //   8  PENDING
  //   8  APPROVED
  //   4  REJECTED
  //   4  REIMBURSED
  const statusPlan: { status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REIMBURSED'; hasPayment: boolean }[] = [
    ...Array(4).fill({ status: 'DRAFT' as const, hasPayment: false }),
    ...Array(2).fill({ status: 'DRAFT' as const, hasPayment: true }),
    ...Array(8).fill({ status: 'PENDING' as const, hasPayment: true }),
    ...Array(8).fill({ status: 'APPROVED' as const, hasPayment: true }),
    ...Array(4).fill({ status: 'REJECTED' as const, hasPayment: true }),
    ...Array(4).fill({ status: 'REIMBURSED' as const, hasPayment: true }),
  ];

  // Coordinates roughly centred on each manager's region.
  const REGION_ORIGINS = {
    'Nakuru West': { lat: -0.30, lng: 36.08 },
    'Eldoret South': { lat: 0.52, lng: 35.27 },
  };

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

  // For deterministic rate resolution we sort rates by effectiveDate descending
  // (mirroring the production query) and pick the first one whose date is on
  // or before the trip's startTime.
  const ratesDesc = [rate100, rate90, rate80]; // already in descending effective order

  function resolveRateFor(startTime: Date) {
    return ratesDesc.find((r) => r.effectiveDate <= startTime) ?? rate80;
  }

  const allOfficers = [...nakuruOfficers, ...eldoretOfficers];

  // Shuffle the plan so officers aren't biased toward one status.
  for (let i = statusPlan.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [statusPlan[i], statusPlan[j]] = [statusPlan[j], statusPlan[i]];
  }

  let tripIdx = 0;
  for (const slot of statusPlan) {
    tripIdx += 1;
    const officer = allOfficers[tripIdx % allOfficers.length];
    const manager = officer.managerId === nakuruMgr.id ? nakuruMgr : eldoretMgr;
    const origin = REGION_ORIGINS[officer.region as keyof typeof REGION_ORIGINS];

    const type = pick(TRIP_TYPES);
    const notesPool = NOTES_BY_TYPE[type];
    const notes = pick(notesPool);

    // Trip start window: 0–150 days ago, weighted slightly toward recent.
    const startTime = daysAgo(Math.floor(Math.random() * 150) + 1);
    const durationMinutes = Math.floor(randomBetween(25, 180));
    const endTime = addMinutes(startTime, durationMinutes);

    const distanceKm = Number(randomBetween(4, 48).toFixed(2));
    const rate = resolveRateFor(startTime);
    const ratePerKm = Number(rate.ratePerKm);
    const amountKes = Number((distanceKm * ratePerKm).toFixed(2));

    const gpsPointCount = Math.floor(randomBetween(18, 90));
    const gpsAccuracyM = Number(randomBetween(4, 22).toFixed(2));

    // Sample 6 waypoints for the gpsTrail snapshot.
    const trail = Array.from({ length: 6 }).map((_, i) => ({
      lat: jitterCoord(origin.lat, 0.08),
      lng: jitterCoord(origin.lng, 0.08),
      ts: addMinutes(startTime, (durationMinutes / 5) * i).getTime(),
      accuracy: Number(randomBetween(5, 25).toFixed(1)),
    }));

    // Workflow timestamps
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

    const approverId = approvedAt || rejectedAt ? manager.id : null;
    const rejectionReason = slot.status === 'REJECTED' ? pick(REJECTION_REASONS) : null;

    const trip = await prisma.trip.create({
      data: {
        userId: officer.id,
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
        approverId,
        rejectionReason,
      },
    });

    // M-Pesa payment (when applicable)
    if (slot.hasPayment) {
      // Reimbursement is paid by admin/finance; pre-reimburse payments are
      // recorded by the officer themselves when attaching the screenshot.
      const paidBy = slot.status === 'REIMBURSED' ? admin : officer;
      const paidAt =
        reimbursedAt ?? approvedAt ?? submittedAt ?? addHours(endTime, 1);

      await prisma.mpesaPayment.create({
        data: {
          tripId: trip.id,
          mpesaRef: mpesaRef(),
          // Real-world: M-Pesa amount often exactly matches the claim.
          amountKes,
          recipientPhone: officer.phone ?? '+254700000000',
          paidById: paidBy.id,
          paidAt,
          // Screenshot path follows the storage layout used by upload-url:
          // <tripId>/<uuid>.<ext>. Half of payments include one.
          screenshotPath:
            Math.random() < 0.6
              ? `${trip.id}/${trip.id}-screenshot.jpg`
              : null,
        },
      });
    }

    // Audit trail — one row per state transition the trip went through.
    const auditRows: {
      actorId: string;
      action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED';
      createdAt: Date;
    }[] = [{ actorId: officer.id, action: 'CREATED', createdAt: trip.createdAt }];
    if (submittedAt)
      auditRows.push({ actorId: officer.id, action: 'SUBMITTED', createdAt: submittedAt });
    if (approvedAt)
      auditRows.push({ actorId: manager.id, action: 'APPROVED', createdAt: approvedAt });
    if (rejectedAt)
      auditRows.push({ actorId: manager.id, action: 'REJECTED', createdAt: rejectedAt });
    if (reimbursedAt)
      auditRows.push({ actorId: admin.id, action: 'REIMBURSED', createdAt: reimbursedAt });

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

  // ── A handful of page-visit analytics so the analytics dashboard isn't empty ──
  console.log('📈 Sprinkling analytics events…');
  const events: { userId: string; sessionId: string; eventName: string; createdAt: Date }[] = [];
  for (const u of [...allOfficers, ...managers, admin]) {
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

  console.log('\n✅ Seed complete.');
  console.log(`   1 admin · 2 managers · ${allOfficers.length} officers`);
  console.log(`   ${statusPlan.length} trips · ${usedRefs.size} M-Pesa payments`);
  console.log('   Rate history: KES 80 → 90 → 100');
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
