import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/lib/generated/prisma/client';
import { normalizeDbUrl } from '@/lib/db-url';

// Singleton — Next.js dev mode hot-reloads modules, which would otherwise
// create a new PrismaClient on every change and exhaust the connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add it to .env.local.');
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: normalizeDbUrl(process.env.DATABASE_URL) }),
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
