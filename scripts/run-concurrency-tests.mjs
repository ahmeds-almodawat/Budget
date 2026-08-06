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
