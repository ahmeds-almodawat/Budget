-- P6: Revenue-aware reporting views with unioned budget/actual grain and profitability bridge

DROP VIEW IF EXISTS public.v_hospital_period_performance;
DROP VIEW IF EXISTS public.v_project_earned_value;
DROP VIEW IF EXISTS public.v_restaurant_branch_performance;
DROP VIEW IF EXISTS public.v_profitability_period_performance;
DROP VIEW IF EXISTS public.v_revenue_budget_vs_actual;
DROP VIEW IF EXISTS public.v_commitment_current_snapshot;
DROP VIEW IF EXISTS public.v_budget_vs_actual;

CREATE VIEW public.v_commitment_current_snapshot
WITH (security_invoker = true) AS
SELECT
  c.legal_entity_id,
  c.control_account_id,
  SUM(c.original_value + c.approved_variations - c.cancelled_amount - c.invoiced_applied) AS commitment_open_current
FROM public.commitments AS c
WHERE c.control_account_id IS NOT NULL
  AND c.approval_status IN ('approved', 'locked', 'posted')
  AND private.user_can_access_legal_entity(c.legal_entity_id)
GROUP BY c.legal_entity_id, c.control_account_id;

COMMENT ON VIEW public.v_commitment_current_snapshot IS
  '@classification data_api_exposed; current open commitment snapshot at control_account grain (not repeated per period)';

CREATE VIEW public.v_budget_vs_actual
WITH (security_invoker = true) AS
WITH approved_budgets AS (
  SELECT bv.*
  FROM public.budget_versions AS bv
  WHERE bv.is_current_approved = true
    AND bv.approval_status IN ('approved', 'locked', 'posted')
),
budget_detail AS (
  SELECT
    bv.legal_entity_id,
    bv.control_scope_id,
    bv.fiscal_year_id,
    bma.fiscal_period_id,
    fp.period_number,
    bl.organization_unit_id,
    bl.cost_node_id,
    bl.control_account_id,
    bl.id AS budget_line_id,
    bv.id AS budget_version_id,
    cn.classification AS financial_classification,
    CASE cn.classification
      WHEN 'revenue' THEN 'revenue'
      WHEN 'cost_of_revenue' THEN 'cost_of_revenue'
      WHEN 'payroll' THEN 'payroll'
      WHEN 'opex' THEN 'operating_expenses'
      WHEN 'capex' THEN 'capex'
      WHEN 'internal_transfer' THEN 'internal_transfer'
      WHEN 'working_capital' THEN 'working_capital'
      WHEN 'statistical' THEN 'statistical'
      ELSE 'other'
    END AS financial_reporting_group,
    bl.payer_id,
    bl.service_line_id,
    bl.revenue_component_type_id,
    bl.revenue_budget_basis,
    bv.original_approved_amount,
    bv.original_approved_amount + bv.approved_increases - bv.approved_reductions AS current_approved_amount,
    bv.approved_increases,
    bv.approved_reductions,
    bma.allocated_amount AS monthly_budget,
    'external'::public.transaction_class AS transaction_class
  FROM approved_budgets AS bv
  JOIN public.budget_lines AS bl ON bl.budget_version_id = bv.id
  JOIN public.budget_monthly_allocations AS bma ON bma.budget_line_id = bl.id
  JOIN public.fiscal_periods AS fp ON fp.id = bma.fiscal_period_id
  JOIN public.cost_nodes AS cn ON cn.id = bl.cost_node_id
  WHERE private.user_can_access_legal_entity(bv.legal_entity_id)
),
actual_period AS (
  SELECT
    atx.legal_entity_id,
    atx.accounting_period_id AS fiscal_period_id,
    ata.organization_unit_id,
    ata.cost_node_id,
    ata.control_account_id,
    ata.payer_id,
    ata.service_line_id,
    ata.revenue_component_type_id,
    atx.transaction_class,
    cn.classification AS financial_classification,
    CASE cn.classification
      WHEN 'revenue' THEN 'revenue'
      WHEN 'cost_of_revenue' THEN 'cost_of_revenue'
      WHEN 'payroll' THEN 'payroll'
      WHEN 'opex' THEN 'operating_expenses'
      WHEN 'capex' THEN 'capex'
      WHEN 'internal_transfer' THEN 'internal_transfer'
      WHEN 'working_capital' THEN 'working_capital'
      WHEN 'statistical' THEN 'statistical'
      ELSE 'other'
    END AS financial_reporting_group,
    COALESCE(ca.control_scope_id, cs_fallback.control_scope_id) AS control_scope_id,
    fp.fiscal_year_id,
    fp.period_number,
    SUM(
      CASE
        WHEN atx.is_reversal THEN -ABS(ata.reporting_amount_ex_vat)
        WHEN rct.net_effect_multiplier = -1 THEN ABS(ata.reporting_amount_ex_vat)
        WHEN cn.classification IN ('revenue', 'internal_transfer') THEN ABS(ata.reporting_amount_ex_vat)
        ELSE ABS(ata.reporting_amount_ex_vat)
      END
      * COALESCE(rct.net_effect_multiplier, 1)
    ) AS mtd_actual
  FROM public.actual_transaction_allocations AS ata
  JOIN public.actual_transactions AS atx ON atx.id = ata.actual_transaction_id
  JOIN public.cost_nodes AS cn ON cn.id = ata.cost_node_id
  JOIN public.fiscal_periods AS fp ON fp.id = atx.accounting_period_id
  LEFT JOIN public.control_accounts AS ca ON ca.id = ata.control_account_id
  LEFT JOIN LATERAL (
    SELECT bv.control_scope_id
    FROM approved_budgets AS bv
    WHERE bv.legal_entity_id = atx.legal_entity_id
    LIMIT 1
  ) AS cs_fallback ON ca.control_scope_id IS NULL
  LEFT JOIN public.revenue_component_types AS rct ON rct.id = ata.revenue_component_type_id
  WHERE atx.is_posted = true
    AND private.user_can_access_legal_entity(atx.legal_entity_id)
  GROUP BY
    atx.legal_entity_id,
    atx.accounting_period_id,
    ata.organization_unit_id,
    ata.cost_node_id,
    ata.control_account_id,
    ata.payer_id,
    ata.service_line_id,
    ata.revenue_component_type_id,
    atx.transaction_class,
    cn.classification,
    COALESCE(ca.control_scope_id, cs_fallback.control_scope_id),
    fp.fiscal_year_id,
    fp.period_number
),
grain_keys AS (
  SELECT DISTINCT
    legal_entity_id, control_scope_id, fiscal_year_id, fiscal_period_id, period_number,
    organization_unit_id, cost_node_id, control_account_id, payer_id, service_line_id,
    revenue_component_type_id, financial_classification, financial_reporting_group, transaction_class
  FROM budget_detail
  UNION
  SELECT DISTINCT
    legal_entity_id, control_scope_id, fiscal_year_id, fiscal_period_id, period_number,
    organization_unit_id, cost_node_id, control_account_id, payer_id, service_line_id,
    revenue_component_type_id, financial_classification, financial_reporting_group, transaction_class
  FROM actual_period
)
SELECT
  gk.legal_entity_id,
  gk.control_scope_id,
  gk.fiscal_year_id,
  gk.fiscal_period_id,
  gk.period_number,
  gk.organization_unit_id,
  gk.cost_node_id,
  gk.control_account_id,
  bd.budget_line_id,
  bd.budget_version_id,
  gk.financial_classification,
  gk.financial_reporting_group,
  gk.payer_id,
  gk.service_line_id,
  gk.revenue_component_type_id,
  bd.revenue_budget_basis,
  CASE WHEN COALESCE(gk.transaction_class, 'external'::public.transaction_class) = 'external'::public.transaction_class THEN 'external' ELSE 'internal' END AS external_internal_class,
  COALESCE(bd.original_approved_amount, 0) AS original_approved_budget,
  COALESCE(bd.approved_increases, 0) AS approved_increases,
  COALESCE(bd.approved_reductions, 0) AS approved_reductions,
  COALESCE(bd.current_approved_amount, 0) AS current_approved_budget,
  COALESCE(bd.monthly_budget, 0) AS monthly_budget,
  COALESCE(ap.mtd_actual, 0) AS mtd_actual,
  COALESCE(ytd.ytd_actual, 0) AS ytd_actual,
  CASE
    WHEN gk.financial_classification = 'revenue'::public.cost_classification
      THEN COALESCE(ap.mtd_actual, 0) - COALESCE(bd.monthly_budget, 0)
    ELSE COALESCE(bd.monthly_budget, 0) - COALESCE(ap.mtd_actual, 0)
  END AS variance_amount,
  CASE
    WHEN COALESCE(bd.monthly_budget, 0) = 0 THEN NULL
    WHEN gk.financial_classification = 'revenue'::public.cost_classification
      THEN (COALESCE(ap.mtd_actual, 0) - COALESCE(bd.monthly_budget, 0)) / bd.monthly_budget
    ELSE (COALESCE(bd.monthly_budget, 0) - COALESCE(ap.mtd_actual, 0)) / bd.monthly_budget
  END AS variance_percentage,
  CASE
    WHEN COALESCE(bd.monthly_budget, 0) = 0 AND COALESCE(ap.mtd_actual, 0) <> 0 THEN 'unbudgeted'
    WHEN COALESCE(bd.monthly_budget, 0) = 0 AND COALESCE(ap.mtd_actual, 0) = 0 THEN 'on_target'
    WHEN gk.financial_classification = 'revenue'::public.cost_classification THEN
      CASE
        WHEN COALESCE(ap.mtd_actual, 0) > COALESCE(bd.monthly_budget, 0) THEN 'favorable'
        WHEN COALESCE(ap.mtd_actual, 0) < COALESCE(bd.monthly_budget, 0) THEN 'unfavorable'
        ELSE 'on_target'
      END
    ELSE
      CASE
        WHEN COALESCE(ap.mtd_actual, 0) < COALESCE(bd.monthly_budget, 0) THEN 'favorable'
        WHEN COALESCE(ap.mtd_actual, 0) > COALESCE(bd.monthly_budget, 0) THEN 'unfavorable'
        ELSE 'on_target'
      END
  END AS variance_status,
  CASE
    WHEN gk.financial_classification IN ('revenue', 'internal_transfer', 'statistical')
      THEN 0
    ELSE COALESCE(ccs.commitment_open_current, 0)
  END AS commitment_open_current
FROM grain_keys AS gk
LEFT JOIN budget_detail AS bd
  ON bd.legal_entity_id = gk.legal_entity_id
 AND bd.control_scope_id IS NOT DISTINCT FROM gk.control_scope_id
 AND bd.fiscal_period_id = gk.fiscal_period_id
 AND bd.organization_unit_id IS NOT DISTINCT FROM gk.organization_unit_id
 AND bd.cost_node_id IS NOT DISTINCT FROM gk.cost_node_id
 AND bd.control_account_id IS NOT DISTINCT FROM gk.control_account_id
 AND bd.payer_id IS NOT DISTINCT FROM gk.payer_id
 AND bd.service_line_id IS NOT DISTINCT FROM gk.service_line_id
 AND bd.revenue_component_type_id IS NOT DISTINCT FROM gk.revenue_component_type_id
 AND bd.financial_classification = gk.financial_classification
LEFT JOIN actual_period AS ap
  ON ap.legal_entity_id = gk.legal_entity_id
 AND ap.control_scope_id IS NOT DISTINCT FROM gk.control_scope_id
 AND ap.fiscal_period_id = gk.fiscal_period_id
 AND ap.organization_unit_id IS NOT DISTINCT FROM gk.organization_unit_id
 AND ap.cost_node_id IS NOT DISTINCT FROM gk.cost_node_id
 AND ap.control_account_id IS NOT DISTINCT FROM gk.control_account_id
 AND ap.payer_id IS NOT DISTINCT FROM gk.payer_id
 AND ap.service_line_id IS NOT DISTINCT FROM gk.service_line_id
 AND ap.revenue_component_type_id IS NOT DISTINCT FROM gk.revenue_component_type_id
 AND ap.financial_classification = gk.financial_classification
 AND ap.transaction_class IS NOT DISTINCT FROM gk.transaction_class
LEFT JOIN LATERAL (
  SELECT SUM(ap2.mtd_actual) AS ytd_actual
  FROM actual_period AS ap2
  JOIN public.fiscal_periods AS fp2 ON fp2.id = ap2.fiscal_period_id
  WHERE ap2.legal_entity_id = gk.legal_entity_id
    AND fp2.fiscal_year_id = gk.fiscal_year_id
    AND fp2.period_number <= gk.period_number
    AND ap2.control_scope_id IS NOT DISTINCT FROM gk.control_scope_id
    AND ap2.organization_unit_id IS NOT DISTINCT FROM gk.organization_unit_id
    AND ap2.cost_node_id IS NOT DISTINCT FROM gk.cost_node_id
    AND ap2.control_account_id IS NOT DISTINCT FROM gk.control_account_id
    AND ap2.payer_id IS NOT DISTINCT FROM gk.payer_id
    AND ap2.service_line_id IS NOT DISTINCT FROM gk.service_line_id
    AND ap2.revenue_component_type_id IS NOT DISTINCT FROM gk.revenue_component_type_id
    AND ap2.financial_classification = gk.financial_classification
    AND ap2.transaction_class IS NOT DISTINCT FROM gk.transaction_class
) AS ytd ON true
LEFT JOIN public.v_commitment_current_snapshot AS ccs
  ON ccs.legal_entity_id = gk.legal_entity_id
 AND ccs.control_account_id IS NOT DISTINCT FROM gk.control_account_id;

COMMENT ON VIEW public.v_budget_vs_actual IS
  '@classification data_api_exposed; unioned budget/actual monthly grain with classification-aware variance and current commitment snapshot';

CREATE VIEW public.v_revenue_budget_vs_actual
WITH (security_invoker = true) AS
WITH revenue_actuals AS (
  SELECT
    bva.legal_entity_id,
    bva.control_scope_id,
    bva.fiscal_year_id,
    bva.fiscal_period_id,
    bva.period_number,
    bva.organization_unit_id,
    bva.payer_id,
    pc.id AS payer_category_id,
    bva.service_line_id,
    SUM(CASE WHEN rct.code = 'gross_revenue' AND bva.external_internal_class = 'external' THEN bva.mtd_actual ELSE 0 END) AS gross_actual_revenue,
    SUM(CASE WHEN rct.code = 'rejection' THEN ABS(bva.mtd_actual) ELSE 0 END) AS rejection_amount,
    SUM(CASE WHEN rct.code = 'discount' THEN ABS(bva.mtd_actual) ELSE 0 END) AS discount_amount,
    SUM(CASE WHEN rct.code = 'refund' THEN ABS(bva.mtd_actual) ELSE 0 END) AS refund_amount,
    SUM(CASE WHEN rct.code = 'credit_note' THEN ABS(bva.mtd_actual) ELSE 0 END) AS credit_note_amount,
    SUM(CASE WHEN rct.code = 'other_deduction' THEN ABS(bva.mtd_actual) ELSE 0 END) AS other_deduction_amount,
    SUM(CASE WHEN rct.code = 'other_adjustment' THEN bva.mtd_actual ELSE 0 END) AS other_adjustment_amount,
    SUM(CASE WHEN bva.external_internal_class = 'internal' THEN bva.mtd_actual ELSE 0 END) AS internal_revenue,
    SUM(CASE WHEN bva.external_internal_class = 'external' THEN bva.mtd_actual ELSE 0 END) AS external_net_revenue,
    SUM(bva.monthly_budget) AS budgeted_revenue
  FROM public.v_budget_vs_actual AS bva
  LEFT JOIN public.revenue_component_types AS rct ON rct.id = bva.revenue_component_type_id
  LEFT JOIN public.payers AS p ON p.id = bva.payer_id
  LEFT JOIN public.payer_categories AS pc ON pc.id = p.payer_category_id
  WHERE bva.financial_classification = 'revenue'
    AND private.user_can_access_legal_entity(bva.legal_entity_id)
  GROUP BY
    bva.legal_entity_id, bva.control_scope_id, bva.fiscal_year_id, bva.fiscal_period_id,
    bva.period_number, bva.organization_unit_id, bva.payer_id, pc.id, bva.service_line_id
)
SELECT
  ra.*,
  ra.gross_actual_revenue
    - ra.rejection_amount - ra.discount_amount - ra.refund_amount
    - ra.credit_note_amount - ra.other_deduction_amount + ra.other_adjustment_amount AS actual_net_revenue,
  CASE WHEN ra.gross_actual_revenue = 0 THEN NULL ELSE ra.rejection_amount / ra.gross_actual_revenue END AS rejection_percentage,
  ra.external_net_revenue - ra.budgeted_revenue AS revenue_variance,
  CASE WHEN ra.budgeted_revenue = 0 THEN NULL ELSE (ra.external_net_revenue - ra.budgeted_revenue) / ra.budgeted_revenue END AS revenue_variance_percentage,
  CASE WHEN ra.budgeted_revenue = 0 THEN NULL ELSE ra.external_net_revenue / ra.budgeted_revenue END AS attainment_percentage,
  SUM(ra.external_net_revenue) OVER (
    PARTITION BY ra.legal_entity_id, ra.control_scope_id, ra.fiscal_year_id, ra.organization_unit_id, ra.payer_id, ra.service_line_id
    ORDER BY ra.period_number ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS ytd_external_net_revenue,
  SUM(ra.budgeted_revenue) OVER (
    PARTITION BY ra.legal_entity_id, ra.control_scope_id, ra.fiscal_year_id, ra.organization_unit_id, ra.payer_id, ra.service_line_id
    ORDER BY ra.period_number ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS ytd_budgeted_revenue
FROM revenue_actuals AS ra;

COMMENT ON VIEW public.v_revenue_budget_vs_actual IS
  '@classification data_api_exposed; monthly revenue gross-to-net with payer and service-line dimensions';

CREATE VIEW public.v_profitability_period_performance
WITH (security_invoker = true) AS
WITH classified AS (
  SELECT
    bva.legal_entity_id,
    bva.control_scope_id,
    bva.fiscal_year_id,
    bva.fiscal_period_id,
    bva.period_number,
    bva.financial_reporting_group,
    bva.external_internal_class,
    SUM(bva.monthly_budget) AS budget_amount,
    SUM(CASE WHEN bva.external_internal_class = 'external' THEN bva.mtd_actual ELSE 0 END) AS external_actual,
    SUM(bva.mtd_actual) AS total_actual
  FROM public.v_budget_vs_actual AS bva
  WHERE private.user_can_access_legal_entity(bva.legal_entity_id)
  GROUP BY
    bva.legal_entity_id, bva.control_scope_id, bva.fiscal_year_id, bva.fiscal_period_id,
    bva.period_number, bva.financial_reporting_group, bva.external_internal_class
),
pivoted AS (
  SELECT
    legal_entity_id,
    control_scope_id,
    fiscal_year_id,
    fiscal_period_id,
    period_number,
    SUM(CASE WHEN financial_reporting_group = 'revenue' AND external_internal_class = 'external' THEN external_actual ELSE 0 END) AS net_revenue,
    SUM(CASE WHEN financial_reporting_group = 'revenue' AND external_internal_class = 'external' THEN budget_amount ELSE 0 END) AS net_revenue_budget,
    SUM(CASE WHEN financial_reporting_group = 'cost_of_revenue' THEN external_actual ELSE 0 END) AS cost_of_revenue,
    SUM(CASE WHEN financial_reporting_group = 'cost_of_revenue' THEN budget_amount ELSE 0 END) AS cost_of_revenue_budget,
    SUM(CASE WHEN financial_reporting_group = 'payroll' THEN external_actual ELSE 0 END) AS payroll,
    SUM(CASE WHEN financial_reporting_group = 'payroll' THEN budget_amount ELSE 0 END) AS payroll_budget,
    SUM(CASE WHEN financial_reporting_group = 'operating_expenses' THEN external_actual ELSE 0 END) AS operating_expenses,
    SUM(CASE WHEN financial_reporting_group = 'operating_expenses' THEN budget_amount ELSE 0 END) AS operating_expenses_budget,
    SUM(CASE WHEN financial_reporting_group = 'capex' THEN external_actual ELSE 0 END) AS capex_actual
  FROM classified
  GROUP BY legal_entity_id, control_scope_id, fiscal_year_id, fiscal_period_id, period_number
)
SELECT
  p.*,
  p.net_revenue - p.cost_of_revenue AS gross_profit,
  CASE WHEN p.net_revenue = 0 THEN NULL ELSE (p.net_revenue - p.cost_of_revenue) / p.net_revenue END AS gross_margin_percentage,
  p.net_revenue - p.cost_of_revenue - p.payroll - p.operating_expenses AS operating_contribution,
  CASE
    WHEN p.net_revenue = 0 THEN NULL
    ELSE (p.net_revenue - p.cost_of_revenue - p.payroll - p.operating_expenses) / p.net_revenue
  END AS operating_contribution_margin
FROM pivoted AS p;

COMMENT ON VIEW public.v_profitability_period_performance IS
  '@classification data_api_exposed; monthly profitability bridge excluding CAPEX from operating contribution';

CREATE VIEW public.v_hospital_period_performance
WITH (security_invoker = true) AS
SELECT
  pp.legal_entity_id,
  pp.control_scope_id,
  pp.fiscal_year_id,
  pp.fiscal_period_id,
  pp.period_number,
  pp.net_revenue,
  pp.net_revenue_budget,
  pp.net_revenue - pp.net_revenue_budget AS revenue_variance,
  CASE WHEN pp.net_revenue_budget = 0 THEN NULL ELSE pp.net_revenue / pp.net_revenue_budget END AS revenue_attainment,
  pp.cost_of_revenue,
  pp.gross_profit,
  pp.gross_margin_percentage AS gross_margin,
  pp.payroll,
  pp.operating_expenses,
  pp.operating_contribution,
  pp.net_revenue AS mtd_net_revenue,
  SUM(pp.net_revenue) OVER (
    PARTITION BY pp.legal_entity_id, pp.control_scope_id, pp.fiscal_year_id
    ORDER BY pp.period_number ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS ytd_net_revenue,
  SUM(pp.net_revenue_budget) OVER (
    PARTITION BY pp.legal_entity_id, pp.control_scope_id, pp.fiscal_year_id
    ORDER BY pp.period_number ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS ytd_revenue_budget,
  pp.net_revenue + (
    SELECT COALESCE(SUM(bva.monthly_budget), 0)
    FROM public.v_budget_vs_actual AS bva
    JOIN public.fiscal_periods AS fp ON fp.id = bva.fiscal_period_id
    WHERE bva.legal_entity_id = pp.legal_entity_id
      AND bva.control_scope_id = pp.control_scope_id
      AND bva.fiscal_year_id = pp.fiscal_year_id
      AND fp.period_number > pp.period_number
      AND bva.financial_reporting_group = 'revenue'
  ) AS full_year_forecast
FROM public.v_profitability_period_performance AS pp
WHERE private.user_can_access_legal_entity(pp.legal_entity_id);

COMMENT ON VIEW public.v_hospital_period_performance IS
  '@classification data_api_exposed; hospital performance with classified revenue and profitability measures';

CREATE VIEW public.v_restaurant_branch_performance
WITH (security_invoker = true) AS
SELECT
  ou.id AS branch_id,
  ou.code AS branch_code,
  ou.name_en,
  ou.name_ar,
  ou.legal_entity_id,
  COALESCE(SUM(CASE WHEN cn.code IN ('FOOD-BEEF', 'FOOD') AND atx.transaction_class = 'external' THEN ata.reporting_amount_ex_vat ELSE 0 END), 0) AS food_cost,
  COALESCE(SUM(CASE WHEN cn.code = 'LABOR' THEN ata.reporting_amount_ex_vat ELSE 0 END), 0) AS labor_cost,
  COALESCE(SUM(CASE WHEN cn.classification = 'revenue' AND atx.transaction_class = 'external' THEN ata.reporting_amount_ex_vat ELSE 0 END), 0) AS external_revenue,
  COALESCE(SUM(CASE WHEN cn.classification IN ('revenue', 'internal_transfer') AND atx.transaction_class <> 'external' THEN ata.reporting_amount_ex_vat ELSE 0 END), 0) AS internal_revenue,
  COALESCE(SUM(CASE WHEN cn.classification = 'revenue' AND atx.transaction_class = 'external' THEN ata.reporting_amount_ex_vat ELSE 0 END), 0) AS revenue,
  COALESCE(SUM(CASE WHEN cn.classification = 'opex' THEN ata.reporting_amount_ex_vat ELSE 0 END), 0) AS operating_expenses,
  COUNT(DISTINCT CASE WHEN cn.classification = 'revenue' AND atx.transaction_class = 'external' THEN atx.id END) AS cover_transactions
FROM public.organization_units AS ou
LEFT JOIN (
  public.actual_transaction_allocations AS ata
  JOIN public.actual_transactions AS atx
    ON atx.id = ata.actual_transaction_id AND atx.is_posted = true
) ON ata.organization_unit_id = ou.id
LEFT JOIN public.cost_nodes AS cn ON cn.id = ata.cost_node_id
WHERE ou.code LIKE 'REST-%'
  AND private.user_can_access_legal_entity(ou.legal_entity_id)
GROUP BY ou.id, ou.code, ou.name_en, ou.name_ar, ou.legal_entity_id;

COMMENT ON VIEW public.v_restaurant_branch_performance IS
  '@classification data_api_exposed; restaurant branch performance with external/internal revenue separation';

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
    COALESCE(SUM(cab.bac * COALESCE(vmp.verified_progress_pct, 0) / 100.0), 0) AS ev
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
    COALESCE(SUM(ata.reporting_amount_ex_vat), 0) AS ac
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
  '@classification data_api_exposed; EVM inputs using reporting amounts';

GRANT SELECT ON TABLE
  public.v_commitment_current_snapshot,
  public.v_budget_vs_actual,
  public.v_revenue_budget_vs_actual,
  public.v_profitability_period_performance,
  public.v_hospital_period_performance,
  public.v_restaurant_branch_performance,
  public.v_project_earned_value
TO authenticated;
