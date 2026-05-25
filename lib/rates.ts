import { prisma } from '@/lib/prisma';

// Server-side rate resolution. The client never sends the rate — the source
// of truth is the most recent rate_config row with effective_date <= the
// trip's start time.

export class NoRateConfiguredError extends Error {
  constructor() {
    super('No rate has been configured for this date. Ask an admin to set one.');
    this.name = 'NoRateConfiguredError';
  }
}

export type ResolvedRate = {
  rateConfigId: string;
  ratePerKm: number;
  currency: string;
  effectiveDate: Date;
};

export async function resolveRateForDate(date: Date): Promise<ResolvedRate> {
  const row = await prisma.rateConfig.findFirst({
    where: { effectiveDate: { lte: date } },
    orderBy: { effectiveDate: 'desc' },
    select: { id: true, ratePerKm: true, currency: true, effectiveDate: true },
  });
  if (!row) throw new NoRateConfiguredError();
  return {
    rateConfigId: row.id,
    ratePerKm: Number(row.ratePerKm),
    currency: row.currency,
    effectiveDate: row.effectiveDate,
  };
}

// Rounds to two decimal places — KES has no sub-cent denomination.
export function computeAmountKes(distanceKm: number, ratePerKm: number): number {
  return Math.round(distanceKm * ratePerKm * 100) / 100;
}
