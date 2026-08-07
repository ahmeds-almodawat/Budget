/**
 * ULTRA MEGA database integrity tests (procurement, delegation, period-close, appraisal, master-data).
 */
export function registerUltraMegaDbTests(test, assert, asRole) {
  const ENTITY = "11111111-1111-1111-1111-111111111102";
  const FINANCE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
  const APPROVER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2";
  const COST_CTRL = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8";
  const EMPLOYEE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7";
  const MANAGER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6";
  const VIEWER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5";
  const GROUP_ADMIN = "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
  const VENDOR_A = "dddddddd-dddd-dddd-dddd-ddddddddd101";
  const VENDOR_B = "dddddddd-dddd-dddd-dddd-ddddddddd102";
  const FOOD_NODE = "66666666-6666-6666-6666-666666666605";
  const REST_SCOPE = "55555555-5555-5555-5555-555555555502";
  const FISCAL_YEAR = "77777777-7777-7777-7777-777777777701";
  const APPRAISAL_ASSIGNMENT = "dddddddd-dddd-dddd-dddd-ddddddddd405";
  const CRITERION_DELIVERY = "dddddddd-dddd-dddd-dddd-ddddddddd403";
  const CRITERION_COLLAB = "dddddddd-dddd-dddd-dddd-ddddddddd404";
  const DELEGATION = "dddddddd-dddd-dddd-dddd-ddddddddd301";

  async function authAs(client, userId) {
    await client.query("SET LOCAL role authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
  }

  async function grantRoleForTest(client, userId, roleCode) {
    await client.query(
      `INSERT INTO public.role_assignments (user_id, role_id, scope_type, scope_id, effective_start)
       SELECT $1::uuid, r.id, 'legal_entity', $2::uuid, CURRENT_DATE
       FROM public.roles AS r
       WHERE r.code = $3
         AND NOT EXISTS (
           SELECT 1 FROM public.role_assignments AS existing
           JOIN public.roles AS existing_role ON existing_role.id = existing.role_id
           WHERE existing.user_id = $1::uuid AND existing_role.code = $3
             AND existing.scope_type = 'legal_entity' AND existing.scope_id = $2::uuid
         )`,
      [userId, ENTITY, roleCode],
    );
  }

  async function fiscalPeriodId(client, periodNumber = 3) {
    const { rows } = await client.query(
      `SELECT id FROM public.fiscal_periods
       WHERE fiscal_year_id = $1::uuid AND period_number = $2 LIMIT 1`,
      [FISCAL_YEAR, periodNumber],
    );
    assert(rows.length === 1, `Missing fiscal period ${periodNumber}`);
    return rows[0].id;
  }

  async function seedApprovedRequisition(client, {
    reqId,
    line1Id,
    line2Id,
    qty1 = 10,
    price1 = 100,
    qty2 = 5,
    price2 = 50,
    requester = FINANCE,
  }) {
    const periodId = await fiscalPeriodId(client);
    await client.query(
      `INSERT INTO public.purchase_requisitions (
         id, legal_entity_id, requisition_number, title_en, title_ar, requester_id,
         control_scope_id, cost_node_id, fiscal_period_id, currency_code,
         estimated_total, requisition_status, submitted_at, approved_at, approved_by
       ) VALUES (
         $1::uuid, $2::uuid, $3, 'Ultra Mega Test Req', 'طلب اختبار',
         $4::uuid, $5::uuid, $6::uuid, $7::uuid, 'SAR',
         0, 'approved', NOW(), NOW(), $8::uuid
       )`,
      [
        reqId,
        ENTITY,
        `UM-REQ-${reqId.slice(0, 8)}`,
        requester,
        REST_SCOPE,
        FOOD_NODE,
        periodId,
        APPROVER,
      ],
    );
    await client.query(
      `INSERT INTO public.purchase_requisition_lines (
         id, requisition_id, line_number, description, quantity, unit_price, cost_node_id, uom
       ) VALUES
         ($1::uuid, $3::uuid, 1, 'Line A', $4, $5, $6::uuid, 'EA'),
         ($2::uuid, $3::uuid, 2, 'Line B', $7, $8, $6::uuid, 'EA')`,
      [line1Id, line2Id, reqId, qty1, price1, FOOD_NODE, qty2, price2],
    );
    await client.query(
      `UPDATE public.purchase_requisitions AS pr
       SET estimated_total = (
         SELECT COALESCE(SUM(prl.line_total), 0) FROM public.purchase_requisition_lines AS prl
         WHERE prl.requisition_id = pr.id
       )
       WHERE pr.id = $1::uuid`,
      [reqId],
    );
    return { periodId };
  }

  async function seedIssuedRfqWithQuote(client, {
    reqId,
    line1Id,
    rfqId,
    rfqLineId,
    quoteId,
    quoteLineId,
    vendorId = VENDOR_A,
    awardedQty = 10,
    unitPrice = 100,
    withSubmittedEvaluation = true,
  }) {
    await client.query(
      `INSERT INTO public.rfqs (
         id, legal_entity_id, requisition_id, rfq_number, title_en, title_ar,
         currency_code, rfq_status, created_by, issued_by, issue_date, response_deadline
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, 'RFQ Test', 'طلب عرض',
         'SAR', 'evaluation', $5::uuid, $5::uuid, CURRENT_DATE, NOW() + INTERVAL '7 days'
       )`,
      [rfqId, ENTITY, reqId, `UM-RFQ-${rfqId.slice(0, 8)}`, COST_CTRL],
    );
    await client.query(
      `INSERT INTO public.rfq_lines (
         id, rfq_id, requisition_line_id, line_number, description, quantity, uom
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'RFQ Line A', $4, 'EA')`,
      [rfqLineId, rfqId, line1Id, awardedQty],
    );
    await client.query(
      `INSERT INTO public.rfq_suppliers (rfq_id, vendor_id, invited_by, invited_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, NOW())
       ON CONFLICT (rfq_id, vendor_id) DO NOTHING`,
      [rfqId, vendorId, COST_CTRL],
    );
    await client.query(
      `INSERT INTO public.supplier_quotations (
         id, legal_entity_id, rfq_id, vendor_id, supplier_quote_reference,
         quotation_status, currency_code, subtotal_ex_vat, vat_amount, total_amount, entered_by
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'accepted_for_evaluation', 'SAR',
         $6, 0, $6, $7::uuid
       )`,
      [
        quoteId,
        ENTITY,
        rfqId,
        vendorId,
        `Q-${quoteId.slice(0, 8)}`,
        awardedQty * unitPrice,
        COST_CTRL,
      ],
    );
    await client.query(
      `INSERT INTO public.supplier_quotation_lines (
         id, quotation_id, rfq_line_id, quoted_quantity, unit_price_ex_vat
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)`,
      [quoteLineId, quoteId, rfqLineId, awardedQty, unitPrice],
    );
    if (withSubmittedEvaluation) {
      await client.query(
        `INSERT INTO public.sourcing_evaluations (
           legal_entity_id, rfq_id, quotation_id, evaluator_id, evaluation_status,
           weighted_score, has_mandatory_failure, recommendation, submitted_at
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'submitted', 90, false, 'award', NOW())`,
        [ENTITY, rfqId, quoteId, FINANCE],
      );
    }
  }

  async function seedApprovedInvoice(client, { invId, poId, gross = 100 }) {
    const periodId = await fiscalPeriodId(client);
    await client.query(
      `INSERT INTO public.purchase_orders (
         id, legal_entity_id, vendor_id, po_number, po_status, currency_code, total_amount, created_by
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, 'issued', 'SAR', $5, $6::uuid
       )
       ON CONFLICT (id) DO NOTHING`,
      [poId, ENTITY, VENDOR_A, `PO-PAY-${poId.slice(0, 8)}`, gross, COST_CTRL],
    );
    await client.query(
      `INSERT INTO public.supplier_invoices (
         id, legal_entity_id, purchase_order_id, vendor_id, invoice_number, invoice_date, gross_amount,
         subtotal_ex_vat, vat_amount, invoice_status, match_status, currency_code,
         fiscal_period_id, created_by, approved_by, approved_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, CURRENT_DATE, $6,
         $6, 0, 'approved', 'matched', 'SAR', $7::uuid, $8::uuid, $9::uuid, NOW()
       )`,
      [invId, ENTITY, poId, VENDOR_A, `PAY-INV-${invId.slice(0, 8)}`, gross, periodId, FINANCE, APPROVER],
    );
  }

  test("UM-01 fixture vendors are active for primary entity", async (client) => {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM public.vendors
       WHERE legal_entity_id = $1 AND status = 'active'
         AND id IN ($2::uuid, $3::uuid, $4::uuid)`,
      [ENTITY, VENDOR_A, VENDOR_B, "dddddddd-dddd-dddd-dddd-ddddddddd103"],
    );
    assert(rows[0].c === 3, `Expected 3 active fixture vendors, found ${rows[0].c}`);
  });

  test("UM-02 default procurement policy exists", async (client) => {
    const { rows } = await client.query(
      `SELECT quantity_tolerance_percent::numeric AS qty_tol,
              minimum_quotes_required
       FROM public.procurement_policies
       WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddd201' AND status = 'active'`,
    );
    assert(rows.length === 1, "Missing active procurement policy fixture");
    assert(Number(rows[0].qty_tol) === 0, "Default qty tolerance should be 0");
    assert(rows[0].minimum_quotes_required === 1, "minimum_quotes_required should be 1");
  });

  test("UM-03 requisition line_total equals quantity × unit_price", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee001";
      const lineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee002";
      await seedApprovedRequisition(client, {
        reqId,
        line1Id: lineId,
        line2Id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeee003",
        qty1: 4,
        price1: 12.5,
      });
      const { rows } = await client.query(
        `SELECT line_total::numeric AS total FROM public.purchase_requisition_lines WHERE id = $1`,
        [lineId],
      );
      assert(Number(rows[0].total) === 50, `Expected line_total 50, got ${rows[0].total}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-04 rpc_requisition_upsert_line recalculates estimated_total", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client);
      await authAs(client, FINANCE);
      const created = await client.query(
        `SELECT public.rpc_requisition_create_draft(
           $1::uuid, $2, 'Upsert Line Test', 'اختبار', $3::uuid, $4::uuid, $5::uuid, $6, NULL
         ) AS r`,
        [ENTITY, `UM-UPSERT-${Date.now()}`, REST_SCOPE, FOOD_NODE, periodId, `idem-upsert-${Date.now()}`],
      );
      assert(created.rows[0].r.ok, `create draft failed: ${JSON.stringify(created.rows[0].r)}`);
      const reqId = created.rows[0].r.entity_id;
      const line = await client.query(
        `SELECT public.rpc_requisition_upsert_line(
           $1::uuid, 1::smallint, 'Widget', 3::numeric, 20::numeric, $2::uuid,
           'EA', NULL, NULL, NULL, NULL, $3, NULL
         ) AS r`,
        [reqId, FOOD_NODE, `idem-line-${Date.now()}`],
      );
      assert(line.rows[0].r.ok, `upsert line failed: ${JSON.stringify(line.rows[0].r)}`);
      const { rows } = await client.query(
        `SELECT estimated_total::numeric AS total FROM public.purchase_requisitions WHERE id = $1`,
        [reqId],
      );
      assert(Number(rows[0].total) === 60, `Expected estimated_total 60, got ${rows[0].total}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-05 evaluation weights must sum to exactly 100", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee011";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee012";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee013";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee014";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee015";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee016";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee017";
      await seedApprovedRequisition(client, { reqId, line1Id: line1, line2Id: line2 });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId,
        withSubmittedEvaluation: false,
      });
      await authAs(client, COST_CTRL);
      const bad = await client.query(
        `SELECT public.rpc_evaluation_submit(
           $1::uuid, $2::uuid,
           '[{"sequence_no":1,"score":5}]'::jsonb,
           '[{"sequence_no":1,"category":"price","name_en":"Price","name_ar":"السعر","weight_percent":60,"scoring_scale_max":5}]'::jsonb,
           'recommend', 'bad weights', $3, NULL
         ) AS r`,
        [rfqId, quoteId, `idem-eval-bad-${Date.now()}`],
      );
      assert(!bad.rows[0].r.ok, "Evaluation with weights ≠ 100 should fail");
      assert(
        String(bad.rows[0].r.code ?? bad.rows[0].r.error_code ?? "").includes("VALIDATION")
          || String(bad.rows[0].r.message ?? "").toLowerCase().includes("100"),
        `Unexpected failure payload: ${JSON.stringify(bad.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-06 evaluation with weights 100 succeeds and stores weighted score", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee021";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee022";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee023";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee024";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee025";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee026";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee027";
      await seedApprovedRequisition(client, { reqId, line1Id: line1, line2Id: line2 });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId,
        withSubmittedEvaluation: false,
      });
      await authAs(client, COST_CTRL);
      const ok = await client.query(
        `SELECT public.rpc_evaluation_submit(
           $1::uuid, $2::uuid,
           '[{"sequence_no":1,"score":5},{"sequence_no":2,"score":4}]'::jsonb,
           '[
             {"sequence_no":1,"category":"price","name_en":"Price","name_ar":"السعر","weight_percent":60,"scoring_scale_max":5},
             {"sequence_no":2,"category":"quality","name_en":"Quality","name_ar":"الجودة","weight_percent":40,"scoring_scale_max":5}
           ]'::jsonb,
           'award', 'ok weights', $3, NULL
         ) AS r`,
        [rfqId, quoteId, `idem-eval-ok-${Date.now()}`],
      );
      assert(ok.rows[0].r.ok, `evaluation submit failed: ${JSON.stringify(ok.rows[0].r)}`);
      // (5/5)*60 + (4/5)*40 = 60 + 32 = 92
      const { rows } = await client.query(
        `SELECT weighted_score::numeric AS score FROM public.sourcing_evaluations
         WHERE rfq_id = $1::uuid AND quotation_id = $2::uuid`,
        [rfqId, quoteId],
      );
      assert(Number(rows[0].score) === 92, `Expected weighted score 92, got ${rows[0].score}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-07 inactive vendor cannot be awarded", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee031";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee032";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee033";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee034";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee035";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee036";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee037";
      await seedApprovedRequisition(client, { reqId, line1Id: line1, line2Id: line2 });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId, vendorId: VENDOR_B,
      });
      await client.query(`UPDATE public.vendors SET status = 'inactive' WHERE id = $1::uuid`, [VENDOR_B]);
      await authAs(client, COST_CTRL);
      const award = await client.query(
        `SELECT public.rpc_award_create_and_submit(
           $1::uuid, $2::uuid,
           jsonb_build_array(jsonb_build_object(
             'rfq_line_id', $3::uuid,
             'awarded_quantity', 10,
             'unit_price_ex_vat', 100,
             'quotation_line_id', $4::uuid
           )),
           'inactive vendor', NULL, $5, NULL
         ) AS r`,
        [rfqId, quoteId, rfqLineId, quoteLineId, `idem-award-inactive-${Date.now()}`],
      );
      assert(!award.rows[0].r.ok, "Inactive vendor award should fail");
      assert(
        String(award.rows[0].r.code ?? award.rows[0].r.error_code ?? "").includes("VENDOR_INACTIVE")
          || String(award.rows[0].r.message ?? "").toLowerCase().includes("inactive"),
        `Unexpected award failure: ${JSON.stringify(award.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-08 award quantity ceiling blocks over-award", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee041";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee042";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee043";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee044";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee045";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee046";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee047";
      await seedApprovedRequisition(client, {
        reqId, line1Id: line1, line2Id: line2, qty1: 10, price1: 100,
      });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId, awardedQty: 10,
      });
      await authAs(client, COST_CTRL);
      const award = await client.query(
        `SELECT public.rpc_award_create_and_submit(
           $1::uuid, $2::uuid,
           jsonb_build_array(jsonb_build_object(
             'rfq_line_id', $3::uuid,
             'awarded_quantity', 11,
             'unit_price_ex_vat', 100,
             'quotation_line_id', $4::uuid
           )),
           'over qty', NULL, $5, NULL
         ) AS r`,
        [rfqId, quoteId, rfqLineId, quoteLineId, `idem-award-qty-${Date.now()}`],
      );
      assert(!award.rows[0].r.ok, "Over-quantity award should fail");
      assert(
        String(award.rows[0].r.code ?? award.rows[0].r.error_code ?? "").includes("QTY_EXCEEDED")
          || String(award.rows[0].r.message ?? "").toLowerCase().includes("exceed"),
        `Unexpected qty failure: ${JSON.stringify(award.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-09 award SOD: submitter cannot approve own award", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee051";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee052";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee053";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee054";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee055";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee056";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee057";
      await seedApprovedRequisition(client, {
        reqId, line1Id: line1, line2Id: line2, requester: FINANCE,
      });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId,
      });
      // Legal-entity admin can both create and approve — SOD must still block self-approve.
      await authAs(client, GROUP_ADMIN);
      const award = await client.query(
        `SELECT public.rpc_award_create_and_submit(
           $1::uuid, $2::uuid,
           jsonb_build_array(jsonb_build_object(
             'rfq_line_id', $3::uuid,
             'awarded_quantity', 10,
             'unit_price_ex_vat', 100,
             'quotation_line_id', $4::uuid
           )),
           'sod', NULL, $5, NULL
         ) AS r`,
        [rfqId, quoteId, rfqLineId, quoteLineId, `idem-award-sod-${Date.now()}`],
      );
      assert(award.rows[0].r.ok, `award submit failed: ${JSON.stringify(award.rows[0].r)}`);
      const awardId = award.rows[0].r.entity_id;
      const selfApprove = await client.query(
        `SELECT public.rpc_award_approve($1::uuid, 'submitted', $2, NULL) AS r`,
        [awardId, `idem-award-self-${Date.now()}`],
      );
      assert(!selfApprove.rows[0].r.ok, "Submitter self-approve should fail");
      assert(
        String(selfApprove.rows[0].r.code ?? selfApprove.rows[0].r.error_code ?? "").includes("SOD")
          || String(selfApprove.rows[0].r.message ?? "").toLowerCase().includes("submitter"),
        `Unexpected SOD payload: ${JSON.stringify(selfApprove.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-10 PO create from approved award", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee061";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee062";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee063";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee064";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee065";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee066";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee067";
      const { periodId } = await seedApprovedRequisition(client, {
        reqId, line1Id: line1, line2Id: line2,
      });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId,
      });
      await authAs(client, COST_CTRL);
      const award = await client.query(
        `SELECT public.rpc_award_create_and_submit(
           $1::uuid, $2::uuid,
           jsonb_build_array(jsonb_build_object(
             'rfq_line_id', $3::uuid,
             'awarded_quantity', 10,
             'unit_price_ex_vat', 100,
             'quotation_line_id', $4::uuid
           )),
           'po path', NULL, $5, NULL
         ) AS r`,
        [rfqId, quoteId, rfqLineId, quoteLineId, `idem-award-po-${Date.now()}`],
      );
      assert(award.rows[0].r.ok, `award failed: ${JSON.stringify(award.rows[0].r)}`);
      await authAs(client, APPROVER);
      const approved = await client.query(
        `SELECT public.rpc_award_approve($1::uuid, 'submitted', $2, NULL) AS r`,
        [award.rows[0].r.entity_id, `idem-award-appr-${Date.now()}`],
      );
      assert(approved.rows[0].r.ok, `award approve failed: ${JSON.stringify(approved.rows[0].r)}`);
      await authAs(client, COST_CTRL);
      const po = await client.query(
        `SELECT public.rpc_po_create_from_award($1::uuid, $2::uuid, 'from award', $3, NULL) AS r`,
        [award.rows[0].r.entity_id, periodId, `idem-po-${Date.now()}`],
      );
      assert(po.rows[0].r.ok, `PO from award failed: ${JSON.stringify(po.rows[0].r)}`);
      assert(po.rows[0].r.entity_id, "PO entity_id missing");
      const duplicate = await client.query(
        `SELECT public.rpc_po_create_from_award($1::uuid, $2::uuid, 'duplicate', $3, NULL) AS r`,
        [award.rows[0].r.entity_id, periodId, `idem-po-duplicate-${Date.now()}`],
      );
      assert(!duplicate.rows[0].r.ok, "A second live PO for the same award must fail");
      const count = await client.query(
        `SELECT count(*)::int AS c FROM public.purchase_orders
         WHERE award_id = $1::uuid AND po_status <> 'cancelled'`,
        [award.rows[0].r.entity_id],
      );
      assert(count.rows[0].c === 1, `Expected one live PO, found ${count.rows[0].c}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-11 goods receipt over-qty is blocked at accept", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee071";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee072";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee073";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee074";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee075";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee076";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee077";
      const { periodId } = await seedApprovedRequisition(client, {
        reqId, line1Id: line1, line2Id: line2, qty1: 10,
      });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId, awardedQty: 10,
      });
      await authAs(client, COST_CTRL);
      const award = await client.query(
        `SELECT public.rpc_award_create_and_submit(
           $1::uuid, $2::uuid,
           jsonb_build_array(jsonb_build_object(
             'rfq_line_id', $3::uuid, 'awarded_quantity', 10, 'unit_price_ex_vat', 100,
             'quotation_line_id', $4::uuid
           )), 'gr', NULL, $5, NULL) AS r`,
        [rfqId, quoteId, rfqLineId, quoteLineId, `idem-gr-award-${Date.now()}`],
      );
      await authAs(client, APPROVER);
      await client.query(
        `SELECT public.rpc_award_approve($1::uuid, 'submitted', $2, NULL) AS r`,
        [award.rows[0].r.entity_id, `idem-gr-appr-${Date.now()}`],
      );
      await authAs(client, COST_CTRL);
      const po = await client.query(
        `SELECT public.rpc_po_create_from_award($1::uuid, $2::uuid, NULL, $3, NULL) AS r`,
        [award.rows[0].r.entity_id, periodId, `idem-gr-po-${Date.now()}`],
      );
      const poId = po.rows[0].r.entity_id;
      await client.query(`SELECT public.rpc_po_submit($1::uuid, 'draft', $2, NULL)`, [poId, `idem-po-sub-${Date.now()}`]);
      await authAs(client, APPROVER);
      await client.query(`SELECT public.rpc_po_approve($1::uuid, 'submitted', $2, NULL)`, [poId, `idem-po-appr-${Date.now()}`]);
      await authAs(client, COST_CTRL);
      await client.query(`SELECT public.rpc_po_issue($1::uuid, 'approved', $2, NULL)`, [poId, `idem-po-iss-${Date.now()}`]);
      const { rows: poLines } = await client.query(
        `SELECT id FROM public.purchase_order_lines WHERE purchase_order_id = $1 LIMIT 1`,
        [poId],
      );
      const receipt = await client.query(
        `SELECT public.rpc_goods_receipt_create(
           $1::uuid, $2, CURRENT_DATE, NULL,
           jsonb_build_array(jsonb_build_object(
             'purchase_order_line_id', $3::uuid,
             'quantity_received', 15,
             'quantity_accepted', 15,
             'quantity_rejected', 0
           )),
           $4::uuid, $5, NULL
         ) AS r`,
        [poId, `GR-${Date.now()}`, poLines[0].id, periodId, `idem-gr-create-${Date.now()}`],
      );
      assert(receipt.rows[0].r.ok, `receipt create failed: ${JSON.stringify(receipt.rows[0].r)}`);
      const accept = await client.query(
        `SELECT public.rpc_goods_receipt_accept($1::uuid, 'draft', $2, NULL) AS r`,
        [receipt.rows[0].r.entity_id, `idem-gr-accept-${Date.now()}`],
      );
      assert(!accept.rows[0].r.ok, "Over-qty receipt accept should fail");
      assert(
        String(accept.rows[0].r.code ?? accept.rows[0].r.error_code ?? "").includes("TOLERANCE")
          || String(accept.rows[0].r.message ?? "").toLowerCase().includes("toler"),
        `Unexpected over-qty payload: ${JSON.stringify(accept.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-12 invoice match writes exception when amount exceeds tolerance", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee081";
      const line1 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee082";
      const line2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee083";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee084";
      const rfqLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee085";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee086";
      const quoteLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee087";
      const { periodId } = await seedApprovedRequisition(client, {
        reqId, line1Id: line1, line2Id: line2, qty1: 10, price1: 100,
      });
      await seedIssuedRfqWithQuote(client, {
        reqId, line1Id: line1, rfqId, rfqLineId, quoteId, quoteLineId,
      });
      await authAs(client, COST_CTRL);
      const award = await client.query(
        `SELECT public.rpc_award_create_and_submit(
           $1::uuid, $2::uuid,
           jsonb_build_array(jsonb_build_object(
             'rfq_line_id', $3::uuid, 'awarded_quantity', 10, 'unit_price_ex_vat', 100,
             'quotation_line_id', $4::uuid
           )), 'inv', NULL, $5, NULL) AS r`,
        [rfqId, quoteId, rfqLineId, quoteLineId, `idem-inv-award-${Date.now()}`],
      );
      await authAs(client, APPROVER);
      await client.query(
        `SELECT public.rpc_award_approve($1::uuid, 'submitted', $2, NULL)`,
        [award.rows[0].r.entity_id, `idem-inv-appr-${Date.now()}`],
      );
      await authAs(client, COST_CTRL);
      const po = await client.query(
        `SELECT public.rpc_po_create_from_award($1::uuid, $2::uuid, NULL, $3, NULL) AS r`,
        [award.rows[0].r.entity_id, periodId, `idem-inv-po-${Date.now()}`],
      );
      const poId = po.rows[0].r.entity_id;
      await client.query(`SELECT public.rpc_po_submit($1::uuid, 'draft', $2, NULL)`, [poId, `i-ps-${Date.now()}`]);
      await authAs(client, APPROVER);
      await client.query(`SELECT public.rpc_po_approve($1::uuid, 'submitted', $2, NULL)`, [poId, `i-pa-${Date.now()}`]);
      await authAs(client, COST_CTRL);
      await client.query(`SELECT public.rpc_po_issue($1::uuid, 'approved', $2, NULL)`, [poId, `i-pi-${Date.now()}`]);
      const { rows: poLines } = await client.query(
        `SELECT id FROM public.purchase_order_lines WHERE purchase_order_id=$1::uuid ORDER BY line_number LIMIT 1`,
        [poId],
      );
      // Missing fulfillment evidence and a far-over-PO invoice must produce blocking exceptions.
      await authAs(client, FINANCE);
      const inv = await client.query(
        `SELECT public.rpc_supplier_invoice_create(
           $1::uuid, $2::uuid, $3::uuid, $4, CURRENT_DATE, 9999::numeric,
           9999::numeric, 0::numeric, CURRENT_DATE + 30,
           jsonb_build_array(jsonb_build_object(
             'purchase_order_line_id',$5::uuid,'line_number',1,'description','Over invoice',
             'quantity',99.99,'unit_price_ex_vat',100,'vat_amount',0
           )), $6::uuid, $7, NULL
         ) AS r`,
        [ENTITY, poId, VENDOR_A, `INV-${Date.now()}`, poLines[0].id, periodId, `idem-inv-create-${Date.now()}`],
      );
      assert(inv.rows[0].r.ok, `invoice create failed: ${JSON.stringify(inv.rows[0].r)}`);
      const match = await client.query(
        `SELECT public.rpc_supplier_invoice_match($1::uuid, $2, NULL) AS r`,
        [inv.rows[0].r.entity_id, `idem-inv-match-${Date.now()}`],
      );
      assert(match.rows[0].r.ok, `match rpc failed: ${JSON.stringify(match.rows[0].r)}`);
      const { rows: exceptions } = await client.query(
        `SELECT count(*)::int AS c FROM public.invoice_match_exceptions
         WHERE supplier_invoice_id = $1::uuid AND is_resolved = false`,
        [inv.rows[0].r.entity_id],
      );
      assert(exceptions[0].c >= 1, "Expected at least one open match exception");
      const { rows: invRow } = await client.query(
        `SELECT match_status FROM public.supplier_invoices WHERE id = $1`,
        [inv.rows[0].r.entity_id],
      );
      assert(invRow[0].match_status === "exception", `Expected exception match_status, got ${invRow[0].match_status}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-13 payment request SOD: requester cannot approve", async (client) => {
    await client.query("BEGIN");
    try {
      const invId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee091";
      const poId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee090";
      await seedApprovedInvoice(client, { invId, poId, gross: 500 });
      await authAs(client, FINANCE);
      const pr = await client.query(
        `SELECT public.rpc_payment_request_create(
           $1::uuid, $2::uuid, 200::numeric, CURRENT_DATE + 7, 'partial', $3, NULL
         ) AS r`,
        [ENTITY, invId, `idem-pay-create-${Date.now()}`],
      );
      assert(pr.rows[0].r.ok, `payment create failed: ${JSON.stringify(pr.rows[0].r)}`);
      await client.query(
        `SELECT public.rpc_payment_request_submit($1::uuid, 'draft', $2, NULL)`,
        [pr.rows[0].r.entity_id, `idem-pay-sub-${Date.now()}`],
      );
      const self = await client.query(
        `SELECT public.rpc_payment_request_approve($1::uuid, 'submitted', $2, NULL) AS r`,
        [pr.rows[0].r.entity_id, `idem-pay-self-${Date.now()}`],
      );
      assert(!self.rows[0].r.ok, "Payment requester self-approve should fail");
      assert(
        String(self.rows[0].r.code ?? self.rows[0].r.error_code ?? "").includes("SOD")
          || String(self.rows[0].r.message ?? "").toLowerCase().includes("requester"),
        `Unexpected payment SOD: ${JSON.stringify(self.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-14 payment request balance cannot exceed unpaid invoice", async (client) => {
    await client.query("BEGIN");
    try {
      const invId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee092";
      const poId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee093";
      await seedApprovedInvoice(client, { invId, poId, gross: 100 });
      await authAs(client, FINANCE);
      const over = await client.query(
        `SELECT public.rpc_payment_request_create(
           $1::uuid, $2::uuid, 150::numeric, CURRENT_DATE + 7, 'over', $3, NULL
         ) AS r`,
        [ENTITY, invId, `idem-pay-over-${Date.now()}`],
      );
      assert(!over.rows[0].r.ok, "Over-balance payment create should fail");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-15 active delegation resolves assigned approver to cost controller", async (client) => {
    await asRole(client, "authenticated", COST_CTRL, async () => {
      const { rows } = await client.query(
        `SELECT effective_assignee_id, delegation_id
         FROM private.resolve_effective_approver($1::uuid, $2::uuid, 'purchase_requisition')`,
        [APPROVER, ENTITY],
      );
      assert(rows[0].effective_assignee_id === COST_CTRL, "Delegation did not resolve to cost controller");
      assert(rows[0].delegation_id === DELEGATION, "Unexpected delegation id");
    });
  });

  test("UM-16 revoked delegation restores original assignee", async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE public.approval_delegations
         SET delegation_status = 'revoked', revoked_at = NOW(), revoked_by = $1::uuid
         WHERE id = $2::uuid`,
        [APPROVER, DELEGATION],
      );
      await authAs(client, COST_CTRL);
      const { rows } = await client.query(
        `SELECT effective_assignee_id, delegation_id
         FROM private.resolve_effective_approver($1::uuid, $2::uuid, 'purchase_requisition')`,
        [APPROVER, ENTITY],
      );
      assert(rows[0].effective_assignee_id === APPROVER, "Revoked delegation should restore assigned approver");
      assert(rows[0].delegation_id == null, "Revoked delegation_id should be null");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-17 master record hierarchy cycle is blocked", async (client) => {
    await client.query("BEGIN");
    try {
      const parent = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee101";
      const child = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee102";
      await client.query(
        `INSERT INTO public.governed_master_records (
           id, legal_entity_id, record_type, code, name_en, name_ar, created_by, governance_status
         ) VALUES
           ($1::uuid, $3::uuid, 'cost_category', 'UM-PARENT', 'Parent', 'أب', $4::uuid, 'approved'),
           ($2::uuid, $3::uuid, 'cost_category', 'UM-CHILD', 'Child', 'ابن', $4::uuid, 'approved')`,
        [parent, child, ENTITY, FINANCE],
      );
      await client.query(
        `UPDATE public.governed_master_records SET parent_id = $1::uuid WHERE id = $2::uuid`,
        [parent, child],
      );
      let failed = false;
      try {
        await client.query(
          `UPDATE public.governed_master_records SET parent_id = $1::uuid WHERE id = $2::uuid`,
          [child, parent],
        );
      } catch {
        failed = true;
      }
      assert(failed, "Master hierarchy cycle should be rejected");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-18 hard close blocked by incomplete blocking checklist", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 3);
      await client.query(
        `INSERT INTO public.fiscal_period_module_controls (
           fiscal_period_id, legal_entity_id, module, control_state
         ) VALUES ($1::uuid, $2::uuid, 'actuals', 'soft_close')
         ON CONFLICT (fiscal_period_id, legal_entity_id, module)
         DO UPDATE SET control_state = 'soft_close'`,
        [periodId, ENTITY],
      );
      await client.query(
        `UPDATE public.period_close_item_results
         SET item_status = 'pending'
         WHERE checklist_item_id = 'dddddddd-dddd-dddd-dddd-ddddddddd502'`,
      );
      await authAs(client, FINANCE);
      const result = await client.query(
        `SELECT public.rpc_period_hard_close_with_checklist(
           $1::uuid, $2::uuid, 'actuals', 'soft_close', $3, NULL
         ) AS r`,
        [periodId, ENTITY, `idem-hard-close-${Date.now()}`],
      );
      assert(!result.rows[0].r.ok, "Hard close should be blocked by checklist/readiness");
      const code = String(result.rows[0].r.code ?? result.rows[0].r.error_code ?? "");
      assert(
        code.includes("CHECKLIST") || code.includes("READINESS"),
        `Expected CHECKLIST/READINESS, got ${JSON.stringify(result.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-19 period reopen SOD: requester cannot approve", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 4);
      await client.query(
        `INSERT INTO public.fiscal_period_module_controls (
           fiscal_period_id, legal_entity_id, module, control_state
         ) VALUES ($1::uuid, $2::uuid, 'budgets', 'hard_close')
         ON CONFLICT (fiscal_period_id, legal_entity_id, module)
         DO UPDATE SET control_state = 'hard_close'`,
        [periodId, ENTITY],
      );
      await authAs(client, FINANCE);
      const req = await client.query(
        `SELECT public.rpc_period_reopen_request(
           $1::uuid, $2::uuid, 'budgets', 'Need reopen for correction', NULL, $3, NULL
         ) AS r`,
        [periodId, ENTITY, `idem-reopen-req-${Date.now()}`],
      );
      assert(req.rows[0].r.ok, `reopen request failed: ${JSON.stringify(req.rows[0].r)}`);
      const self = await client.query(
        `SELECT public.rpc_period_reopen_approve(
           $1::uuid, 'Approve own request', 'submitted', $2, NULL
         ) AS r`,
        [req.rows[0].r.entity_id, `idem-reopen-self-${Date.now()}`],
      );
      assert(!self.rows[0].r.ok, "Reopen requester cannot approve");
      assert(
        String(self.rows[0].r.code ?? self.rows[0].r.error_code ?? "").includes("SOD")
          || String(self.rows[0].r.message ?? "").toLowerCase().includes("requester")
          || String(self.rows[0].r.message ?? "").toLowerCase().includes("forbidden"),
        `Unexpected reopen SOD: ${JSON.stringify(self.rows[0].r)}`,
      );
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-20 appraisal score exact: (5/5)*60 + (4/5)*40 = 92", async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO public.appraisal_ratings (
           assignment_id, criterion_id, manager_rating
         ) VALUES
           ($1::uuid, $2::uuid, 5),
           ($1::uuid, $3::uuid, 4)
         ON CONFLICT (assignment_id, criterion_id) DO UPDATE
           SET manager_rating = EXCLUDED.manager_rating, calibrated_rating = NULL`,
        [APPRAISAL_ASSIGNMENT, CRITERION_DELIVERY, CRITERION_COLLAB],
      );
      const { rows } = await client.query(
        `SELECT private.appraisal_compute_score($1::uuid)::numeric AS score`,
        [APPRAISAL_ASSIGNMENT],
      );
      assert(Number(rows[0].score) === 92, `Expected appraisal score 92, got ${rows[0].score}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-21 appraisal privacy: viewer cannot read assignment or ratings", async (client) => {
    await asRole(client, "authenticated", VIEWER, async () => {
      const { rows: assignments } = await client.query(
        `SELECT count(*)::int AS c FROM public.appraisal_assignments WHERE id = $1::uuid`,
        [APPRAISAL_ASSIGNMENT],
      );
      assert(assignments[0].c === 0, "Viewer must not see appraisal assignment");
      const { rows: ratings } = await client.query(
        `SELECT count(*)::int AS c FROM public.appraisal_ratings WHERE assignment_id = $1::uuid`,
        [APPRAISAL_ASSIGNMENT],
      );
      assert(ratings[0].c === 0, "Viewer must not see appraisal ratings");
    });
  });

  test("UM-22 appraisal privacy: employee can read own assignment", async (client) => {
    await asRole(client, "authenticated", EMPLOYEE, async () => {
      const { rows } = await client.query(
        `SELECT count(*)::int AS c FROM public.appraisal_assignments WHERE id = $1::uuid`,
        [APPRAISAL_ASSIGNMENT],
      );
      assert(rows[0].c === 1, "Employee should read own appraisal assignment");
    });
  });

  test("UM-23 appraisal template fixture weights sum to 100", async (client) => {
    const { rows } = await client.query(
      `SELECT SUM(weight)::numeric AS total
       FROM public.appraisal_template_criteria
       WHERE template_id = 'dddddddd-dddd-dddd-dddd-ddddddddd402'`,
    );
    assert(Number(rows[0].total) === 100, `Expected template weights 100, got ${rows[0].total}`);
  });

  test("UM-24 manager can read team appraisal assignment", async (client) => {
    await asRole(client, "authenticated", MANAGER, async () => {
      const { rows } = await client.query(
        `SELECT employee_id FROM public.appraisal_assignments WHERE id = $1::uuid`,
        [APPRAISAL_ASSIGNMENT],
      );
      assert(rows.length === 1 && rows[0].employee_id === EMPLOYEE, "Manager should see team assignment");
    });
  });

  test("UM-25 REST-POS allocation orphans remain six with zero allocations", async (client) => {
    const { rows } = await client.query(`
      SELECT
        count(*)::int AS orphan_count,
        count(ata.id)::int AS allocation_count
      FROM public.actual_transactions AS atx
      LEFT JOIN public.actual_transaction_allocations AS ata
        ON ata.actual_transaction_id = atx.id
      WHERE atx.source_system = 'REST-POS'
        AND atx.source_transaction_id IN (
          'REST-B1-FOOD-001', 'REST-B1-LAB-001', 'REST-B1-REV-001',
          'REST-B2-FOOD-001', 'REST-B2-LAB-001', 'REST-B2-REV-001'
        )
    `);
    assert(rows[0].orphan_count === 6, `Expected six REST-POS orphans, found ${rows[0].orphan_count}`);
    assert(rows[0].allocation_count === 0, "REST-POS orphan allocations were recreated");
  });

  test("UM-26 cost controller persona role is active", async (client) => {
    await asRole(client, "authenticated", COST_CTRL, async () => {
      const { rows } = await client.query(
        `SELECT private.user_has_role('cost_controller', $1::uuid) AS allowed`,
        [ENTITY],
      );
      assert(rows[0].allowed, "cost.controller persona missing cost_controller role");
    });
  });

  test("UM-27 period checklist template fixture has blocking item", async (client) => {
    const { rows } = await client.query(
      `SELECT ci.is_blocking, cir.item_status
       FROM public.period_close_checklist_items AS ci
       JOIN public.period_close_item_results AS cir ON cir.checklist_item_id = ci.id
       WHERE ci.id = 'dddddddd-dddd-dddd-dddd-ddddddddd502'`,
    );
    assert(rows.length >= 1, "Missing checklist item result fixture");
    assert(rows[0].is_blocking === true, "Checklist item must be blocking");
  });

  test("UM-28 group admin can reopen-approve after finance requests (SOD ok)", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 5);
      await client.query(
        `INSERT INTO public.fiscal_period_module_controls (
           fiscal_period_id, legal_entity_id, module, control_state
         ) VALUES ($1::uuid, $2::uuid, 'reporting', 'hard_close')
         ON CONFLICT (fiscal_period_id, legal_entity_id, module)
         DO UPDATE SET control_state = 'hard_close'`,
        [periodId, ENTITY],
      );
      await authAs(client, FINANCE);
      const req = await client.query(
        `SELECT public.rpc_period_reopen_request(
           $1::uuid, $2::uuid, 'reporting', 'Admin reopen path', NULL, $3, NULL
         ) AS r`,
        [periodId, ENTITY, `idem-reopen-ok-${Date.now()}`],
      );
      assert(req.rows[0].r.ok, `reopen request failed: ${JSON.stringify(req.rows[0].r)}`);
      await authAs(client, GROUP_ADMIN);
      const approved = await client.query(
        `SELECT public.rpc_period_reopen_approve(
           $1::uuid, 'Approved by admin', 'submitted', $2, NULL
         ) AS r`,
        [req.rows[0].r.entity_id, `idem-reopen-admin-${Date.now()}`],
      );
      assert(approved.rows[0].r.ok, `admin reopen approve failed: ${JSON.stringify(approved.rows[0].r)}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-29 lifecycle tables are read-only to ordinary authenticated SQL", async (client) => {
    const sensitiveTables = [
      "purchase_requisitions", "purchase_requisition_lines", "rfqs", "rfq_lines",
      "supplier_quotations", "sourcing_evaluations", "sourcing_awards",
      "purchase_orders", "purchase_order_lines", "procurement_contracts",
      "goods_receipts", "service_entries", "supplier_invoices", "payment_requests",
      "approval_delegations", "fiscal_period_module_controls", "period_close_instances",
      "period_close_item_results", "period_reopen_requests", "appraisal_cycles",
      "appraisal_assignments", "appraisal_ratings", "appraisal_goals",
      "appraisal_acknowledgements", "governed_master_records",
    ];
    for (const table of sensitiveTables) {
      const { rows } = await client.query(
        `SELECT
           has_table_privilege('authenticated', format('public.%I', $1::text), 'SELECT') AS can_select,
           has_table_privilege('authenticated', format('public.%I', $1::text), 'INSERT') AS can_insert,
           has_table_privilege('authenticated', format('public.%I', $1::text), 'UPDATE') AS can_update,
           has_table_privilege('authenticated', format('public.%I', $1::text), 'DELETE') AS can_delete`,
        [table],
      );
      assert(rows[0].can_select, `${table} lost required SELECT`);
      assert(!rows[0].can_insert, `${table} retained direct INSERT`);
      assert(!rows[0].can_update, `${table} retained direct UPDATE`);
      assert(!rows[0].can_delete, `${table} retained direct DELETE`);
    }
  });

  test("UM-30 contract follows draft → submitted → approved → active → closed", async (client) => {
    await client.query("BEGIN");
    try {
      await authAs(client, COST_CTRL);
      const created = await client.query(
        `SELECT public.rpc_contract_create(
           $1::uuid, $2::uuid, $3, 'Lifecycle Contract', 'عقد دورة حياة',
           CURRENT_DATE, CURRENT_DATE + 30, 1000, NULL, 'SAR', NULL, $4, NULL
         ) AS r`,
        [ENTITY, VENDOR_A, `UM-CTR-${Date.now()}`, `idem-contract-create-${Date.now()}`],
      );
      assert(created.rows[0].r.ok, `Contract create failed: ${JSON.stringify(created.rows[0].r)}`);
      const contractId = created.rows[0].r.entity_id;

      const submitted = await client.query(
        `SELECT public.rpc_contract_submit($1::uuid, 'draft', $2, NULL) AS r`,
        [contractId, `idem-contract-submit-${Date.now()}`],
      );
      assert(submitted.rows[0].r.contract_status === "submitted", "Contract did not submit");

      const secondSubmit = await client.query(
        `SELECT public.rpc_contract_submit($1::uuid, 'draft', $2, NULL) AS r`,
        [contractId, `idem-contract-submit-again-${Date.now()}`],
      );
      assert(!secondSubmit.rows[0].r.ok, "Conflicting second contract transition must fail");

      await authAs(client, APPROVER);
      const approved = await client.query(
        `SELECT public.rpc_contract_approve($1::uuid, 'submitted', $2, NULL) AS r`,
        [contractId, `idem-contract-approve-${Date.now()}`],
      );
      assert(approved.rows[0].r.contract_status === "approved", "Contract did not approve");

      await authAs(client, GROUP_ADMIN);
      const activated = await client.query(
        `SELECT public.rpc_contract_activate($1::uuid, 'approved', $2, NULL) AS r`,
        [contractId, `idem-contract-activate-${Date.now()}`],
      );
      assert(activated.rows[0].r.contract_status === "active", "Contract did not activate");
      const closed = await client.query(
        `SELECT public.rpc_contract_close($1::uuid, 'active', $2, NULL) AS r`,
        [contractId, `idem-contract-close-${Date.now()}`],
      );
      assert(closed.rows[0].r.contract_status === "closed", "Contract did not close");

      const state = await client.query(
        `SELECT contract_status, created_by, submitted_by, approved_by
         FROM public.procurement_contracts WHERE id = $1::uuid`,
        [contractId],
      );
      assert(state.rows[0].contract_status === "closed", "Stored contract state is not closed");
      assert(state.rows[0].created_by === COST_CTRL, "Contract creator audit actor is wrong");
      assert(state.rows[0].submitted_by === COST_CTRL, "Contract submit actor is wrong");
      assert(state.rows[0].approved_by === APPROVER, "Contract approver actor is wrong");

      await client.query("SET LOCAL role postgres");
      const audits = await client.query(
        `SELECT count(*)::int AS c FROM public.audit_events
         WHERE entity_type = 'procurement_contract' AND entity_id = $1::uuid`,
        [contractId],
      );
      assert(audits.rows[0].c === 5, `Expected five contract audit events, found ${audits.rows[0].c}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-31 delegated decision fails closed without item or audit mutation", async (client) => {
    await client.query("BEGIN");
    try {
      const fakeEntity = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee901";
      const before = await client.query(
        `SELECT count(*)::int AS c FROM public.approval_decision_audit
         WHERE item_type = 'purchase_requisition' AND entity_id = $1::uuid`,
        [fakeEntity],
      );
      await authAs(client, COST_CTRL);
      const decision = await client.query(
        `SELECT public.rpc_approval_act_as_delegate(
           'purchase_requisition', $1::uuid, 'approved', $2::uuid, $3::uuid,
           'must not record', $4, NULL
         ) AS r`,
        [fakeEntity, FINANCE, DELEGATION, `idem-delegate-disabled-${Date.now()}`],
      );
      assert(!decision.rows[0].r.ok, "Disabled delegated decision unexpectedly succeeded");
      const after = await client.query(
        `SELECT count(*)::int AS c FROM public.approval_decision_audit
         WHERE item_type = 'purchase_requisition' AND entity_id = $1::uuid`,
        [fakeEntity],
      );
      assert(after.rows[0].c === before.rows[0].c, "Failed delegated decision wrote decision evidence");
      const inbox = await client.query(
        `SELECT count(*)::int AS c FROM public.v_delegated_approval_inbox`,
      );
      assert(inbox.rows[0].c === 0, "Delegated inbox exposed requester-derived pseudo-assignments");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-32 required checklist absence blocks hard close", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 11);
      await client.query(
        `INSERT INTO public.period_close_checklist_templates (
           id, legal_entity_id, module, code, name_en, name_ar, is_active
         ) VALUES (
           'eeeeeeee-eeee-eeee-eeee-eeeeeeeee911', $1::uuid, 'forecasts',
           'UM-FORECAST-CLOSE', 'Forecast close', 'إغلاق التوقع', true
         )`,
        [ENTITY],
      );
      await client.query(
        `INSERT INTO public.period_close_checklist_items (
           id, template_id, sequence_no, name_en, name_ar, item_type,
           owner_role_code, is_required, is_blocking
         ) VALUES (
           'eeeeeeee-eeee-eeee-eeee-eeeeeeeee912',
           'eeeeeeee-eeee-eeee-eeee-eeeeeeeee911', 1,
           'Forecast evidence', 'دليل التوقع', 'manual', 'finance_user', true, true
         )`,
      );
      await client.query(
        `INSERT INTO public.fiscal_period_module_controls (
           fiscal_period_id, legal_entity_id, module, control_state
         ) VALUES ($1::uuid, $2::uuid, 'forecasts', 'soft_close')
         ON CONFLICT (fiscal_period_id, legal_entity_id, module)
         DO UPDATE SET control_state = 'soft_close'`,
        [periodId, ENTITY],
      );
      await authAs(client, FINANCE);
      const closed = await client.query(
        `SELECT public.rpc_period_hard_close_gated(
           $1::uuid, $2::uuid, 'forecasts', 'soft_close', $3, NULL
         ) AS r`,
        [periodId, ENTITY, `idem-missing-checklist-${Date.now()}`],
      );
      assert(!closed.rows[0].r.ok, "Hard close succeeded without required checklist instance");
      const state = await client.query(
        `SELECT control_state FROM public.fiscal_period_module_controls
         WHERE fiscal_period_id = $1::uuid AND legal_entity_id = $2::uuid AND module = 'forecasts'`,
        [periodId, ENTITY],
      );
      assert(state.rows[0].control_state === "soft_close", "Failed hard close changed period state");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-33 completed audited checklist permits hard close", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 12);
      const templateId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee921";
      const itemId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee922";
      const instanceId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee923";
      const resultId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee924";
      await client.query(
        `INSERT INTO public.period_close_checklist_templates (
           id, legal_entity_id, module, code, name_en, name_ar, is_active, governance_status
         ) VALUES ($1::uuid, $2::uuid, 'forecasts', 'UM-FORECAST-CLOSE-PASS',
           'Forecast close', 'إغلاق التوقع', true, 'approved')`,
        [templateId, ENTITY],
      );
      await client.query(
        `INSERT INTO public.period_close_checklist_items (
           id, template_id, sequence_no, name_en, name_ar, item_type,
           owner_role_code, is_required, is_blocking
         ) VALUES ($1::uuid, $2::uuid, 1, 'Forecast evidence', 'دليل التوقع',
           'manual', 'finance_user', true, true)`,
        [itemId, templateId],
      );
      await client.query(
        `INSERT INTO public.period_close_instances (
           id, legal_entity_id, fiscal_period_id, module, template_id, created_by
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'forecasts', $4::uuid, $5::uuid)`,
        [instanceId, ENTITY, periodId, templateId, FINANCE],
      );
      await client.query(
        `INSERT INTO public.period_close_item_results (
           id, instance_id, checklist_item_id, item_status
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending')`,
        [resultId, instanceId, itemId],
      );
      await client.query(
        `INSERT INTO public.fiscal_period_module_controls (
           fiscal_period_id, legal_entity_id, module, control_state
         ) VALUES ($1::uuid, $2::uuid, 'forecasts', 'soft_close')
         ON CONFLICT (fiscal_period_id, legal_entity_id, module)
         DO UPDATE SET control_state = 'soft_close'`,
        [periodId, ENTITY],
      );

      await authAs(client, FINANCE);
      const completed = await client.query(
        `SELECT public.rpc_period_checklist_set_result(
           $1::uuid, 'passed', 'evidence://um-33', 'reconciled', NULL, $2, NULL
         ) AS r`,
        [resultId, `idem-checklist-pass-${Date.now()}`],
      );
      assert(completed.rows[0].r.ok, `Checklist completion failed: ${JSON.stringify(completed.rows[0].r)}`);
      const closed = await client.query(
        `SELECT public.rpc_period_hard_close_gated(
           $1::uuid, $2::uuid, 'forecasts', 'soft_close', $3, NULL
         ) AS r`,
        [periodId, ENTITY, `idem-checklist-close-${Date.now()}`],
      );
      assert(closed.rows[0].r.ok, `Completed checklist did not close: ${JSON.stringify(closed.rows[0].r)}`);
      const state = await client.query(
        `SELECT control_state FROM public.fiscal_period_module_controls
         WHERE fiscal_period_id = $1::uuid AND legal_entity_id = $2::uuid AND module = 'forecasts'`,
        [periodId, ENTITY],
      );
      assert(state.rows[0].control_state === "hard_close", "Hard close state was not stored");
      await client.query("SET LOCAL role postgres");
      const audits = await client.query(
        `SELECT count(*)::int AS c FROM public.audit_events
         WHERE entity_type = 'period_close_item_result' AND entity_id = $1::uuid
           AND actor_id = $2::uuid`,
        [resultId, FINANCE],
      );
      assert(audits.rows[0].c === 1, "Checklist completion audit actor or count is wrong");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-34 appraisal field ownership rejects direct writes and accepts self RPC", async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO public.appraisal_ratings (assignment_id, criterion_id)
         VALUES ($1::uuid, $2::uuid), ($1::uuid, $3::uuid)
         ON CONFLICT (assignment_id, criterion_id) DO UPDATE SET
           self_rating = NULL, manager_rating = NULL, calibrated_rating = NULL`,
        [APPRAISAL_ASSIGNMENT, CRITERION_DELIVERY, CRITERION_COLLAB],
      );
      await client.query(
        `UPDATE public.appraisal_assignments SET assignment_status = 'employee_self_review',
           final_score = NULL, finalized_at = NULL, finalized_by = NULL
         WHERE id = $1::uuid`,
        [APPRAISAL_ASSIGNMENT],
      );
      await authAs(client, EMPLOYEE);

      await client.query("SAVEPOINT appraisal_direct_write");
      let directFailed = false;
      try {
        await client.query(
          `UPDATE public.appraisal_ratings SET manager_rating = 999
           WHERE assignment_id = $1::uuid`,
          [APPRAISAL_ASSIGNMENT],
        );
      } catch {
        directFailed = true;
        await client.query("ROLLBACK TO SAVEPOINT appraisal_direct_write");
      }
      assert(directFailed, "Employee directly altered manager appraisal fields");
    } finally {
      await client.query("ROLLBACK");
    }

    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO public.appraisal_ratings (assignment_id, criterion_id)
         VALUES ($1::uuid, $2::uuid), ($1::uuid, $3::uuid)
         ON CONFLICT (assignment_id, criterion_id) DO UPDATE SET self_rating = NULL`,
        [APPRAISAL_ASSIGNMENT, CRITERION_DELIVERY, CRITERION_COLLAB],
      );
      await client.query(
        `UPDATE public.appraisal_assignments SET assignment_status = 'employee_self_review'
         WHERE id = $1::uuid`,
        [APPRAISAL_ASSIGNMENT],
      );
      await authAs(client, EMPLOYEE);
      const submitted = await client.query(
        `SELECT public.rpc_appraisal_self_submit(
           $1::uuid,
           jsonb_build_array(
             jsonb_build_object('criterion_id', $2::uuid, 'self_rating', 5, 'self_comment', 'delivery'),
             jsonb_build_object('criterion_id', $3::uuid, 'self_rating', 4, 'self_comment', 'collaboration')
           ), 'employee_self_review', $4, NULL
         ) AS r`,
        [APPRAISAL_ASSIGNMENT, CRITERION_DELIVERY, CRITERION_COLLAB, `idem-self-exact-${Date.now()}`],
      );
      assert(submitted.rows[0].r.assignment_status === "self_submitted", "Self RPC did not transition assignment");
      const stored = await client.query(
        `SELECT assignment_status, count(*) FILTER (WHERE self_rating IS NOT NULL)::int AS rated
         FROM public.appraisal_assignments AS aa
         JOIN public.appraisal_ratings AS ar ON ar.assignment_id = aa.id
         WHERE aa.id = $1::uuid GROUP BY aa.assignment_status`,
        [APPRAISAL_ASSIGNMENT],
      );
      assert(stored.rows[0].assignment_status === "self_submitted", "Stored self-submit state is wrong");
      assert(stored.rows[0].rated === 2, "Self-submit did not store every rating");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-35 appraisal peer identity RPC is names-only and relationship-scoped", async (client) => {
    await asRole(client, "authenticated", EMPLOYEE, async () => {
      const { rows } = await client.query(
        `SELECT * FROM public.rpc_appraisal_peer_identities($1::uuid)`,
        [ENTITY],
      );
      assert(rows.length >= 2, "Employee could not resolve appraisal relationship names");
      assert(
        Object.keys(rows[0]).sort().join(",") === "full_name_ar,full_name_en,id",
        `Peer RPC exposed unexpected columns: ${Object.keys(rows[0]).join(",")}`,
      );
    });
    await asRole(client, "authenticated", VIEWER, async () => {
      const { rows } = await client.query(
        `SELECT * FROM public.rpc_appraisal_peer_identities($1::uuid)`,
        [ENTITY],
      );
      assert(rows.length === 0, "Unrelated employee saw appraisal peer identities");
    });
  });

  test("UM-36 fiscal period and workflow legal entity cannot be mixed", async (client) => {
    await client.query("BEGIN");
    try {
      const otherEntity = "11111111-1111-1111-1111-111111111103";
      const otherYear = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee941";
      const otherPeriod = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee942";
      await client.query(
        `INSERT INTO public.fiscal_years (
           id, legal_entity_id, year_label, start_date, end_date
         ) VALUES ($1::uuid, $2::uuid, 'UM-OTHER-2028', '2028-01-01', '2028-12-31')`,
        [otherYear, otherEntity],
      );
      await client.query(
        `INSERT INTO public.fiscal_periods (
           id, fiscal_year_id, period_number, start_date, end_date
         ) VALUES ($1::uuid, $2::uuid, 1, '2028-01-01', '2028-01-31')`,
        [otherPeriod, otherYear],
      );
      await client.query("SAVEPOINT period_entity_scope");
      let blocked = false;
      try {
        await client.query(
          `INSERT INTO public.fiscal_period_module_controls (
             fiscal_period_id, legal_entity_id, module, control_state
           ) VALUES ($1::uuid, $2::uuid, 'procurement', 'open')`,
          [otherPeriod, ENTITY],
        );
      } catch {
        blocked = true;
        await client.query("ROLLBACK TO SAVEPOINT period_entity_scope");
      }
      assert(blocked, "Cross-entity fiscal period association was accepted");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-37 failed reopen approval leaves request submitted and period unchanged", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 11);
      const requestId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee951";
      await client.query(
        `INSERT INTO public.fiscal_period_module_controls (
           fiscal_period_id, legal_entity_id, module, control_state
         ) VALUES ($1::uuid, $2::uuid, 'reporting', 'open')
         ON CONFLICT (fiscal_period_id, legal_entity_id, module)
         DO UPDATE SET control_state = 'open'`,
        [periodId, ENTITY],
      );
      await client.query(
        `INSERT INTO public.period_reopen_requests (
           id, legal_entity_id, fiscal_period_id, module, requested_by,
           status, reason, requested_at
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'reporting', $4::uuid,
           'submitted', 'Atomic failure test', NOW())`,
        [requestId, ENTITY, periodId, FINANCE],
      );
      await authAs(client, GROUP_ADMIN);
      const result = await client.query(
        `SELECT public.rpc_period_reopen_approve(
           $1::uuid, 'Should remain submitted', 'submitted', $2, NULL
         ) AS r`,
        [requestId, `idem-reopen-atomic-${Date.now()}`],
      );
      assert(!result.rows[0].r.ok, "Reopen approval unexpectedly succeeded from an open period");
      await client.query("SET LOCAL role postgres");
      const state = await client.query(
        `SELECT prr.status, fpmc.control_state
         FROM public.period_reopen_requests AS prr
         JOIN public.fiscal_period_module_controls AS fpmc
           ON fpmc.fiscal_period_id = prr.fiscal_period_id
          AND fpmc.legal_entity_id = prr.legal_entity_id
          AND fpmc.module = prr.module
         WHERE prr.id = $1::uuid`,
        [requestId],
      );
      assert(state.rows[0].status === "submitted", "Failed reopen approval changed request status");
      assert(state.rows[0].control_state === "open", "Failed reopen approval changed period state");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-38 line-level invoice approval relieves and reversal restores commitment", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 4);
      const commitmentId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee960";
      const poId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee961";
      const poLineId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee962";
      const receiptId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee963";
      await client.query(
        `INSERT INTO public.commitments (id, legal_entity_id, vendor_id, reference_number, original_value, approval_status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'UM-RELIEF-PO', 1000, 'approved')`,
        [commitmentId, ENTITY, VENDOR_A],
      );
      await client.query(
        `INSERT INTO public.purchase_orders (
           id, legal_entity_id, vendor_id, po_number, po_status, commitment_id, currency_code,
           total_amount, fiscal_period_id, created_by, issued_by, issued_at
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'UM-RELIEF-PO', 'issued', $4::uuid,
           'SAR', 1000, $5::uuid, $6::uuid, $6::uuid, NOW())`,
        [poId, ENTITY, VENDOR_A, commitmentId, periodId, COST_CTRL],
      );
      await client.query(
        `INSERT INTO public.purchase_order_lines (
           id, purchase_order_id, line_number, description, quantity, unit_price_ex_vat
         ) VALUES ($1::uuid, $2::uuid, 1, 'Matched goods', 10, 100)`,
        [poLineId, poId],
      );
      await client.query(
        `INSERT INTO public.goods_receipts (
           id, legal_entity_id, purchase_order_id, vendor_id, receipt_number, receiver_id,
           receipt_status, fiscal_period_id, accepted_by, accepted_at
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'UM-GR-RELIEF', $5::uuid,
           'accepted', $6::uuid, $7::uuid, NOW())`,
        [receiptId, ENTITY, poId, VENDOR_A, FINANCE, periodId, COST_CTRL],
      );
      await client.query(
        `INSERT INTO public.goods_receipt_lines (
           goods_receipt_id, purchase_order_line_id, line_number, quantity_received, quantity_accepted
         ) VALUES ($1::uuid, $2::uuid, 1, 10, 10)`,
        [receiptId, poLineId],
      );

      await authAs(client, FINANCE);
      const created = await client.query(
        `SELECT public.rpc_supplier_invoice_create(
           $1::uuid,$2::uuid,$3::uuid,'UM-INV-RELIEF',CURRENT_DATE,400,400,0,CURRENT_DATE+30,
           jsonb_build_array(jsonb_build_object(
             'purchase_order_line_id',$4::uuid,'line_number',1,'description','Partial invoice',
             'quantity',4,'unit_price_ex_vat',100,'vat_amount',0
           )),$5::uuid,$6,NULL
         ) AS r`,
        [ENTITY, poId, VENDOR_A, poLineId, periodId, "idem-um38-create"],
      );
      assert(created.rows[0].r.ok, `Invoice create failed: ${JSON.stringify(created.rows[0].r)}`);
      const invoiceId = created.rows[0].r.entity_id;
      const matched = await client.query(
        `SELECT public.rpc_supplier_invoice_match($1::uuid,$2,NULL) AS r`,
        [invoiceId, "idem-um38-match"],
      );
      assert(matched.rows[0].r.match_mode === "three_way_goods", `Wrong match mode: ${JSON.stringify(matched.rows[0].r)}`);
      assert(matched.rows[0].r.match_status === "matched", `Invoice did not match: ${JSON.stringify(matched.rows[0].r)}`);

      await authAs(client, COST_CTRL);
      const approved = await client.query(
        `SELECT public.rpc_supplier_invoice_approve($1::uuid,'matched',$2,NULL) AS r`,
        [invoiceId, "idem-um38-approve"],
      );
      assert(approved.rows[0].r.ok, `Invoice approval failed: ${JSON.stringify(approved.rows[0].r)}`);
      let reconciliation = await client.query(
        `SELECT invoiced_applied::numeric AS applied FROM public.commitments WHERE id=$1::uuid`,
        [commitmentId],
      );
      assert(Number(reconciliation.rows[0].applied) === 400, "Commitment relief did not equal approved line value");

      await authAs(client, FINANCE);
      const reversed = await client.query(
        `SELECT public.rpc_supplier_invoice_reverse_and_replace(
           $1::uuid,'Validated accounting reversal','UM-INV-RELIEF-R',CURRENT_DATE,$2,NULL
         ) AS r`,
        [invoiceId, "idem-um38-reverse"],
      );
      assert(reversed.rows[0].r.ok && reversed.rows[0].r.replacement_invoice_id, `Reversal failed: ${JSON.stringify(reversed.rows[0].r)}`);
      reconciliation = await client.query(
        `SELECT c.invoiced_applied::numeric AS applied, si.invoice_status,
           (SELECT count(*)::int FROM public.supplier_invoice_lines WHERE supplier_invoice_id=$2::uuid) AS replacement_lines
         FROM public.commitments AS c
         JOIN public.supplier_invoices AS si ON si.id=$1::uuid
         WHERE c.id=$3::uuid`,
        [invoiceId, reversed.rows[0].r.replacement_invoice_id, commitmentId],
      );
      assert(Number(reconciliation.rows[0].applied) === 0, "Reversal did not restore open commitment");
      assert(reconciliation.rows[0].invoice_status === "reversed", "Invoice reversal status was not stored");
      assert(reconciliation.rows[0].replacement_lines === 1, "Replacement did not preserve line provenance");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-39 cross-PO invoice lines and sourcing price tampering are rejected", async (client) => {
    await client.query("BEGIN");
    try {
      const periodId = await fiscalPeriodId(client, 5);
      const poA = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee964";
      const poB = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee965";
      const lineA = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee966";
      const lineB = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee967";
      await client.query(
        `INSERT INTO public.purchase_orders (id,legal_entity_id,vendor_id,po_number,po_status,currency_code,total_amount,created_by)
         VALUES ($1::uuid,$3::uuid,$4::uuid,'UM-PO-A','issued','SAR',100,$5::uuid),
                ($2::uuid,$3::uuid,$4::uuid,'UM-PO-B','issued','SAR',100,$5::uuid)`,
        [poA, poB, ENTITY, VENDOR_A, COST_CTRL],
      );
      await client.query(
        `INSERT INTO public.purchase_order_lines (id,purchase_order_id,line_number,description,quantity,unit_price_ex_vat)
         VALUES ($1::uuid,$3::uuid,1,'A',1,100),($2::uuid,$4::uuid,1,'B',1,100)`,
        [lineA, lineB, poA, poB],
      );
      await authAs(client, FINANCE);
      let mixedBlocked = false;
      try {
        await client.query(
          `SELECT public.rpc_supplier_invoice_create(
             $1::uuid,$2::uuid,$3::uuid,'UM-CROSS-PO',CURRENT_DATE,100,100,0,NULL,
             jsonb_build_array(jsonb_build_object('purchase_order_line_id',$4::uuid,'quantity',1,'unit_price_ex_vat',100,'vat_amount',0)),
             $5::uuid,'idem-um39-cross',NULL
           )`,
          [ENTITY, poA, VENDOR_A, lineB, periodId],
        );
      } catch {
        mixedBlocked = true;
      }
      assert(mixedBlocked, "Invoice accepted a line from a different purchase order");

      await client.query("ROLLBACK");
      await client.query("BEGIN");
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee968";
      const reqLine = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee969";
      const reqLine2 = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee96a";
      const rfqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee96b";
      const rfqLine = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee96c";
      const quoteId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee96d";
      const quoteLine = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee96e";
      await seedApprovedRequisition(client, { reqId, line1Id: reqLine, line2Id: reqLine2 });
      await seedIssuedRfqWithQuote(client, { reqId, line1Id: reqLine, rfqId, rfqLineId: rfqLine, quoteId, quoteLineId: quoteLine });
      let frozen = false;
      try {
        await client.query(`UPDATE public.sourcing_evaluations SET evaluation_status='draft' WHERE rfq_id=$1::uuid`, [rfqId]);
      } catch {
        frozen = true;
      }
      assert(frozen, "Submitted sourcing evaluation was mutable");
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      await seedApprovedRequisition(client, { reqId, line1Id: reqLine, line2Id: reqLine2 });
      await seedIssuedRfqWithQuote(client, { reqId, line1Id: reqLine, rfqId, rfqLineId: rfqLine, quoteId, quoteLineId: quoteLine });
      await authAs(client, COST_CTRL);
      let tamperBlocked = false;
      try {
        await client.query(
          `SELECT public.rpc_award_create_and_submit(
             $1::uuid,$2::uuid,jsonb_build_array(jsonb_build_object(
               'rfq_line_id',$3::uuid,'awarded_quantity',10,'unit_price_ex_vat',101,'quotation_line_id',$4::uuid
             )),'tampered price',NULL,'idem-um39-award',NULL
           )`,
          [rfqId, quoteId, rfqLine, quoteLine],
        );
      } catch {
        tamperBlocked = true;
      }
      assert(tamperBlocked, "Award accepted a caller-tampered price");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-40 delegated approval performs the real transition with exact actor attribution", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee970";
      await seedApprovedRequisition(client, {
        reqId,
        line1Id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeee971",
        line2Id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeee972",
      });
      await client.query(
        `UPDATE public.purchase_requisitions
         SET requisition_status='budget_checked', approved_by=NULL, approved_at=NULL
         WHERE id=$1::uuid`,
        [reqId],
      );
      await authAs(client, COST_CTRL);
      const review = await client.query(
        `SELECT public.rpc_requisition_procurement_review(
           $1::uuid,'budget_checked',$2,NULL
         ) AS r`,
        [reqId, "idem-um40-review"],
      );
      assert(review.rows[0].r.ok, `Procurement-review transition failed: ${JSON.stringify(review.rows[0].r)}`);
      const assignment = await client.query(
        `SELECT id, original_assignee_id, assignment_status
         FROM public.workflow_approval_assignments
         WHERE item_type='purchase_requisition' AND entity_id=$1::uuid`,
        [reqId],
      );
      assert(assignment.rows.length === 1, "Authoritative requisition assignment was not created");
      assert(assignment.rows[0].original_assignee_id === APPROVER, "Wrong original requisition assignee");

      await authAs(client, COST_CTRL);
      const decision = await client.query(
        `SELECT public.rpc_approval_act_as_delegate(
           'purchase_requisition',$1::uuid,'approve',$2::uuid,$3::uuid,
           'Delegated approval regression',$4,NULL
         ) AS r`,
        [reqId, APPROVER, DELEGATION, "idem-um40-decision"],
      );
      assert(decision.rows[0].r.ok, `Delegated transition failed: ${JSON.stringify(decision.rows[0].r)}`);
      const replay = await client.query(
        `SELECT public.rpc_approval_act_as_delegate(
           'purchase_requisition',$1::uuid,'approve',$2::uuid,$3::uuid,
           'Delegated approval regression',$4,NULL
         ) AS r`,
        [reqId, APPROVER, DELEGATION, "idem-um40-decision"],
      );
      assert(replay.rows[0].r.decision_audit_id === decision.rows[0].r.decision_audit_id, "Delegated replay was not idempotent");

      await client.query("SET LOCAL role postgres");
      const evidence = await client.query(
        `SELECT pr.requisition_status, waa.assignment_status, ada.actual_actor_user_id,
                ada.original_assignee_user_id, ada.delegated_from_user_id,
                count(*) OVER ()::int AS decision_count
         FROM public.purchase_requisitions AS pr
         JOIN public.workflow_approval_assignments AS waa ON waa.entity_id=pr.id AND waa.item_type='purchase_requisition'
         JOIN public.approval_decision_audit AS ada ON ada.entity_id=pr.id AND ada.item_type='purchase_requisition'
         WHERE pr.id=$1::uuid`,
        [reqId],
      );
      assert(evidence.rows[0].requisition_status === "approved", "Delegated decision did not transition requisition");
      assert(evidence.rows[0].assignment_status === "approved", "Assignment was not resolved by business transition");
      assert(evidence.rows[0].actual_actor_user_id === COST_CTRL, "Actual delegate actor was not recorded");
      assert(evidence.rows[0].original_assignee_user_id === APPROVER, "Original assignee attribution is wrong");
      assert(evidence.rows[0].delegated_from_user_id === APPROVER, "Delegator attribution is wrong");
      assert(evidence.rows[0].decision_count === 1, "Idempotent replay duplicated decision audit");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-41 period template versions require two actors and used versions are immutable", async (client) => {
    await client.query("BEGIN");
    try {
      await grantRoleForTest(client, FINANCE, "legal_entity_administrator");
      await grantRoleForTest(client, APPROVER, "legal_entity_administrator");
      await authAs(client, FINANCE);
      const created = await client.query(
        `SELECT public.rpc_period_template_create(
           $1::uuid,'projects','UM-PROJECT-CLOSE','Project close','إغلاق المشروع',CURRENT_DATE,$2,NULL
         ) AS r`,
        [ENTITY, "idem-um41-create-v1"],
      );
      const templateId = created.rows[0].r.entity_id;
      const replay = await client.query(
        `SELECT public.rpc_period_template_create(
           $1::uuid,'projects','UM-PROJECT-CLOSE','Project close','إغلاق المشروع',CURRENT_DATE,$2,NULL
         ) AS r`,
        [ENTITY, "idem-um41-create-v1"],
      );
      assert(replay.rows[0].r.entity_id === templateId, "Period template create replay was not idempotent");
      const item = await client.query(
        `SELECT public.rpc_period_template_add_item(
           $1::uuid,1::smallint,'Project reconciliation','تسوية المشروع',NULL,'manual',
           'finance_user',true,true,NULL,$2,NULL
         ) AS r`,
        [templateId, "idem-um41-item-v1"],
      );
      assert(item.rows[0].r.ok, `Period item create failed: ${JSON.stringify(item.rows[0].r)}`);
      const submitted = await client.query(
        `SELECT public.rpc_period_template_submit($1::uuid,'draft',$2,NULL) AS r`,
        [templateId, "idem-um41-submit-v1"],
      );
      assert(submitted.rows[0].r.ok, "Period template submission failed");
      const selfApprove = await client.query(
        `SELECT public.rpc_period_template_approve($1::uuid,'submitted',$2,NULL) AS r`,
        [templateId, "idem-um41-self-approve"],
      );
      assert(!selfApprove.rows[0].r.ok, "Period template creator self-approved");

      await authAs(client, APPROVER);
      const approved = await client.query(
        `SELECT public.rpc_period_template_approve($1::uuid,'submitted',$2,NULL) AS r`,
        [templateId, "idem-um41-approve-v1"],
      );
      assert(approved.rows[0].r.ok, `Period template approval failed: ${JSON.stringify(approved.rows[0].r)}`);

      await authAs(client, FINANCE);
      const v2 = await client.query(
        `SELECT public.rpc_period_template_create(
           $1::uuid,'projects','UM-PROJECT-CLOSE','Project close v2','إغلاق المشروع 2',CURRENT_DATE,$2,NULL
         ) AS r`,
        [ENTITY, "idem-um41-create-v2"],
      );
      assert(v2.rows[0].r.version_number === 2, "Second period template version was not created");
      await client.query(
        `SELECT public.rpc_period_template_add_item(
           $1::uuid,1::smallint,'Project reconciliation v2','تسوية المشروع 2',NULL,'manual',
           'finance_user',true,true,NULL,$2,NULL
         )`,
        [v2.rows[0].r.entity_id, "idem-um41-item-v2"],
      );
      await client.query(`SELECT public.rpc_period_template_submit($1::uuid,'draft',$2,NULL)`, [v2.rows[0].r.entity_id, "idem-um41-submit-v2"]);
      await authAs(client, APPROVER);
      await client.query(`SELECT public.rpc_period_template_approve($1::uuid,'submitted',$2,NULL)`, [v2.rows[0].r.entity_id, "idem-um41-approve-v2"]);

      await client.query("SET LOCAL role postgres");
      const periodId = await fiscalPeriodId(client, 6);
      await client.query(
        `INSERT INTO public.period_close_instances (legal_entity_id,fiscal_period_id,module,template_id,created_by)
         VALUES ($1::uuid,$2::uuid,'projects',$3::uuid,$4::uuid)`,
        [ENTITY, periodId, v2.rows[0].r.entity_id, FINANCE],
      );
      await client.query("SAVEPOINT period_template_immutable");
      let immutable = false;
      try {
        await client.query(`UPDATE public.period_close_checklist_templates SET name_en='tampered' WHERE id=$1::uuid`, [v2.rows[0].r.entity_id]);
      } catch {
        immutable = true;
        await client.query("ROLLBACK TO SAVEPOINT period_template_immutable");
      }
      assert(immutable, "Used period template definition was mutable");
      const status = await client.query(
        `SELECT count(*) FILTER (WHERE governance_status='approved' AND is_active)::int AS active_count,
                count(*) FILTER (WHERE id=$2::uuid AND governance_status='inactive' AND NOT is_active)::int AS superseded_count
         FROM public.period_close_checklist_templates
         WHERE legal_entity_id=$1::uuid AND module='projects'`,
        [ENTITY, templateId],
      );
      assert(status.rows[0].active_count === 1, "Period template activation uniqueness failed");
      assert(status.rows[0].superseded_count === 1, "Prior period template version was not retired");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-42 appraisal templates, goals, and participant fields follow controlled ownership", async (client) => {
    await client.query("BEGIN");
    try {
      await grantRoleForTest(client, FINANCE, "legal_entity_administrator");
      await grantRoleForTest(client, APPROVER, "legal_entity_administrator");
      await authAs(client, FINANCE);
      const template = await client.query(
        `SELECT public.rpc_appraisal_template_create(
           $1::uuid,'UM-APPRAISAL','Controlled appraisal','تقييم محكوم',NULL,NULL,5,$2,NULL
         ) AS r`,
        [ENTITY, "idem-um42-template-v1"],
      );
      const templateId = template.rows[0].r.entity_id;
      await client.query(
        `SELECT public.rpc_appraisal_template_add_criterion(
           $1::uuid,1,'delivery','Delivery quality','جودة التسليم',100,5,$2,NULL
         )`,
        [templateId, "idem-um42-criterion-v1"],
      );
      await client.query(`SELECT public.rpc_appraisal_template_submit($1::uuid,'draft',$2,NULL)`, [templateId, "idem-um42-submit-v1"]);
      const selfApprove = await client.query(
        `SELECT public.rpc_appraisal_template_approve($1::uuid,'submitted',$2,NULL) AS r`,
        [templateId, "idem-um42-self-approve"],
      );
      assert(!selfApprove.rows[0].r.ok, "Appraisal template creator self-approved");
      await authAs(client, APPROVER);
      const approved = await client.query(
        `SELECT public.rpc_appraisal_template_approve($1::uuid,'submitted',$2,NULL) AS r`,
        [templateId, "idem-um42-approve-v1"],
      );
      assert(approved.rows[0].r.ok, `Appraisal template approval failed: ${JSON.stringify(approved.rows[0].r)}`);

      await authAs(client, FINANCE);
      const assignment = await client.query(
        `SELECT public.rpc_appraisal_assignment_create(
           $1::uuid,'dddddddd-dddd-dddd-dddd-ddddddddd401'::uuid,$2::uuid,$3::uuid,$4::uuid,
           NULL,NULL,$5,NULL
         ) AS r`,
        [ENTITY, templateId, VIEWER, MANAGER, "idem-um42-assignment"],
      );
      assert(assignment.rows[0].r.ok, `Appraisal assignment failed: ${JSON.stringify(assignment.rows[0].r)}`);
      const assignmentId = assignment.rows[0].r.entity_id;
      const goal = await client.query(
        `SELECT public.rpc_appraisal_goal_create(
           $1::uuid,'Deliver the governed outcome','100%','percent',100,$2,NULL
         ) AS r`,
        [assignmentId, "idem-um42-goal"],
      );
      const goalReplay = await client.query(
        `SELECT public.rpc_appraisal_goal_create(
           $1::uuid,'Deliver the governed outcome','100%','percent',100,$2,NULL
         ) AS r`,
        [assignmentId, "idem-um42-goal"],
      );
      assert(goalReplay.rows[0].r.entity_id === goal.rows[0].r.entity_id, "Goal create replay was not idempotent");

      await client.query("SET LOCAL role postgres");
      await client.query("SAVEPOINT appraisal_criterion_immutable");
      let criterionFrozen = false;
      try {
        await client.query(`UPDATE public.appraisal_template_criteria SET weight=50 WHERE template_id=$1::uuid`, [templateId]);
      } catch {
        criterionFrozen = true;
        await client.query("ROLLBACK TO SAVEPOINT appraisal_criterion_immutable");
      }
      assert(criterionFrozen, "Published appraisal criterion was mutable");

      await authAs(client, VIEWER);
      const employeeUpdate = await client.query(
        `SELECT public.rpc_appraisal_goal_employee_update($1::uuid,'On track',$2,NULL) AS r`,
        [goal.rows[0].r.entity_id, "idem-um42-employee-goal"],
      );
      assert(employeeUpdate.rows[0].r.ok, "Assigned employee could not update own goal comment");
      const criterion = await client.query(`SELECT id FROM public.appraisal_template_criteria WHERE template_id=$1::uuid`, [templateId]);
      const selfSubmit = await client.query(
        `SELECT public.rpc_appraisal_self_submit(
           $1::uuid,jsonb_build_array(jsonb_build_object(
             'criterion_id',$2::uuid,'self_rating',4,'self_comment','Evidence supplied'
           )),'employee_self_review',$3,NULL
         ) AS r`,
        [assignmentId, criterion.rows[0].id, "idem-um42-self-submit"],
      );
      assert(selfSubmit.rows[0].r.ok, "Employee self submission failed");

      await authAs(client, MANAGER);
      const managerGoal = await client.query(
        `SELECT public.rpc_appraisal_goal_manager_update($1::uuid,4,'Validated',$2,NULL) AS r`,
        [goal.rows[0].r.entity_id, "idem-um42-manager-goal"],
      );
      assert(managerGoal.rows[0].r.ok, `Assigned manager could not rate goal: ${JSON.stringify(managerGoal.rows[0].r)}`);

      await authAs(client, FINANCE);
      const v2 = await client.query(
        `SELECT public.rpc_appraisal_template_create(
           $1::uuid,'UM-APPRAISAL','Controlled appraisal v2','تقييم محكوم 2',NULL,NULL,5,$2,NULL
         ) AS r`,
        [ENTITY, "idem-um42-template-v2"],
      );
      assert(v2.rows[0].r.version_number === 2, "Second appraisal template version was not created");
      await client.query(
        `SELECT public.rpc_appraisal_template_add_criterion(
           $1::uuid,1,'delivery','Delivery quality v2','جودة التسليم 2',100,5,$2,NULL
         )`,
        [v2.rows[0].r.entity_id, "idem-um42-criterion-v2"],
      );
      await client.query(`SELECT public.rpc_appraisal_template_submit($1::uuid,'draft',$2,NULL)`, [v2.rows[0].r.entity_id, "idem-um42-submit-v2"]);
      await authAs(client, APPROVER);
      await client.query(`SELECT public.rpc_appraisal_template_approve($1::uuid,'submitted',$2,NULL)`, [v2.rows[0].r.entity_id, "idem-um42-approve-v2"]);
      await client.query("SET LOCAL role postgres");
      const evidence = await client.query(
        `SELECT ag.employee_comment,ag.manager_rating::numeric AS manager_rating,
           aa.template_id,
           (SELECT count(*)::int FROM public.appraisal_templates WHERE legal_entity_id=$1::uuid AND code='UM-APPRAISAL' AND governance_status='approved' AND is_active) AS active_count,
           (SELECT count(*)::int FROM public.audit_events WHERE entity_type='appraisal_goal' AND entity_id=ag.id) AS goal_audits
         FROM public.appraisal_goals AS ag
         JOIN public.appraisal_assignments AS aa ON aa.id=ag.assignment_id
         WHERE ag.id=$2::uuid`,
        [ENTITY, goal.rows[0].r.entity_id],
      );
      assert(evidence.rows[0].employee_comment === "On track", "Employee goal comment was not stored");
      assert(Number(evidence.rows[0].manager_rating) === 4, "Manager goal rating was not stored");
      assert(evidence.rows[0].template_id === templateId, "Existing assignment did not preserve its original template baseline");
      assert(evidence.rows[0].active_count === 1, "Appraisal template activation uniqueness failed");
      assert(evidence.rows[0].goal_audits === 3, "Goal create/update audit count is wrong");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-43 governed master approval binds, revises, and deactivates the operational vendor", async (client) => {
    await client.query("BEGIN");
    try {
      await authAs(client, FINANCE);
      const created = await client.query(
        `SELECT public.rpc_master_record_create_draft(
           $1::uuid,'vendor','UM-VENDOR','Governed Vendor','مورد محكوم',NULL,NULL,
           jsonb_build_object('currency_code','SAR','country','SA'),CURRENT_DATE,NULL,
           'Initial governed vendor',$2,NULL
         ) AS r`,
        [ENTITY, "idem-um43-create"],
      );
      const recordId = created.rows[0].r.entity_id;
      await client.query(`SELECT public.rpc_master_record_submit($1::uuid,'draft',$2,NULL)`, [recordId, "idem-um43-submit"]);
      await authAs(client, COST_CTRL);
      const approved = await client.query(
        `SELECT public.rpc_master_record_approve($1::uuid,'submitted',$2,NULL) AS r`,
        [recordId, "idem-um43-approve"],
      );
      assert(approved.rows[0].r.ok, `Master approval failed: ${JSON.stringify(approved.rows[0].r)}`);
      await client.query("SET LOCAL role postgres");
      const binding = await client.query(
        `SELECT gmb.operational_record_id,v.name_en,v.status
         FROM public.governed_master_bindings AS gmb
         JOIN public.vendors AS v ON v.id=gmb.operational_record_id
         WHERE gmb.governed_record_id=$1::uuid`,
        [recordId],
      );
      assert(binding.rows.length === 1 && binding.rows[0].name_en === "Governed Vendor", "Approved governed vendor did not reach operational master");
      const operationalId = binding.rows[0].operational_record_id;

      await authAs(client, FINANCE);
      const revision = await client.query(
        `SELECT public.rpc_master_record_create_revision(
           $1::uuid,'Governed Vendor Revised','مورد محكوم محدث',NULL,NULL,
           jsonb_build_object('currency_code','SAR','country','SA'),CURRENT_DATE,NULL,
           'Approved vendor name change',$2,NULL
         ) AS r`,
        [recordId, "idem-um43-revision"],
      );
      assert(revision.rows[0].r.revision_number === 2, "Master revision number is wrong");
      await client.query(`SELECT public.rpc_master_record_submit($1::uuid,'draft',$2,NULL)`, [revision.rows[0].r.entity_id, "idem-um43-revision-submit"]);
      await authAs(client, COST_CTRL);
      await client.query(`SELECT public.rpc_master_record_approve($1::uuid,'submitted',$2,NULL)`, [revision.rows[0].r.entity_id, "idem-um43-revision-approve"]);
      await client.query("SET LOCAL role postgres");
      const revised = await client.query(
        `SELECT v.id,v.name_en,v.status,old.is_current AS old_current,old.governance_status AS old_status,
                current.is_current AS new_current
         FROM public.vendors AS v
         JOIN public.governed_master_records AS old ON old.id=$1::uuid
         JOIN public.governed_master_records AS current ON current.id=$2::uuid
         WHERE v.id=$3::uuid`,
        [recordId, revision.rows[0].r.entity_id, operationalId],
      );
      assert(revised.rows[0].name_en === "Governed Vendor Revised", "Master revision did not update exact operational vendor");
      assert(!revised.rows[0].old_current && revised.rows[0].old_status === "inactive", "Superseded master revision remained current");
      assert(revised.rows[0].new_current, "Approved replacement master revision is not current");

      await authAs(client, FINANCE);
      const deactivated = await client.query(
        `SELECT public.rpc_master_record_deactivate($1::uuid,'approved','Vendor retired after review',$2,NULL) AS r`,
        [revision.rows[0].r.entity_id, "idem-um43-deactivate"],
      );
      assert(deactivated.rows[0].r.ok, `Master deactivation failed: ${JSON.stringify(deactivated.rows[0].r)}`);
      await client.query("SET LOCAL role postgres");
      const inactive = await client.query(`SELECT status FROM public.vendors WHERE id=$1::uuid`, [operationalId]);
      assert(inactive.rows[0].status === "inactive", "Governed deactivation did not deactivate operational vendor");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-44 payment reject and cancel transitions are audited and idempotent", async (client) => {
    await client.query("BEGIN");
    try {
      const invoiceId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee973";
      await seedApprovedInvoice(client, { invId: invoiceId, poId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeee974", gross: 500 });
      await authAs(client, FINANCE);
      const first = await client.query(
        `SELECT public.rpc_payment_request_create($1::uuid,$2::uuid,200,CURRENT_DATE+7,'reject path',$3,NULL) AS r`,
        [ENTITY, invoiceId, "idem-um44-create-reject"],
      );
      await client.query(`SELECT public.rpc_payment_request_submit($1::uuid,'draft',$2,NULL)`, [first.rows[0].r.entity_id, "idem-um44-submit-reject"]);
      await authAs(client, APPROVER);
      const rejected = await client.query(
        `SELECT public.rpc_payment_request_reject($1::uuid,'Rejected after review','submitted',$2,NULL) AS r`,
        [first.rows[0].r.entity_id, "idem-um44-reject"],
      );
      const replay = await client.query(
        `SELECT public.rpc_payment_request_reject($1::uuid,'Rejected after review','submitted',$2,NULL) AS r`,
        [first.rows[0].r.entity_id, "idem-um44-reject"],
      );
      assert(rejected.rows[0].r.ok && replay.rows[0].r.ok, "Payment rejection or replay failed");

      await authAs(client, FINANCE);
      const second = await client.query(
        `SELECT public.rpc_payment_request_create($1::uuid,$2::uuid,100,CURRENT_DATE+7,'cancel path',$3,NULL) AS r`,
        [ENTITY, invoiceId, "idem-um44-create-cancel"],
      );
      const cancelled = await client.query(
        `SELECT public.rpc_payment_request_cancel($1::uuid,'Cancelled before submit','draft',$2,NULL) AS r`,
        [second.rows[0].r.entity_id, "idem-um44-cancel"],
      );
      assert(cancelled.rows[0].r.ok, "Payment cancellation failed");
      await client.query("SET LOCAL role postgres");
      const evidence = await client.query(
        `SELECT
           (SELECT request_status FROM public.payment_requests WHERE id=$1::uuid) AS rejected_status,
           (SELECT request_status FROM public.payment_requests WHERE id=$2::uuid) AS cancelled_status,
           (SELECT count(*)::int FROM public.audit_events WHERE entity_type='payment_request' AND entity_id=$1::uuid AND action='reject') AS reject_audits,
           (SELECT count(*)::int FROM public.audit_events WHERE entity_type='payment_request' AND entity_id=$2::uuid AND action='cancel') AS cancel_audits`,
        [first.rows[0].r.entity_id, second.rows[0].r.entity_id],
      );
      assert(evidence.rows[0].rejected_status === "rejected", "Rejected payment status is wrong");
      assert(evidence.rows[0].cancelled_status === "cancelled", "Cancelled payment status is wrong");
      assert(evidence.rows[0].reject_audits === 1, "Idempotent rejection duplicated audit evidence");
      assert(evidence.rows[0].cancel_audits === 1, "Payment cancellation audit count is wrong");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-45 controlled RPCs reject cross-entity mutation references in all five modules", async (client) => {
    await client.query("BEGIN");
    try {
      const otherEntity = "11111111-1111-1111-1111-111111111103";
      const foreignVendor = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee980";
      const foreignPo = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee981";
      const foreignAssignment = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee982";
      const foreignEntityId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee983";
      await grantRoleForTest(client, FINANCE, "legal_entity_administrator");
      await client.query(
        `INSERT INTO public.vendors (id,legal_entity_id,code,name_en,name_ar,status)
         VALUES ($1::uuid,$2::uuid,'UM-FOREIGN','Foreign Vendor','مورد أجنبي','active')`,
        [foreignVendor, otherEntity],
      );
      await client.query(
        `INSERT INTO public.purchase_orders (
           id,legal_entity_id,vendor_id,po_number,po_status,currency_code,total_amount,created_by
         ) VALUES ($1::uuid,$2::uuid,$3::uuid,'UM-FOREIGN-PO','issued','SAR',100,$4::uuid)`,
        [foreignPo, otherEntity, foreignVendor, APPROVER],
      );
      await client.query(
        `INSERT INTO public.workflow_approval_assignments (
           id,legal_entity_id,item_type,workflow_type,permission_code,entity_id,title_en,title_ar,
           requester_id,original_assignee_id,financial_amount
         ) VALUES (
           $1::uuid,$2::uuid,'purchase_requisition','purchase_requisition','commitment.approve',
           $3::uuid,'Foreign approval','موافقة أجنبية',$4::uuid,$5::uuid,100
         )`,
        [foreignAssignment, otherEntity, foreignEntityId, FINANCE, APPROVER],
      );

      await authAs(client, FINANCE);
      const procurement = await client.query(
        `SELECT public.rpc_supplier_invoice_create(
           $1::uuid,$2::uuid,$3::uuid,'UM-FOREIGN-INV',CURRENT_DATE,100,100,0,NULL,'[]'::jsonb,
           NULL,$4,NULL
         ) AS r`,
        [otherEntity, foreignPo, foreignVendor, "idem-um45-procurement"],
      );
      const master = await client.query(
        `SELECT public.rpc_master_record_create_draft(
           $1::uuid,'vendor','UM-FOREIGN-MASTER','Foreign Master','سجل أجنبي',NULL,NULL,'{}'::jsonb,
           CURRENT_DATE,NULL,'Foreign entity attempt',$2,NULL
         ) AS r`,
        [otherEntity, "idem-um45-master"],
      );
      const period = await client.query(
        `SELECT public.rpc_period_template_create(
           $1::uuid,'projects','UM-FOREIGN-CLOSE','Foreign Close','إغلاق أجنبي',CURRENT_DATE,$2,NULL
         ) AS r`,
        [otherEntity, "idem-um45-period"],
      );
      const appraisal = await client.query(
        `SELECT public.rpc_appraisal_template_create(
           $1::uuid,'UM-FOREIGN-APP','Foreign Appraisal','تقييم أجنبي',NULL,NULL,5,$2,NULL
         ) AS r`,
        [otherEntity, "idem-um45-appraisal"],
      );
      for (const [module, result] of [
        ["procurement", procurement.rows[0].r],
        ["master", master.rows[0].r],
        ["period", period.rows[0].r],
        ["appraisal", appraisal.rows[0].r],
      ]) {
        assert(!result.ok && (result.error_code ?? result.code) === "FORBIDDEN", `${module} accepted or misclassified a cross-entity mutation: ${JSON.stringify(result)}`);
      }

      await authAs(client, COST_CTRL);
      const delegated = await client.query(
        `SELECT public.rpc_approval_act_as_delegate(
           'purchase_requisition',$1::uuid,'approve',$2::uuid,$3::uuid,
           'Cross-entity delegation attempt',$4,NULL
         ) AS r`,
        [foreignEntityId, APPROVER, DELEGATION, "idem-um45-delegation"],
      );
      assert(!delegated.rows[0].r.ok && (delegated.rows[0].r.error_code ?? delegated.rows[0].r.code) === "DELEGATION_INVALID",
        `Delegation crossed legal entities: ${JSON.stringify(delegated.rows[0].r)}`);
      await client.query("SET LOCAL role postgres");
      const state = await client.query(
        `SELECT assignment_status,
           (SELECT count(*)::int FROM public.approval_decision_audit
            WHERE item_type='purchase_requisition' AND entity_id=$2::uuid) AS decisions
         FROM public.workflow_approval_assignments WHERE id=$1::uuid`,
        [foreignAssignment, foreignEntityId],
      );
      assert(state.rows[0].assignment_status === "pending" && state.rows[0].decisions === 0,
        "Cross-entity delegated attempt mutated workflow evidence");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-46 delegation preserves requester self-approval segregation", async (client) => {
    await client.query("BEGIN");
    try {
      const reqId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeee984";
      await seedApprovedRequisition(client, {
        reqId,
        line1Id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeee985",
        line2Id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeee986",
        requester: COST_CTRL,
      });
      await client.query(
        `UPDATE public.purchase_requisitions
         SET requisition_status='budget_checked',approved_by=NULL,approved_at=NULL
         WHERE id=$1::uuid`,
        [reqId],
      );
      await authAs(client, COST_CTRL);
      const review = await client.query(
        `SELECT public.rpc_requisition_procurement_review($1::uuid,'budget_checked',$2,NULL) AS r`,
        [reqId, "idem-um46-review"],
      );
      assert(review.rows[0].r.ok, "Unable to establish delegated SOD test assignment");
      const decision = await client.query(
        `SELECT public.rpc_approval_act_as_delegate(
           'purchase_requisition',$1::uuid,'approve',$2::uuid,$3::uuid,
           'Requester must not self-approve through delegation',$4,NULL
         ) AS r`,
        [reqId, APPROVER, DELEGATION, "idem-um46-decision"],
      );
      assert(!decision.rows[0].r.ok && (decision.rows[0].r.error_code ?? decision.rows[0].r.code) === "SOD_VIOLATION",
        `Delegation bypassed requester SOD: ${JSON.stringify(decision.rows[0].r)}`);
      await client.query("SET LOCAL role postgres");
      const state = await client.query(
        `SELECT pr.requisition_status,waa.assignment_status,
           (SELECT count(*)::int FROM public.approval_decision_audit AS ada
            WHERE ada.item_type='purchase_requisition' AND ada.entity_id=pr.id) AS decisions
         FROM public.purchase_requisitions AS pr
         JOIN public.workflow_approval_assignments AS waa
           ON waa.item_type='purchase_requisition' AND waa.entity_id=pr.id
         WHERE pr.id=$1::uuid`,
        [reqId],
      );
      assert(state.rows[0].requisition_status === "procurement_review"
        && state.rows[0].assignment_status === "pending" && state.rows[0].decisions === 0,
      "Failed delegated SOD attempt changed business or approval state");
    } finally {
      await client.query("ROLLBACK");
    }
  });

  test("UM-47 appraisal assignment rejects overlapping employee, manager, and reviewer", async (client) => {
    await client.query("BEGIN");
    try {
      await authAs(client, FINANCE);
      const result = await client.query(
        `SELECT public.rpc_appraisal_assignment_create(
           $1::uuid,'dddddddd-dddd-dddd-dddd-ddddddddd401'::uuid,
           'dddddddd-dddd-dddd-dddd-ddddddddd402'::uuid,$2::uuid,$2::uuid,$3::uuid,
           NULL,$4,NULL
         ) AS r`,
        [ENTITY, VIEWER, MANAGER, "idem-um47-appraisal-sod"],
      );
      assert(!result.rows[0].r.ok && (result.rows[0].r.error_code ?? result.rows[0].r.code) === "SOD_VIOLATION",
        `Appraisal participant SOD was bypassed: ${JSON.stringify(result.rows[0].r)}`);
    } finally {
      await client.query("ROLLBACK");
    }
  });
}
