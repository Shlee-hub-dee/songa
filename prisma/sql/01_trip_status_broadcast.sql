-- ─────────────────────────────────────────────────────────────────────────────
-- Trip status change → Supabase Realtime broadcast to officer's manager.
--
-- Fires on every status flip (DRAFT→PENDING, PENDING→APPROVED/REJECTED,
-- APPROVED→REIMBURSED). The API handler also fans out a broadcast for
-- snappier UX, but this trigger is the source of truth: any path that mutates
-- trips.status (raw SQL, dashboard, future workflows) will surface to the
-- right manager's channel.
--
-- Channel name: 'manager:<users.manager_id of the officer>'
-- Event name:   'trip:status_changed'
-- Payload:      { trip_id, officer_id, old_status, new_status, submitted_at,
--                 approved_at, rejected_at, reimbursed_at, amount_kes }
--
-- Apply via the Supabase SQL editor, or:
--   psql "$DATABASE_URL" -f prisma/sql/trip_status_broadcast.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.broadcast_trip_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_manager_id text;
BEGIN
  -- Only broadcast on actual status transitions.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Look up the officer's manager. If the officer has no manager (e.g. an
  -- admin trip, or onboarding gap), we skip the broadcast silently.
  SELECT u.manager_id INTO v_manager_id
  FROM public.users u
  WHERE u.id = NEW.user_id;

  IF v_manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object(
      'trip_id',       NEW.id,
      'officer_id',    NEW.user_id,
      'old_status',    OLD.status,
      'new_status',    NEW.status,
      'submitted_at',  NEW.submitted_at,
      'approved_at',   NEW.approved_at,
      'rejected_at',   NEW.rejected_at,
      'reimbursed_at', NEW.reimbursed_at,
      'amount_kes',    NEW.amount_kes
    ),
    'trip:status_changed',
    'manager:' || v_manager_id,
    false  -- public channel; set to true once RLS on realtime.messages is configured
  );

  RETURN NEW;
END;
$$;

-- Idempotent install: drop the existing trigger before re-creating so this
-- file can be re-applied during development.
DROP TRIGGER IF EXISTS trips_status_change_broadcast ON public.trips;

CREATE TRIGGER trips_status_change_broadcast
  AFTER UPDATE OF status ON public.trips
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.broadcast_trip_status_change();

COMMENT ON FUNCTION public.broadcast_trip_status_change() IS
  'Broadcasts trip status changes to the officer''s manager via Supabase Realtime.';
COMMENT ON TRIGGER trips_status_change_broadcast ON public.trips IS
  'AFTER UPDATE: notify officer''s manager when a trip''s status changes.';
