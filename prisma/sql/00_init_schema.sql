-- ─────────────────────────────────────────────────────────────────────────────
-- Songa schema — idempotent install.
--
-- Re-runnable without errors: enums wrap CREATE TYPE in DO blocks that swallow
-- duplicate_object (Postgres has no CREATE TYPE IF NOT EXISTS), tables use
-- CREATE TABLE IF NOT EXISTS, indexes use CREATE INDEX IF NOT EXISTS, and
-- foreign keys wrap ALTER TABLE in DO blocks for the same reason as enums.
--
-- Apply via Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f prisma/sql/00_init_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum (idempotent via DO-block — Postgres has no CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('FIELD_OFFICER', 'MANAGER', 'FINANCE', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "TripStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'REIMBURSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "TripType" AS ENUM ('FARMER_ENROLLMENT', 'GROUP_TRAINING', 'LOAN_FOLLOWUP', 'INPUT_DISTRIBUTION', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED', 'DELETED', 'LOGIN', 'LOGOUT', 'ROLE_CHANGED', 'RATE_CHANGED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ErrorSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR', 'FATAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "supabase_user_id" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'FIELD_OFFICER',
    "manager_id" TEXT,
    "region" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "trips" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TripType" NOT NULL,
    "purpose" TEXT,
    "notes" TEXT,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3),
    "start_lat" DECIMAL(10,7) NOT NULL,
    "start_lng" DECIMAL(10,7) NOT NULL,
    "end_lat" DECIMAL(10,7),
    "end_lng" DECIMAL(10,7),
    "gps_accuracy_m" DECIMAL(6,2),
    "gps_point_count" INTEGER NOT NULL DEFAULT 0,
    "gps_trail" JSONB,
    "distance_km" DECIMAL(8,3) NOT NULL,
    "rate_per_km" DECIMAL(10,2) NOT NULL,
    "amount_kes" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "rate_config_id" TEXT,
    "status" "TripStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "reimbursed_at" TIMESTAMP(3),
    "approver_id" TEXT,
    "approver_notes" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "mpesa_payments" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "mpesa_ref" TEXT NOT NULL,
    "amount_kes" DECIMAL(12,2) NOT NULL,
    "recipient_phone" TEXT NOT NULL,
    "screenshot_path" TEXT,
    "paid_by_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mpesa_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rate_configs" (
    "id" TEXT NOT NULL,
    "rate_per_km" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "effective_date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "event_name" TEXT NOT NULL,
    "event_props" JSONB,
    "page_url" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "error_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "session_id" TEXT,
    "message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "component_stack" TEXT,
    "url" TEXT,
    "user_agent" TEXT,
    "severity" "ErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "metadata" JSONB,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_supabase_user_id_key" ON "users"("supabase_user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_manager_id_idx" ON "users"("manager_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_user_id_status_idx" ON "trips"("user_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_status_submitted_at_idx" ON "trips"("status", "submitted_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_approver_id_idx" ON "trips"("approver_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "trips_start_time_idx" ON "trips"("start_time");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "mpesa_payments_trip_id_key" ON "mpesa_payments"("trip_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "mpesa_payments_mpesa_ref_key" ON "mpesa_payments"("mpesa_ref");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mpesa_payments_paid_by_id_idx" ON "mpesa_payments"("paid_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "mpesa_payments_paid_at_idx" ON "mpesa_payments"("paid_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "rate_configs_effective_date_idx" ON "rate_configs"("effective_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_event_name_created_at_idx" ON "analytics_events"("event_name", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "analytics_events_user_id_created_at_idx" ON "analytics_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "error_reports_severity_created_at_idx" ON "error_reports"("severity", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "error_reports_resolved_at_idx" ON "error_reports"("resolved_at");

-- AddForeignKey (idempotent via DO-block — ALTER TABLE has no IF NOT EXISTS)
DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_rate_config_id_fkey" FOREIGN KEY ("rate_config_id") REFERENCES "rate_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "trips" ADD CONSTRAINT "trips_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "mpesa_payments" ADD CONSTRAINT "mpesa_payments_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "mpesa_payments" ADD CONSTRAINT "mpesa_payments_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "rate_configs" ADD CONSTRAINT "rate_configs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "error_reports" ADD CONSTRAINT "error_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
