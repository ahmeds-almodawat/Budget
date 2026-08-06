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
        `SELECT id FROM budget_versions WHERE approval_status = 'locked' LIMIT 1`,
      );
      if (rows.length === 0) throw new Error("No locked budget version in seed data");
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
      const { rows: originals } = await client.query(
        `SELECT id FROM actual_transactions
         WHERE legal_entity_id = $1 AND is_posted = true AND is_reversal = false
         AND reverses_transaction_id IS NULL LIMIT 1`,
        [LEGAL_ENTITY],
      );
      if (originals.length === 0) throw new Error("No posted original transaction found");
      const origId = originals[0].id;
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
