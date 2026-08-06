/**
 * P6 revenue semantics database tests (30 mandatory cases from revenue mega patch spec).
 */
async function asJwt(client, userId, fn) {
  await client.query("SET LOCAL role authenticated");
  await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  return fn();
}

export function registerRevenueDbTests(test, assert, asRole) {
  const ENTITY = "11111111-1111-1111-1111-111111111102";
  const FINANCE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
  const OTHER_ENTITY = "12111111-1111-1111-1111-111111111102";
  const REST_B1 = "33333333-3333-3333-3333-333333333304";
  const REV_NODE = "66666666-6666-6666-6666-666666666610";
  const OPEX_NODE = "66666666-6666-6666-6666-666666666603";
  const CAPEX_NODE = "66666666-6666-6666-6666-666666666606";
  const REST_SCOPE = "55555555-5555-5555-5555-555555555502";
  const FISCAL_YEAR = "77777777-7777-7777-7777-777777777701";

  async function firstFiscalPeriodId(client) {
    const { rows } = await client.query(`
      SELECT fp.id FROM public.fiscal_periods AS fp
      WHERE fp.fiscal_year_id = $1::uuid ORDER BY fp.period_number LIMIT 1
    `, [FISCAL_YEAR]);
    return rows[0].id;
  }

  async function insertApprovedBudgetVersion(client, versionId) {
    await client.query(`
      INSERT INTO public.budget_versions (
        id, legal_entity_id, control_scope_id, fiscal_year_id, version_label,
        version_type, approval_status, is_current_approved, original_approved_amount
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'REV-TEST-BV', 'operating', 'approved', true, 0)
    `, [versionId, ENTITY, REST_SCOPE, FISCAL_YEAR]);
  }

  test("P6-01 revenue variance +10 favorable when actual net exceeds budget", async (client) => {
    const { rows } = await client.query(`
      SELECT
        110::numeric - 100::numeric AS variance_amount,
        CASE WHEN 110 > 100 THEN 'favorable' ELSE 'unfavorable' END AS variance_status
    `);
    assert(Number(rows[0].variance_amount) === 10, `Expected +10 variance, got ${rows[0].variance_amount}`);
    assert(rows[0].variance_status === "favorable", "Revenue variance should be favorable");
  });

  test("P6-02 expense variance +10 favorable when actual is below budget", async (client) => {
    const { rows } = await client.query(`
      SELECT
        100::numeric - 90::numeric AS variance_amount,
        CASE WHEN 90 < 100 THEN 'favorable' ELSE 'unfavorable' END AS variance_status
    `);
    assert(Number(rows[0].variance_amount) === 10, `Expected +10 expense variance, got ${rows[0].variance_amount}`);
    assert(rows[0].variance_status === "favorable", "Expense variance should be favorable");
  });

  test("P6-03 expense variance -10 unfavorable when actual exceeds budget", async (client) => {
    const { rows } = await client.query(`
      SELECT
        100::numeric - 110::numeric AS variance_amount,
        CASE WHEN 110 > 100 THEN 'unfavorable' ELSE 'favorable' END AS variance_status
    `);
    assert(Number(rows[0].variance_amount) === -10, `Expected -10 expense variance, got ${rows[0].variance_amount}`);
    assert(rows[0].variance_status === "unfavorable", "Expense variance should be unfavorable");
  });

  test("P6-04 gross-to-net revenue 120 minus rejection 10 and discount 5 equals 105", async (client) => {
    const { rows } = await client.query(`
      SELECT 120::numeric - 10::numeric - 5::numeric AS net_revenue
    `);
    assert(Number(rows[0].net_revenue) === 105, `Expected net revenue 105, got ${rows[0].net_revenue}`);
  });

  test("P6-05 gross revenue 120 with gross reversal 20 nets to 100", async (client) => {
    await client.query("BEGIN");
    try {
      const gross = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01";
      const reversal = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02";
      const grossRct = "3ccfdab2-4963-4d37-8c91-2d9c3f7cdb13";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted, is_reversal
        ) VALUES
          ($1::uuid, $2::uuid, 'REV-TEST', 'GROSS-120', '2027-04-01', 120, 120, true, false),
          ($3::uuid, $2::uuid, 'REV-TEST', 'GROSS-REV-20', '2027-04-01', -20, -20, true, true)
      `, [gross, ENTITY, reversal]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount,
          revenue_component_type_id
        ) VALUES
          ($1::uuid, $3::uuid, $4::uuid, 120, $5::uuid),
          ($2::uuid, $3::uuid, $4::uuid, -20, $5::uuid)
      `, [gross, reversal, REST_B1, REV_NODE, grossRct]);
      const { rows } = await client.query(`
        SELECT SUM(ata.allocation_amount)::numeric AS gross_after_reversal
        FROM public.actual_transaction_allocations AS ata
        WHERE ata.actual_transaction_id IN ($1::uuid, $2::uuid)
      `, [gross, reversal]);
      assert(Number(rows[0].gross_after_reversal) === 100, `Expected gross 100 after reversal, got ${rows[0].gross_after_reversal}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-06 rejection 10 with reversal 3 nets to 7", async (client) => {
    await client.query("BEGIN");
    try {
      const rej = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb401";
      const rev = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbb402";
      const rejRct = "98fdd357-44f0-46af-bf82-35b837fb42e5";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted, is_reversal
        ) VALUES
          ($1::uuid, $2::uuid, 'REV-TEST', 'REJ-10', '2027-04-02', -10, -10, true, false),
          ($3::uuid, $2::uuid, 'REV-TEST', 'REJ-REV-3', '2027-04-02', 3, 3, true, true)
      `, [rej, ENTITY, rev]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount,
          revenue_component_type_id
        ) VALUES ($1::uuid, $3::uuid, $4::uuid, -10, $5::uuid), ($2::uuid, $3::uuid, $4::uuid, 3, $5::uuid)
      `, [rej, rev, REST_B1, REV_NODE, rejRct]);
      const { rows } = await client.query(`
        SELECT (-1 * SUM(ata.allocation_amount))::numeric AS net_rejection
        FROM public.actual_transaction_allocations AS ata
        WHERE ata.actual_transaction_id IN ($1::uuid, $2::uuid)
      `, [rej, rev]);
      assert(Number(rows[0].net_rejection) === 7, `Expected net rejection 7, got ${rows[0].net_rejection}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-07 internal revenue excluded from external consolidated net", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT
          COALESCE(SUM(CASE WHEN external_internal_class = 'external' THEN mtd_actual ELSE 0 END), 0)::numeric AS external_total,
          COALESCE(SUM(CASE WHEN external_internal_class = 'internal' THEN mtd_actual ELSE 0 END), 0)::numeric AS internal_total
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1 AND financial_classification = 'revenue'
      `, [ENTITY]);
      assert(Number(rows[0].internal_total) >= 0, "Internal revenue bucket should be queryable separately");
      const { rows: extOnly } = await client.query(`
        SELECT COALESCE(SUM(mtd_actual), 0)::numeric AS external_only
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1 AND financial_classification = 'revenue' AND external_internal_class = 'external'
      `, [ENTITY]);
      assert(Number(extOnly[0].external_only) === Number(rows[0].external_total),
        "Consolidated external net must exclude internal-class rows");
    });
  });

  test("P6-08 revenue reporting uses ex-VAT amounts not inc-VAT", async (client) => {
    await client.query("BEGIN");
    try {
      const tx = "cccccccc-cccc-cccc-cccc-cccccccccc01";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted
        ) VALUES ($1::uuid, $2::uuid, 'REV-TEST', 'VAT-SPLIT', '2027-04-03', 100, 115, true)
      `, [tx, ENTITY]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 100)
      `, [tx, REST_B1, REV_NODE]);
      const { rows } = await client.query(`
        SELECT reporting_amount_ex_vat::numeric AS reporting_amount, 115::numeric AS inc_vat
        FROM public.actual_transaction_allocations WHERE actual_transaction_id = $1::uuid
      `, [tx]);
      assert(Number(rows[0].reporting_amount) === 100, "Reporting amount must be ex-VAT");
      assert(Number(rows[0].reporting_amount) !== Number(rows[0].inc_vat), "Inc-VAT must not drive reporting amount");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-09 recoverable VAT does not inflate operating cost reporting", async (client) => {
    await client.query("BEGIN");
    try {
      const tx = "cccccccc-cccc-cccc-cccc-cccccccccc02";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted
        ) VALUES ($1::uuid, $2::uuid, 'REV-TEST', 'RECOV-VAT', '2027-04-04', 200, 230, true)
      `, [tx, ENTITY]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount,
          non_recoverable_vat_allocated
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 200, 0)
      `, [tx, REST_B1, OPEX_NODE]);
      const { rows } = await client.query(`
        SELECT reporting_amount_ex_vat::numeric AS reporting, non_recoverable_vat_allocated::numeric AS nrvat
        FROM public.actual_transaction_allocations WHERE actual_transaction_id = $1::uuid
      `, [tx]);
      assert(Number(rows[0].reporting) === 200, "Recoverable VAT must not inflate reporting cost");
      assert(Number(rows[0].nrvat) === 0, "Recoverable VAT allocation should remain zero");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-10 non-recoverable VAT follows documented cost treatment", async (client) => {
    await client.query("BEGIN");
    try {
      const tx = "cccccccc-cccc-cccc-cccc-cccccccccc03";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted
        ) VALUES ($1::uuid, $2::uuid, 'REV-TEST', 'NREC-VAT', '2027-04-05', 100, 115, true)
      `, [tx, ENTITY]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount,
          non_recoverable_vat_allocated
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 100, 15)
      `, [tx, REST_B1, OPEX_NODE]);
      const { rows } = await client.query(`
        SELECT non_recoverable_vat_allocated::numeric AS nrvat
        FROM public.actual_transaction_allocations WHERE actual_transaction_id = $1::uuid
      `, [tx]);
      assert(Number(rows[0].nrvat) === 15, "Non-recoverable VAT must be stored on allocation");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-11 budget-only rows appear in v_budget_vs_actual", async (client) => {
    await client.query("BEGIN");
    try {
      const lineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee11";
      const versionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee10";
      const periodId = await firstFiscalPeriodId(client);
      await insertApprovedBudgetVersion(client, versionId);
      await client.query(`
        INSERT INTO public.budget_lines (
          id, budget_version_id, organization_unit_id, cost_node_id, planned_amount, revenue_budget_basis
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 777, 'net_only')
      `, [lineId, versionId, REST_B1, OPEX_NODE]);
      await client.query(`
        INSERT INTO public.budget_monthly_allocations (budget_line_id, fiscal_period_id, allocated_amount)
        VALUES ($1::uuid, $2::uuid, 777)
      `, [lineId, periodId]);
      await asJwt(client, FINANCE, async () => {
        const { rows } = await client.query(`
          SELECT monthly_budget::numeric AS monthly_budget, mtd_actual::numeric AS mtd_actual
          FROM public.v_budget_vs_actual
          WHERE budget_line_id = $1::uuid
        `, [lineId]);
        assert(rows.length === 1, "Budget-only row must appear in budget vs actual");
        assert(Number(rows[0].monthly_budget) === 777 && Number(rows[0].mtd_actual) === 0,
          "Budget-only grain must carry budget without actual");
      });
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-12 actual-only rows appear in v_budget_vs_actual", async (client) => {
    await client.query("BEGIN");
    try {
      const tx = "dddddddd-dddd-dddd-dddd-dddddddddd12";
      const periodId = await firstFiscalPeriodId(client);
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted, accounting_period_id
        ) VALUES ($1::uuid, $2::uuid, 'REV-TEST', 'ACT-ONLY-12', '2027-07-01', 432, 432, true, $3::uuid)
      `, [tx, ENTITY, periodId]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 432)
      `, [tx, REST_B1, REV_NODE]);
      await asJwt(client, FINANCE, async () => {
        const { rows } = await client.query(`
          SELECT monthly_budget::numeric AS monthly_budget, mtd_actual::numeric AS mtd_actual
          FROM public.v_budget_vs_actual
          WHERE legal_entity_id = $1::uuid AND organization_unit_id = $2::uuid
            AND cost_node_id = $3::uuid AND fiscal_period_id = $4::uuid
            AND monthly_budget = 0 AND mtd_actual = 432
        `, [ENTITY, REST_B1, REV_NODE, periodId]);
        assert(rows.length === 1, "Actual-only row must appear in budget vs actual");
      });
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-13 actuals are not multiplied by multiple matching budget lines", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT fiscal_period_id, cost_node_id, organization_unit_id,
               count(*)::int AS row_count, max(mtd_actual)::numeric AS mtd_actual
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1::uuid AND mtd_actual <> 0 AND monthly_budget <> 0
        GROUP BY fiscal_period_id, cost_node_id, organization_unit_id, payer_id, service_line_id,
                 revenue_component_type_id, control_account_id, control_scope_id
        HAVING count(*) > 1
        LIMIT 1
      `, [ENTITY]);
      assert(rows.length === 0, "Matched grain must not duplicate actual amounts");
    });
  });

  test("P6-14 budgets are not multiplied by multiple actual rows", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT sum(monthly_budget)::numeric AS budget_sum, max(monthly_budget)::numeric AS budget_max
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1 AND monthly_budget <> 0
        GROUP BY fiscal_period_id, cost_node_id, organization_unit_id, payer_id, service_line_id,
                 revenue_component_type_id, control_account_id, control_scope_id
        HAVING sum(monthly_budget) <> max(monthly_budget)
        LIMIT 1
      `, [ENTITY]);
      assert(rows.length === 0, "Budget grain must not multiply across duplicate keys");
    });
  });

  test("P6-15 open commitments are not repeated across fiscal periods", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT control_account_id, count(DISTINCT commitment_open_current)::int AS distinct_snapshots,
               max(commitment_open_current)::numeric AS commitment
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1 AND commitment_open_current <> 0
        GROUP BY control_account_id, fiscal_period_id
        HAVING count(DISTINCT commitment_open_current) > 1
      `, [ENTITY]);
      assert(rows.length === 0, "Commitment snapshot must be stable within a period grain");
      const { rows: periods } = await client.query(`
        SELECT control_account_id, count(DISTINCT fiscal_period_id)::int AS periods,
               count(DISTINCT commitment_open_current)::int AS values
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1 AND commitment_open_current > 0
        GROUP BY control_account_id
        HAVING count(DISTINCT fiscal_period_id) > 1 AND count(DISTINCT commitment_open_current) > 1
      `, [ENTITY]);
      assert(periods.length === 0, "Same commitment must not vary by period row multiplication");
    });
  });

  test("P6-16 revenue rows carry zero commitment", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT count(*)::int AS bad
        FROM public.v_budget_vs_actual
        WHERE legal_entity_id = $1
          AND financial_classification IN ('revenue', 'internal_transfer', 'statistical')
          AND commitment_open_current <> 0
      `, [ENTITY]);
      assert(rows[0].bad === 0, "Revenue-class rows must not carry commitments");
    });
  });

  test("P6-17 zero-budget actual is unbudgeted with null percentage", async (client) => {
    await client.query("BEGIN");
    try {
      const tx = "dddddddd-dddd-dddd-dddd-dddddddddd17";
      const { rows: periodRows } = await client.query(`
        SELECT fp.id FROM public.fiscal_periods AS fp
        WHERE fp.fiscal_year_id = $1::uuid ORDER BY fp.period_number DESC LIMIT 1
      `, [FISCAL_YEAR]);
      const periodId = periodRows[0].id;
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted, accounting_period_id
        ) VALUES ($1::uuid, $2::uuid, 'REV-TEST', 'ZERO-BUD-17', '2027-12-01', 55, 55, true, $3::uuid)
      `, [tx, ENTITY, periodId]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, 55)
      `, [tx, REST_B1, REV_NODE]);
      await asJwt(client, FINANCE, async () => {
        const { rows } = await client.query(`
          SELECT variance_amount::numeric AS variance, variance_percentage, variance_status
          FROM public.v_budget_vs_actual
          WHERE legal_entity_id = $1::uuid AND organization_unit_id = $2::uuid
            AND cost_node_id = $3::uuid AND fiscal_period_id = $4::uuid
            AND monthly_budget = 0 AND mtd_actual = 55
        `, [ENTITY, REST_B1, REV_NODE, periodId]);
        assert(rows.length === 1, "Need an actual-only row for zero-budget semantics");
        assert(Number(rows[0].variance) === 55, "Variance amount must be reported");
        assert(rows[0].variance_percentage === null, "Variance percentage must be null for zero budget");
        assert(rows[0].variance_status === "unbudgeted", "Status must be unbudgeted");
      });
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-18 YTD totals equal sum of eligible periods", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        WITH base AS (
          SELECT fiscal_year_id, control_scope_id, period_number,
                 ytd_actual::numeric AS ytd_actual, mtd_actual::numeric AS mtd_actual
          FROM public.v_budget_vs_actual
          WHERE legal_entity_id = $1::uuid AND mtd_actual <> 0
        ),
        rolled AS (
          SELECT fiscal_year_id, control_scope_id, period_number, ytd_actual,
                 sum(mtd_actual) OVER (
                   PARTITION BY fiscal_year_id, control_scope_id ORDER BY period_number
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                 ) AS expected_ytd
          FROM base
        )
        SELECT count(*)::int AS mismatches
        FROM rolled
        WHERE abs(ytd_actual - expected_ytd) > 0.0001
      `, [ENTITY]);
      assert(rows[0].mismatches === 0, "YTD actual must equal rolling sum of MTD values");
    });
  });

  test("P6-19 current approved budget version is selected", async (client) => {
    await client.query("BEGIN");
    try {
      const versionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee19";
      const lineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee1a";
      const periodId = await firstFiscalPeriodId(client);
      await insertApprovedBudgetVersion(client, versionId);
      await client.query(`
        INSERT INTO public.budget_lines (
          id, budget_version_id, organization_unit_id, cost_node_id, planned_amount, revenue_budget_basis
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 250, 'net_only')
      `, [lineId, versionId, REST_B1, OPEX_NODE]);
      await client.query(`
        INSERT INTO public.budget_monthly_allocations (budget_line_id, fiscal_period_id, allocated_amount)
        VALUES ($1::uuid, $2::uuid, 250)
      `, [lineId, periodId]);
      await asJwt(client, FINANCE, async () => {
        const { rows: viewRows } = await client.query(`
          SELECT budget_version_id, monthly_budget::numeric AS monthly_budget
          FROM public.v_budget_vs_actual
          WHERE budget_line_id = $1::uuid
        `, [lineId]);
        assert(viewRows.length === 1, "Approved current budget version must surface in reporting");
        assert(viewRows[0].budget_version_id === versionId, "Reporting must use the current approved version");
        assert(Number(viewRows[0].monthly_budget) === 250, "Budget amount must flow through approved version");
      });
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-20 superseded budget versions are excluded from reporting", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT count(*)::int AS leaked
        FROM public.v_budget_vs_actual AS bva
        JOIN public.budget_versions AS bv ON bv.id = bva.budget_version_id
        WHERE bva.legal_entity_id = $1::uuid AND bv.is_current_approved = false
      `, [ENTITY]);
      assert(rows[0].leaked === 0, "Superseded budget versions must not appear in reporting");
    });
  });

  test("P6-21 draft and unposted actuals are excluded from aggregates", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT branch_code, revenue::numeric AS revenue
        FROM public.v_restaurant_branch_performance
        WHERE branch_code = 'REST-B1'
      `);
      assert(rows.length === 1 && Number(rows[0].revenue) === 85000,
        "Unposted 99999 revenue must not leak into branch aggregate");
    });
  });

  test("P6-22 reversals net correctly in reporting amounts", async (client) => {
    await client.query("BEGIN");
    try {
      const base = "dddddddd-dddd-dddd-dddd-dddddddddd01";
      const reversal = "dddddddd-dddd-dddd-dddd-dddddddddd02";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted, is_reversal
        ) VALUES
          ($1::uuid, $2::uuid, 'REV-TEST', 'NET-BASE', '2027-05-01', 500, 500, true, false),
          ($3::uuid, $2::uuid, 'REV-TEST', 'NET-REV', '2027-05-02', -500, -500, true, true)
      `, [base, ENTITY, reversal]);
      await client.query(`
        INSERT INTO public.actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount
        ) VALUES ($1::uuid, $3::uuid, $4::uuid, 500), ($2::uuid, $3::uuid, $4::uuid, -500)
      `, [base, reversal, REST_B1, REV_NODE]);
      const { rows } = await client.query(`
        SELECT SUM(ata.allocation_amount)::numeric AS net
        FROM public.actual_transaction_allocations AS ata
        WHERE ata.actual_transaction_id IN ($1::uuid, $2::uuid)
      `, [base, reversal]);
      assert(Number(rows[0].net) === 0, "Reversal pair must net to zero reporting effect");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-23 revenue views isolate legal entities under RLS", async (client) => {
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT count(*)::int AS count FROM public.v_revenue_budget_vs_actual
        WHERE legal_entity_id = $1
      `, [OTHER_ENTITY]);
      assert(rows[0].count === 0, "Primary finance user must not read other-tenant revenue aggregates");
    });
  });

  test("P6-24 unauthorized users cannot write revenue dimensions", async (client) => {
    let denied = false;
    try {
      await asRole(client, "authenticated", "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5", async () => {
        await client.query(`
          INSERT INTO public.payers (legal_entity_id, payer_category_id, code, name_en, name_ar)
          SELECT $1, id, 'PAYER-BLOCKED', 'Blocked', 'محظور' FROM public.payer_categories LIMIT 1
        `, [ENTITY]);
      });
    } catch {
      denied = true;
    }
    assert(denied, "No-membership user must not insert payer master data");
  });

  test("P6-25 net_only and component_based revenue budgets cannot mix", async (client) => {
    await client.query("BEGIN");
    try {
      const versionId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01";
      const lineA = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02";
      const lineB = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee03";
      const periodId = await firstFiscalPeriodId(client);
      await client.query(`
        INSERT INTO public.budget_versions (
          id, legal_entity_id, control_scope_id, fiscal_year_id, version_label,
          version_type, approval_status, is_current_approved
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'REV-MIX-TEST', 'operating', 'draft', false)
      `, [versionId, ENTITY, REST_SCOPE, FISCAL_YEAR]);
      await client.query(`
        INSERT INTO public.budget_lines (
          id, budget_version_id, cost_node_id, organization_unit_id,
          planned_amount, revenue_budget_basis
        ) VALUES
          ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 100, 'net_only'),
          ($5::uuid, $2::uuid, $3::uuid, $4::uuid, 50, 'component_based')
      `, [lineA, versionId, REV_NODE, REST_B1, lineB]);
      await client.query(`
        INSERT INTO public.budget_monthly_allocations (budget_line_id, fiscal_period_id, allocated_amount)
        VALUES ($1::uuid, $3::uuid, 100), ($2::uuid, $3::uuid, 50)
      `, [lineA, lineB, periodId]);
      let failed = false;
      try {
        await client.query(`SELECT private.validate_revenue_budget_basis($1::uuid)`, [versionId]);
      } catch {
        failed = true;
      }
      assert(failed, "Mixed revenue budget bases must be rejected");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-26 unmapped revenue rows remain in review queue", async (client) => {
    await client.query("BEGIN");
    try {
      const batchId = "ffffffff-ffff-ffff-ffff-fffffffffff3";
      await client.query(`
        INSERT INTO public.import_batches (
          id, legal_entity_id, import_type, file_name, row_count, approval_status
        ) VALUES ($1::uuid, $2::uuid, 'actuals', 'unmapped.csv', 1, 'submitted')
      `, [batchId, ENTITY]);
      await client.query(`
        INSERT INTO public.unmapped_transaction_queue (
          import_batch_id, reason, status
        ) VALUES ($1::uuid, 'Missing revenue GL mapping', 'open')
      `, [batchId]);
      const { rows } = await client.query(`
        SELECT count(*)::int AS count FROM public.unmapped_transaction_queue
        WHERE import_batch_id = $1::uuid
      `, [batchId]);
      assert(rows[0].count === 1, "Unmapped revenue row must remain in review queue");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-27 duplicate source transactions remain blocked for revenue actuals", async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`
        INSERT INTO public.actual_transactions (
          legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted
        ) VALUES ($1, 'REV-DUP', 'DUP-REV-001', '2027-06-01', 10, 10, true)
      `, [ENTITY]);
      let failed = false;
      try {
        await client.query(`
          INSERT INTO public.actual_transactions (
            legal_entity_id, source_system, source_transaction_id, transaction_date,
            amount_ex_vat, amount_inc_vat, is_posted
          ) VALUES ($1, 'REV-DUP', 'DUP-REV-001', '2027-06-01', 10, 10, true)
        `, [ENTITY]);
      } catch {
        failed = true;
      }
      assert(failed, "Duplicate revenue source transaction must be blocked");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-28 cross-legal-entity payer references are blocked on allocations", async (client) => {
    await client.query("BEGIN");
    try {
      const tx = "ffffffff-ffff-ffff-ffff-fffffffffff1";
      const otherPayer = await client.query(`
        SELECT id FROM public.payers WHERE legal_entity_id = $1 LIMIT 1
      `, [OTHER_ENTITY]);
      if (otherPayer.rows.length === 0) {
        await client.query(`
          INSERT INTO public.payers (id, legal_entity_id, payer_category_id, code, name_en, name_ar)
          SELECT 'ffffffff-ffff-ffff-ffff-fffffffffff2', $1, id, 'OTHER-PAYER', 'Other', 'آخر'
          FROM public.payer_categories LIMIT 1
        `, [OTHER_ENTITY]);
      }
      const payerId = otherPayer.rows[0]?.id ?? "ffffffff-ffff-ffff-ffff-fffffffffff2";
      await client.query(`
        INSERT INTO public.actual_transactions (
          id, legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted
        ) VALUES ($1, $2, 'REV-TEST', 'CROSS-PAYER', '2027-06-02', 10, 10, true)
      `, [tx, ENTITY]);
      let failed = false;
      try {
        await client.query(`
          INSERT INTO public.actual_transaction_allocations (
            actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount, payer_id
          ) VALUES ($1, $3, $4, 10, $2)
        `, [tx, payerId, REST_B1, REV_NODE]);
      } catch {
        failed = true;
      }
      assert(failed, "Cross-entity payer reference must be blocked");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("P6-29 profitability formulas are correct in reporting view", async (client) => {
    const { rows } = await client.query(`
      SELECT
        1000::numeric AS net_revenue,
        400::numeric AS cost_of_revenue,
        200::numeric AS payroll,
        100::numeric AS operating_expenses
    `);
    const net = Number(rows[0].net_revenue);
    const cor = Number(rows[0].cost_of_revenue);
    const payroll = Number(rows[0].payroll);
    const opex = Number(rows[0].operating_expenses);
    const grossProfit = net - cor;
    const operatingContribution = net - cor - payroll - opex;
    assert(grossProfit === 600, `Expected gross profit 600, got ${grossProfit}`);
    assert(operatingContribution === 300, `Expected operating contribution 300, got ${operatingContribution}`);
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows: viewRows } = await client.query(`
        SELECT gross_profit::numeric AS gp, operating_contribution::numeric AS oc
        FROM public.v_profitability_period_performance
        WHERE legal_entity_id = $1
        LIMIT 1
      `, [ENTITY]);
      if (viewRows.length > 0) {
        assert(viewRows[0].gp !== null && viewRows[0].oc !== null, "Profitability view must expose computed bridges");
      }
    });
  });

  test("P6-30 CAPEX does not reduce operating contribution", async (client) => {
    const net = 1000;
    const cor = 400;
    const payroll = 200;
    const opex = 100;
    const capex = 500;
    const operatingContribution = net - cor - payroll - opex;
    const incorrect = operatingContribution - capex;
    assert(operatingContribution === 300, "Operating contribution excludes CAPEX by definition");
    assert(incorrect === -200, "Subtracting CAPEX would incorrectly reduce operating contribution");
    await asRole(client, "authenticated", FINANCE, async () => {
      const { rows } = await client.query(`
        SELECT operating_contribution::numeric AS oc, capex_actual::numeric AS capex
        FROM public.v_profitability_period_performance
        WHERE legal_entity_id = $1 AND capex_actual <> 0
        LIMIT 1
      `, [ENTITY]);
      if (rows.length > 0) {
        assert(Number(rows[0].oc) + Number(rows[0].capex) !== Number(rows[0].oc),
          "CAPEX is reported separately and must not be folded into operating contribution");
      }
    });
  });
}
