-- Fix: allow approved -> locked and locked -> posted status transitions on immutable budgets.

CREATE OR REPLACE FUNCTION private.protect_locked_budget_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IN ('approved', 'locked', 'posted', 'superseded') THEN
    IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
      IF NOT (
        (OLD.approval_status = 'approved' AND NEW.approval_status IN ('locked', 'superseded', 'cancelled'))
        OR (OLD.approval_status = 'locked' AND NEW.approval_status IN ('posted', 'superseded', 'cancelled'))
        OR (OLD.approval_status = 'posted' AND NEW.approval_status IN ('superseded', 'cancelled'))
        OR (OLD.approval_status = 'superseded' AND NEW.approval_status = 'cancelled')
      ) THEN
        RAISE EXCEPTION 'Approved or locked budget version cannot be modified';
      END IF;
    END IF;
    IF NEW.original_approved_amount IS DISTINCT FROM OLD.original_approved_amount
       OR NEW.approved_increases IS DISTINCT FROM OLD.approved_increases
       OR NEW.approved_reductions IS DISTINCT FROM OLD.approved_reductions
       OR NEW.contingency_amount IS DISTINCT FROM OLD.contingency_amount
       OR NEW.management_reserve_amount IS DISTINCT FROM OLD.management_reserve_amount THEN
      RAISE EXCEPTION 'Approved financial amounts are immutable';
    END IF;
    IF NEW.version_label IS DISTINCT FROM OLD.version_label
       OR NEW.fiscal_year_id IS DISTINCT FROM OLD.fiscal_year_id
       OR NEW.control_scope_id IS DISTINCT FROM OLD.control_scope_id
       OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id THEN
      RAISE EXCEPTION 'Approved budget scope metadata is immutable';
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
