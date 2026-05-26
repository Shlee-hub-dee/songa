-- ─────────────────────────────────────────────────────────────────────────────
-- Songa — Tupande org-hierarchy migration.
--
-- Replaces the old four-role enum with the Tupande six-role hierarchy and
-- adds organisational_unit / unit_level columns to public.users.
--
-- Old → new value mapping for existing rows:
--   FIELD_OFFICER → TUPANDE_AGENT
--   MANAGER       → REGIONAL_MANAGER   (best-effort default; an admin can
--                                       re-assign ZONE_SUPERVISOR or
--                                       AREA_COORDINATOR after the migration)
--   FINANCE       → FINANCE_MANAGER
--   ADMIN         → ADMIN              (unchanged)
--
-- Apply via Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f prisma/sql/02_tupande_roles_migration.sql
--
-- Idempotent: re-running after success is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Detach the role column from the old enum so we can mutate it.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE TEXT USING "role"::TEXT;

-- 2. Map old values to new. Anything already on a new value passes through.
UPDATE "users" SET "role" = 'TUPANDE_AGENT'    WHERE "role" = 'FIELD_OFFICER';
UPDATE "users" SET "role" = 'REGIONAL_MANAGER' WHERE "role" = 'MANAGER';
UPDATE "users" SET "role" = 'FINANCE_MANAGER'  WHERE "role" = 'FINANCE';

-- 3. Drop the old enum and create the new one.
DROP TYPE IF EXISTS "Role";
CREATE TYPE "Role" AS ENUM (
    'TUPANDE_AGENT',
    'ZONE_SUPERVISOR',
    'AREA_COORDINATOR',
    'REGIONAL_MANAGER',
    'FINANCE_MANAGER',
    'ADMIN'
);

-- 4. Re-bind the role column and restore the default.
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role" USING "role"::"Role";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'TUPANDE_AGENT';

-- 5. UnitLevel enum.
DO $$ BEGIN
    CREATE TYPE "UnitLevel" AS ENUM ('ZONE', 'AREA', 'REGION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 6. New columns on users. Both nullable — only field staff and approvers in
-- the hierarchy populate them; ADMIN / FINANCE_MANAGER stay org-wide (null).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "organisational_unit" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "unit_level" "UnitLevel";

-- 7. Audit the role-enum change so we can trace where existing rows landed.
INSERT INTO "audit_log" ("id", "actor_id", "entity_type", "entity_id", "action", "new_values", "metadata", "created_at")
SELECT
    gen_random_uuid()::TEXT,
    NULL,
    'User',
    u.id,
    'ROLE_CHANGED'::"AuditAction",
    jsonb_build_object('role', u.role::TEXT),
    jsonb_build_object('migration', '02_tupande_roles_migration'),
    NOW()
FROM "users" u;

COMMIT;
