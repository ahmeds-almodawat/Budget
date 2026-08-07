#!/usr/bin/env node
/**
 * Concurrency and idempotency probes for P2 financial transaction commands.
 * Run: npm run test:concurrency
 */
import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres";

const LEGAL_ENTITY = "11111111-1111-1111-1111-111111111102";
const FINANCE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3";
const LEGACY_ORPHAN_SOURCE_IDS = [
  "REST-B1-FOOD-001",
  "REST-B1-LAB-001",
  "REST-B1-REV-001",
  "REST-B2-FOOD-001",
  "REST-B2-LAB-001",
  "REST-B2-REV-001",
];

async function asUser(client, userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL role authenticated");
    await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const result = await fn();
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed += 1;
      console.log(`✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`✗ ${name}: ${error.message}`);
    }
  }

  await test("COD-H-003: audit append-only triggers exist", async () => {
    const { rows } = await client.query(`
      SELECT count(*)::int AS c FROM pg_catalog.pg_trigger AS t
      JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'audit_events'
        AND t.tgname IN ('trg_audit_events_deny_update', 'trg_audit_events_deny_delete')
        AND NOT t.tgisinternal
    `);
    if (rows[0].c !== 2) throw new Error("audit_events append-only triggers missing");
  });

  await test("COD-H-004: approved budget version amounts are immutable", async () => {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `INSERT INTO budget_versions (
          id, legal_entity_id, control_scope_id, fiscal_year_id, version_label, version_type,
          approval_status, original_approved_amount, locked_at
        ) VALUES (
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbc1',
          '11111111-1111-1111-1111-111111111102',
          '55555555-5555-5555-5555-555555555501',
          '77777777-7777-7777-7777-777777777701',
          'CONC-LOCK', 'operational', 'locked', 1000, NOW()
        ) RETURNING id`,
      );
      let denied = false;
      try {
        await client.query(
          `UPDATE budget_versions SET original_approved_amount = 999999 WHERE id = $1`,
          [rows[0].id],
        );
      } catch {
        denied = true;
      }
      if (!denied) throw new Error("Approved budget amount mutation should be denied");
      await client.query("ROLLBACK");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  await test("COD-H-010: duplicate reversal is idempotent via unique index", async () => {
    await asUser(client, FINANCE, async () => {
      const { rows: dimensions } = await client.query(
        `SELECT ou.id AS organization_unit_id, cn.id AS cost_node_id
         FROM organization_units AS ou
         CROSS JOIN cost_nodes AS cn
         WHERE ou.legal_entity_id = $1 AND cn.legal_entity_id = $1
           AND cn.is_leaf = true AND cn.allows_posting = true
         ORDER BY ou.id, cn.id
         LIMIT 1`,
        [LEGAL_ENTITY],
      );
      if (dimensions.length === 0) throw new Error("No valid allocation dimensions found");

      const sourceId = `CONCURRENCY-REVERSAL-${Date.now()}`;
      const { rows: originals } = await client.query(
        `INSERT INTO actual_transactions (
           legal_entity_id, source_system, source_transaction_id, transaction_date,
           amount_ex_vat, amount_inc_vat, is_posted
         ) VALUES ($1, 'CONCURRENCY-TEST', $2, '2027-04-01', 123.45, 123.45, false)
         RETURNING id`,
        [LEGAL_ENTITY, sourceId],
      );
      const origId = originals[0].id;
      await client.query(
        `INSERT INTO actual_transaction_allocations (
           actual_transaction_id, organization_unit_id, cost_node_id,
           allocation_amount, allocation_percent
         ) VALUES ($1, $2, $3, 123.45, 100)`,
        [
          origId,
          dimensions[0].organization_unit_id,
          dimensions[0].cost_node_id,
        ],
      );
      const posted = await client.query(
        `SELECT public.rpc_post_actual_transaction($1, $2, gen_random_uuid()) AS r`,
        [origId, `test-post-${Date.now()}`],
      );
      if (!posted.rows[0].r.ok) throw new Error("Self-contained posting setup failed");

      const key = `test-rev-${Date.now()}`;
      const first = await client.query(
        `SELECT public.rpc_reverse_actual_transaction($1, 'concurrency test', $2, gen_random_uuid()) AS r`,
        [origId, key],
      );
      const second = await client.query(
        `SELECT public.rpc_reverse_actual_transaction($1, 'concurrency test', $2, gen_random_uuid()) AS r`,
        [origId, key],
      );
      const r1 = first.rows[0].r;
      const r2 = second.rows[0].r;
      if (!r1.ok || !r2.ok) throw new Error("Reversal RPC failed");
      if (r1.reversal_id !== r2.reversal_id && !r2.already_reversed) {
        throw new Error("Duplicate reversal did not return same reversal id");
      }
    });
  });

  await test("DTA-M-001: legacy fixture allocation debt is bounded and explicit", async () => {
    const { rows } = await client.query(
      `SELECT atx.source_transaction_id
       FROM actual_transactions AS atx
       WHERE atx.is_posted = true
         AND atx.is_reversal = false
         AND NOT EXISTS (
           SELECT 1 FROM actual_transaction_allocations AS ata
           WHERE ata.actual_transaction_id = atx.id
         )
       ORDER BY atx.source_transaction_id`,
    );
    const actual = rows.map((row) => row.source_transaction_id);
    if (JSON.stringify(actual) !== JSON.stringify(LEGACY_ORPHAN_SOURCE_IDS)) {
      throw new Error(
        `Unexpected posted transactions without allocations: ${actual.join(", ") || "none"}`,
      );
    }
  });

  await test("COD-M-005: cross-tenant allocation insert is rejected", async () => {
    await client.query("BEGIN");
    try {
      const { rows: txn } = await client.query(
        `INSERT INTO actual_transactions (
          legal_entity_id, source_system, source_transaction_id, transaction_date,
          amount_ex_vat, amount_inc_vat, is_posted
        ) VALUES ($1, 'TEST', $2, '2027-04-01', 100, 100, false) RETURNING id`,
        [LEGAL_ENTITY, `TENANT-TEST-${Date.now()}`],
      );
      let denied = false;
      try {
        await client.query(
          `INSERT INTO actual_transaction_allocations (
            actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount, allocation_percent
          ) VALUES ($1, '44444444-4444-4444-4444-444444444499', '66666666-6666-6666-6666-666666666603', 100, 100)`,
          [txn[0].id],
        );
      } catch {
        denied = true;
      }
      if (!denied) throw new Error("Cross-tenant allocation should be rejected");
      await client.query("ROLLBACK");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  await test("UM-CONC-01: concurrent PO number allocation is unique", async () => {
    const clients = await Promise.all(
      [0, 1, 2, 3].map(async () => {
        const c = new pg.Client({ connectionString });
        await c.connect();
        return c;
      }),
    );
    try {
      const results = await Promise.all(
        clients.map((c) => c.query(`SELECT private.next_po_number($1::uuid) AS po_number`, [LEGAL_ENTITY])),
      );
      const numbers = results.map((r) => r.rows[0].po_number);
      if (new Set(numbers).size !== numbers.length) {
        throw new Error(`Duplicate PO numbers under concurrency: ${numbers.join(", ")}`);
      }
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  await test("UM-CONC-02: concurrent awards cannot over-consume requisition qty", async () => {
    const reqId = crypto.randomUUID();
    const lineId = crypto.randomUUID();
    const rfqId = crypto.randomUUID();
    const rfqLineId = crypto.randomUUID();
    const quoteId = crypto.randomUUID();
    const quoteLineId = crypto.randomUUID();
    const vendorId = "dddddddd-dddd-dddd-dddd-ddddddddd101";
    const costCtrl = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa8";

    await client.query("BEGIN");
    try {
      const { rows: periods } = await client.query(
        `SELECT id FROM fiscal_periods WHERE fiscal_year_id = '77777777-7777-7777-7777-777777777701' AND period_number = 3 LIMIT 1`,
      );
      await client.query(
        `INSERT INTO purchase_requisitions (
           id, legal_entity_id, requisition_number, title_en, title_ar, requester_id,
           control_scope_id, cost_node_id, fiscal_period_id, estimated_total, requisition_status,
           submitted_at, approved_at, approved_by
         ) VALUES (
           $1::uuid, $2::uuid, $3, 'Conc Award', 'ترسية متزامنة', $4::uuid,
           '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666605',
           $5::uuid, 1000, 'approved', NOW(), NOW(), $6::uuid
         )`,
        [reqId, LEGAL_ENTITY, `CONC-REQ-${Date.now()}`, FINANCE, periods[0].id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"],
      );
      await client.query(
        `INSERT INTO purchase_requisition_lines (id, requisition_id, line_number, description, quantity, unit_price, cost_node_id)
         VALUES ($1::uuid, $2::uuid, 1, 'Conc line', 10, 100, '66666666-6666-6666-6666-666666666605')`,
        [lineId, reqId],
      );
      await client.query(
        `INSERT INTO rfqs (
           id, legal_entity_id, requisition_id, rfq_number, title_en, title_ar, currency_code,
           rfq_status, created_by, issued_by, issue_date, response_deadline
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4, 'Conc RFQ', 'طلب', 'SAR', 'evaluation',
           $5::uuid, $5::uuid, CURRENT_DATE, NOW() + INTERVAL '7 days'
         )`,
        [rfqId, LEGAL_ENTITY, reqId, `CONC-RFQ-${Date.now()}`, costCtrl],
      );
      await client.query(
        `INSERT INTO rfq_lines (id, rfq_id, requisition_line_id, line_number, description, quantity)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 1, 'Conc RFQ line', 10)`,
        [rfqLineId, rfqId, lineId],
      );
      await client.query(
        `INSERT INTO rfq_suppliers (rfq_id, vendor_id, invited_by) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
        [rfqId, vendorId, costCtrl],
      );
      await client.query(
        `INSERT INTO supplier_quotations (
           id, legal_entity_id, rfq_id, vendor_id, supplier_quote_reference, quotation_status,
           subtotal_ex_vat, vat_amount, total_amount, entered_by
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, 'accepted_for_evaluation', 1000, 0, 1000, $6::uuid
         )`,
        [quoteId, LEGAL_ENTITY, rfqId, vendorId, `CQ-${Date.now()}`, costCtrl],
      );
      await client.query(
        `INSERT INTO supplier_quotation_lines (id, quotation_id, rfq_line_id, quoted_quantity, unit_price_ex_vat)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 10, 100)`,
        [quoteLineId, quoteId, rfqLineId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const workers = await Promise.all(
      [0, 1].map(async () => {
        const c = new pg.Client({ connectionString });
        await c.connect();
        return c;
      }),
    );
    try {
      const awards = await Promise.all(
        workers.map(async (c, idx) => {
          await c.query("BEGIN");
          try {
            await c.query("SET LOCAL role authenticated");
            await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: costCtrl, role: "authenticated" }),
            ]);
            const result = await c.query(
              `SELECT public.rpc_award_create_and_submit(
                 $1::uuid, $2::uuid,
                 jsonb_build_array(jsonb_build_object(
                   'rfq_line_id', $3::uuid,
                   'awarded_quantity', 8,
                   'unit_price_ex_vat', 100,
                   'quotation_line_id', $4::uuid
                 )),
                 $5, NULL, $6, NULL
               ) AS r`,
              [rfqId, quoteId, rfqLineId, quoteLineId, `conc-${idx}`, `idem-conc-award-${Date.now()}-${idx}`],
            );
            await c.query("COMMIT");
            return result.rows[0].r;
          } catch (error) {
            await c.query("ROLLBACK");
            return { ok: false, message: error.message };
          }
        }),
      );
      const successes = awards.filter((r) => r.ok);
      if (successes.length !== 1) {
        throw new Error(`Expected exactly one successful award, got ${successes.length}: ${JSON.stringify(awards)}`);
      }
    } finally {
      await Promise.all(workers.map((c) => c.end()));
      await client.query(`DELETE FROM sourcing_award_lines WHERE award_id IN (SELECT id FROM sourcing_awards WHERE rfq_id = $1)`, [rfqId]);
      await client.query(`DELETE FROM sourcing_awards WHERE rfq_id = $1`, [rfqId]);
      await client.query(`DELETE FROM supplier_quotation_lines WHERE quotation_id = $1`, [quoteId]);
      await client.query(`DELETE FROM supplier_quotations WHERE id = $1`, [quoteId]);
      await client.query(`DELETE FROM rfq_suppliers WHERE rfq_id = $1`, [rfqId]);
      await client.query(`DELETE FROM rfq_lines WHERE rfq_id = $1`, [rfqId]);
      await client.query(`DELETE FROM rfqs WHERE id = $1`, [rfqId]);
      await client.query(`DELETE FROM purchase_requisition_lines WHERE requisition_id = $1`, [reqId]);
      await client.query(`DELETE FROM purchase_requisitions WHERE id = $1`, [reqId]);
    }
  });

  await test("UM-CONC-03: concurrent payment requests cannot double-allocate invoice balance", async () => {
    const poId = crypto.randomUUID();
    const invId = crypto.randomUUID();
    const vendorId = "dddddddd-dddd-dddd-dddd-ddddddddd101";
    await client.query("BEGIN");
    try {
      const { rows: periods } = await client.query(
        `SELECT id FROM fiscal_periods WHERE fiscal_year_id = '77777777-7777-7777-7777-777777777701' AND period_number = 3 LIMIT 1`,
      );
      await client.query(
        `INSERT INTO purchase_orders (
           id, legal_entity_id, vendor_id, po_number, po_status, currency_code, total_amount, created_by
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'issued', 'SAR', 100, $5::uuid)`,
        [poId, LEGAL_ENTITY, vendorId, `PO-CONC-${Date.now()}`, FINANCE],
      );
      await client.query(
        `INSERT INTO supplier_invoices (
           id, legal_entity_id, purchase_order_id, vendor_id, invoice_number, invoice_date,
           gross_amount, subtotal_ex_vat, vat_amount, invoice_status, match_status, currency_code,
           fiscal_period_id, created_by, approved_by, approved_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, CURRENT_DATE,
           100, 100, 0, 'approved', 'matched', 'SAR', $6::uuid, $7::uuid, $8::uuid, NOW()
         )`,
        [invId, LEGAL_ENTITY, poId, vendorId, `INV-CONC-${Date.now()}`, periods[0].id, FINANCE, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2"],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }

    const workers = await Promise.all(
      [0, 1].map(async () => {
        const c = new pg.Client({ connectionString });
        await c.connect();
        return c;
      }),
    );
    try {
      const payments = await Promise.all(
        workers.map(async (c, idx) => {
          await c.query("BEGIN");
          try {
            await c.query("SET LOCAL role authenticated");
            await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
              JSON.stringify({ sub: FINANCE, role: "authenticated" }),
            ]);
            const result = await c.query(
              `SELECT public.rpc_payment_request_create(
                 $1::uuid, $2::uuid, 80::numeric, CURRENT_DATE + 7, $3, $4, NULL
               ) AS r`,
              [LEGAL_ENTITY, invId, `conc-pay-${idx}`, `idem-conc-pay-${Date.now()}-${idx}`],
            );
            await c.query("COMMIT");
            return result.rows[0].r;
          } catch (error) {
            await c.query("ROLLBACK");
            return { ok: false, message: error.message };
          }
        }),
      );
      const successes = payments.filter((r) => r.ok);
      if (successes.length !== 1) {
        throw new Error(`Expected exactly one payment allocation, got ${successes.length}: ${JSON.stringify(payments)}`);
      }
    } finally {
      await Promise.all(workers.map((c) => c.end()));
      await client.query(`DELETE FROM payment_requests WHERE supplier_invoice_id = $1`, [invId]);
      await client.query(`DELETE FROM supplier_invoices WHERE id = $1`, [invId]);
      await client.query(`DELETE FROM purchase_orders WHERE id = $1`, [poId]);
    }
  });

  console.log(`\nConcurrency tests: ${passed} passed, ${failed} failed`);

  const artifactDir = fileURLToPath(new URL("../artifacts/financial-transactions/", import.meta.url));
  await mkdir(artifactDir, { recursive: true });
  const artifactPath = fileURLToPath(new URL("../artifacts/financial-transactions/concurrency-evidence.json", import.meta.url));
  await writeFile(
    artifactPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        passed,
        failed,
        total: passed + failed,
        probes: [
          "COD-H-003 audit append-only triggers",
          "COD-H-004 approved budget immutability",
          "COD-H-010 idempotent reversal",
          "DTA-M-001 bounded legacy fixture allocation debt",
          "COD-M-005 cross-tenant allocation rejection",
          "UM-CONC-01 PO number uniqueness",
          "UM-CONC-02 award overconsume blocked",
          "UM-CONC-03 payment double allocate blocked",
        ],
      },
      null,
      2,
    ),
  );

  await client.end();
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
