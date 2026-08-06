-- P3 Phase: Reporting views, forecast workflow columns, and access-path indexes (COD-H-011, COD-M-007)

-- ---------------------------------------------------------------------------
-- Forecast version workflow columns (mirror budget_versions pattern)
-- ---------------------------------------------------------------------------
ALTER TABLE public.forecast_versions
  ADD COLUMN IF NOT EXISTS is_current_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_forecast_one_current_approved
  ON public.forecast_versions (legal_entity_id, control_scope_id)
  WHERE is_current_approved = true
    AND approval_status IN ('approved', 'locked', 'posted');

-- Progress verification status for indexed lookup paths
ALTER TABLE public.milestone_progress_updates
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE public.milestone_progress_updates
  DROP CONSTRAINT IF EXISTS milestone_progress_updates_verification_status_check;
ALTER TABLE public.milestone_progress_updates
  ADD CONSTRAINT milestone_progress_updates_verification_status_check
  CHECK (verification_status IN ('pending', 'verified', 'rejected'));

UPDATE public.milestone_progress_updates AS mpu
SET verification_status = CASE
  WHEN mpu.verified_by IS NOT NULL AND mpu.approval_status = 'approved' THEN 'verified'
  WHEN mpu.approval_status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END
WHERE mpu.verification_status = 'pending';

-- ---------------------------------------------------------------------------
-- v_budget_vs_actual: monthly grain with posted actuals and reversal netting
-- commitment_open joins at control_account grain; 0 when no commitment exists
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_hospital_period_performance;
DROP VIEW IF EXISTS public.v_project_earned_value;
DROP VIEW IF EXISTS public.v_budget_vs_actual;

CREATE VIEW public.v_budget_vs_actual
WITH (security_invoker = true) AS
WITH approved_budgets AS (
  SELECT bv.*
  FROM public.budget_versions AS bv
  WHERE bv.is_current_approved = true
    AND bv.approval_status IN ('approved', 'locked', 'posted')
),
budget_grain AS (
  SELECT
    bv.legal_entity_id,
    bv.control_scope_id,
    bv.fiscal_year_id,
    bv.id AS budget_version_id,
    bv.original_approved_amount,
    bv.original_approved_amount + bv.approved_increases - bv.approved_reductions
      AS current_approved_amount,
    bl.id AS budget_line_id,
    bl.organization_unit_id,
    bl.cost_node_id,
    bl.control_account_id,
    bma.fiscal_period_id,
    bma.allocated_amount AS monthly_budget,
    fp.period_number
  FROM approved_budgets AS bv
  JOIN public.budget_lines AS bl ON bl.budget_version_id = bv.id
  JOIN public.budget_monthly_allocations AS bma ON bma.budget_line_id = bl.id
  JOIN public.fiscal_periods AS fp ON fp.id = bma.fiscal_period_id
  WHERE private.user_can_access_legal_entity(bv.legal_entity_id)
),
posted_actuals AS (
  SELECT
    atx.legal_entity_id,
    atx.accounting_period_id AS fiscal_period_id,
    ata.organization_unit_id,
    ata.cost_node_id,
    SUM(ata.allocation_amount) AS period_actual
  FROM public.actual_transaction_allocations AS ata
  JOIN public.actual_transactions AS atx ON atx.id = ata.actual_transaction_id
  WHERE atx.is_posted = true
  GROUP BY
    atx.legal_entity_id,
    atx.accounting_period_id,
    ata.organization_unit_id,
    ata.cost_node_id
),
commitment_open AS (
  SELECT
    c.legal_entity_id,
    c.control_account_id,
    SUM(
      c.original_value + c.approved_variations - c.cancelled_amount - c.invoiced_applied
    ) AS commitment_open
  FROM public.commitments AS c
  WHERE c.control_account_id IS NOT NULL
    AND c.approval_status IN ('approved', 'locked', 'posted')
  GROUP BY c.legal_entity_id, c.control_account_id
)
SELECT
  bg.legal_entity_id,
  bg.control_scope_id,
  bg.fiscal_year_id,
  bg.fiscal_period_id,
  bg.organization_unit_id,
  bg.cost_node_id,
  bg.budget_line_id,
  bg.budget_version_id,
  bg.original_approved_amount,
  bg.current_approved_amount,
  bg.monthly_budget,
  COALESCE(pa.period_actual, 0) AS mtd_actual,
  COALESCE(ytd.ytd_actual, 0) AS ytd_actual,
  COALESCE(co.commitment_open, 0) AS commitment_open
FROM budget_grain AS bg
LEFT JOIN posted_actuals AS pa
  ON pa.legal_entity_id = bg.legal_entity_id
 AND pa.fiscal_period_id = bg.fiscal_period_id
 AND pa.organization_unit_id IS NOT DISTINCT FROM bg.organization_unit_id
 AND pa.cost_node_id = bg.cost_node_id
LEFT JOIN LATERAL (
  SELECT SUM(pa2.period_actual) AS ytd_actual
  FROM posted_actuals AS pa2
  JOIN public.fiscal_periods AS fp2 ON fp2.id = pa2.fiscal_period_id
  JOIN public.fiscal_periods AS fp_cur ON fp_cur.id = bg.fiscal_period_id
  WHERE pa2.legal_entity_id = bg.legal_entity_id
    AND fp2.fiscal_year_id = fp_cur.fiscal_year_id
    AND fp2.period_number <= fp_cur.period_number
    AND pa2.organization_unit_id IS NOT DISTINCT FROM bg.organization_unit_id
    AND pa2.cost_node_id = bg.cost_node_id
) AS ytd ON true
LEFT JOIN commitment_open AS co
  ON co.legal_entity_id = bg.legal_entity_id
 AND co.control_account_id = bg.control_account_id;

COMMENT ON VIEW public.v_budget_vs_actual IS
  '@classification data_api_exposed; authenticated only; security_invoker aggregate; '
  'monthly grain; posted actuals with signed reversal netting; commitment_open at control_account grain (0 when none)';

-- ---------------------------------------------------------------------------
-- v_hospital_period_performance: scope/period MTD/YTD with forecast extension
-- full_year_forecast = ytd_actual + remaining monthly budget (period+1 onward)
-- ---------------------------------------------------------------------------
CREATE VIEW public.v_hospital_period_performance
WITH (security_invoker = true) AS
WITH period_totals AS (
  SELECT
    bva.legal_entity_id,
    bva.control_scope_id,
    bva.fiscal_year_id,
    bva.fiscal_period_id,
    fp.period_number,
    SUM(bva.monthly_budget) AS mtd_budget,
    SUM(bva.mtd_actual) AS mtd_actual
  FROM public.v_budget_vs_actual AS bva
  JOIN public.fiscal_periods AS fp ON fp.id = bva.fiscal_period_id
  GROUP BY
    bva.legal_entity_id,
    bva.control_scope_id,
    bva.fiscal_year_id,
    bva.fiscal_period_id,
    fp.period_number
),
windowed AS (
  SELECT
    pt.*,
    SUM(pt.mtd_budget) OVER w AS ytd_budget,
    SUM(pt.mtd_actual) OVER w AS ytd_actual,
    SUM(pt.mtd_budget) OVER (
      PARTITION BY pt.legal_entity_id, pt.control_scope_id, pt.fiscal_year_id
    ) AS full_year_budget
  FROM period_totals AS pt
  WINDOW w AS (
    PARTITION BY pt.legal_entity_id, pt.control_scope_id, pt.fiscal_year_id
    ORDER BY pt.period_number
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
)
SELECT
  w.legal_entity_id,
  w.control_scope_id,
  w.fiscal_year_id,
  w.fiscal_period_id,
  w.mtd_budget,
  w.mtd_actual,
  w.ytd_budget,
  w.ytd_actual,
  w.full_year_budget - w.ytd_budget AS remaining_budget,
  w.ytd_actual + (w.full_year_budget - w.ytd_budget) AS full_year_forecast
FROM windowed AS w
WHERE private.user_can_access_legal_entity(w.legal_entity_id);

COMMENT ON VIEW public.v_hospital_period_performance IS
  '@classification data_api_exposed; authenticated only; security_invoker aggregate; '
  'hospital MTD/YTD by legal entity, control scope, and fiscal period';

-- ---------------------------------------------------------------------------
-- v_project_earned_value: EVM inputs from time-phased budget, verified progress,
-- and posted control-account allocations
-- ---------------------------------------------------------------------------
CREATE VIEW public.v_project_earned_value
WITH (security_invoker = true) AS
WITH reporting_date AS (
  SELECT CURRENT_DATE AS status_date
),
approved_budgets AS (
  SELECT bv.*
  FROM public.budget_versions AS bv
  WHERE bv.is_current_approved = true
    AND bv.approval_status IN ('approved', 'locked', 'posted')
),
control_account_bac AS (
  SELECT
    ca.id AS control_account_id,
    ca.project_id,
    ca.legal_entity_id,
    COALESCE(SUM(bl.planned_amount), 0) AS bac
  FROM public.control_accounts AS ca
  JOIN approved_budgets AS bv
    ON bv.control_scope_id = ca.control_scope_id
   AND bv.legal_entity_id = ca.legal_entity_id
  JOIN public.budget_lines AS bl
    ON bl.budget_version_id = bv.id
   AND bl.control_account_id = ca.id
  WHERE ca.project_id IS NOT NULL
  GROUP BY ca.id, ca.project_id, ca.legal_entity_id
),
control_account_pv AS (
  SELECT
    bl.control_account_id,
    COALESCE(SUM(bma.allocated_amount), 0) AS pv
  FROM approved_budgets AS bv
  JOIN public.budget_lines AS bl ON bl.budget_version_id = bv.id
  JOIN public.budget_monthly_allocations AS bma ON bma.budget_line_id = bl.id
  JOIN public.fiscal_periods AS fp ON fp.id = bma.fiscal_period_id
  CROSS JOIN reporting_date AS rd
  WHERE bl.control_account_id IS NOT NULL
    AND fp.end_date <= rd.status_date
  GROUP BY bl.control_account_id
),
verified_milestone_progress AS (
  SELECT DISTINCT ON (m.id)
    m.id AS milestone_id,
    m.project_id,
    m.work_package_id,
    m.phase_id,
    mpu.verified_progress AS verified_progress_pct
  FROM public.milestones AS m
  JOIN public.milestone_progress_updates AS mpu ON mpu.milestone_id = m.id
  WHERE mpu.verified_by IS NOT NULL
    AND mpu.verified_progress IS NOT NULL
    AND mpu.verification_status = 'verified'
    AND mpu.approval_status = 'approved'
  ORDER BY m.id, mpu.created_at DESC
),
control_account_ev AS (
  SELECT
    cab.control_account_id,
    COALESCE(SUM(
      cab.bac * COALESCE(vmp.verified_progress_pct, 0) / 100.0
    ), 0) AS ev
  FROM control_account_bac AS cab
  JOIN public.control_accounts AS ca ON ca.id = cab.control_account_id
  LEFT JOIN verified_milestone_progress AS vmp
    ON vmp.project_id = cab.project_id
   AND (
     (ca.work_package_id IS NOT NULL AND vmp.work_package_id = ca.work_package_id)
     OR (ca.work_package_id IS NULL AND ca.phase_id IS NOT NULL AND vmp.phase_id = ca.phase_id)
     OR (ca.work_package_id IS NULL AND ca.phase_id IS NULL AND vmp.project_id = cab.project_id)
   )
  GROUP BY cab.control_account_id
),
control_account_ac AS (
  SELECT
    ata.control_account_id,
    COALESCE(SUM(ata.allocation_amount), 0) AS ac
  FROM public.actual_transaction_allocations AS ata
  JOIN public.actual_transactions AS atx ON atx.id = ata.actual_transaction_id
  WHERE atx.is_posted = true
    AND ata.control_account_id IS NOT NULL
  GROUP BY ata.control_account_id
)
SELECT
  cab.project_id,
  cab.control_account_id,
  rd.status_date,
  cab.bac,
  COALESCE(cap.pv, 0) AS pv,
  COALESCE(cae.ev, 0) AS ev,
  COALESCE(caa.ac, 0) AS ac
FROM control_account_bac AS cab
CROSS JOIN reporting_date AS rd
LEFT JOIN control_account_pv AS cap ON cap.control_account_id = cab.control_account_id
LEFT JOIN control_account_ev AS cae ON cae.control_account_id = cab.control_account_id
LEFT JOIN control_account_ac AS caa ON caa.control_account_id = cab.control_account_id
WHERE private.user_can_access_legal_entity(cab.legal_entity_id);

COMMENT ON VIEW public.v_project_earned_value IS
  '@classification data_api_exposed; authenticated only; security_invoker aggregate; '
  'EVM inputs from time-phased budget, verified milestone progress, and posted allocations';

-- ---------------------------------------------------------------------------
-- Targeted access-path indexes (COD-M-007)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_budget_versions_current_scope
  ON public.budget_versions (legal_entity_id, control_scope_id)
  WHERE is_current_approved = true;

CREATE INDEX IF NOT EXISTS idx_actual_transactions_posted_period
  ON public.actual_transactions (legal_entity_id, is_posted, accounting_period_id);

CREATE INDEX IF NOT EXISTS idx_actual_allocations_org_cost
  ON public.actual_transaction_allocations (organization_unit_id, cost_node_id);

CREATE INDEX IF NOT EXISTS idx_role_assignments_user_effective
  ON public.role_assignments (user_id, effective_start, effective_end);

-- import_batches uses approval_status as the workflow status dimension
CREATE INDEX IF NOT EXISTS idx_import_batches_entity_status
  ON public.import_batches (legal_entity_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_milestone_progress_verification
  ON public.milestone_progress_updates (milestone_id, verification_status);

-- ---------------------------------------------------------------------------
-- Grants (match existing security-invoker reporting views)
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE
  public.v_budget_vs_actual,
  public.v_hospital_period_performance,
  public.v_project_earned_value
TO authenticated;
