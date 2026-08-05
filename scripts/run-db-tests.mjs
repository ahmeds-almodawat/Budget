#!/usr/bin/env node
/**
 * Executable database integrity tests against local PostgreSQL.
 * Run: npm run test:db
 */
import pg from "pg";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test("organization unit cannot be its own parent", async (client) => {
  await client.query("BEGIN");
  try {
    let failed = false;
    try {
      await client.query(
        `UPDATE organization_units SET parent_id = id WHERE code = 'PHARM'`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "Self-parent should be rejected");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("organization hierarchy cycle is rejected", async (client) => {
  await client.query("BEGIN");
  try {
    let failed = false;
    try {
      await client.query(
        `UPDATE organization_units SET parent_id = '33333333-3333-3333-3333-333333333301'
         WHERE id = '33333333-3333-3333-3333-333333333303'`,
      );
      await client.query(
        `UPDATE organization_units SET parent_id = '33333333-3333-3333-3333-333333333303'
         WHERE id = '33333333-3333-3333-3333-333333333301'`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "Cycle should be rejected");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("non-leaf cost node cannot allow posting", async (client) => {
  await client.query("BEGIN");
  try {
    let failed = false;
    try {
      await client.query(
        `UPDATE cost_nodes SET allows_posting = true WHERE code = 'MED-SUP'`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "Parent node posting should be rejected");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("locked budget version amounts are immutable", async (client) => {
  const { rows } = await client.query(
    `INSERT INTO budget_versions (
      id, legal_entity_id, control_scope_id, fiscal_year_id, version_label, version_type,
      approval_status, original_approved_amount, locked_at
    ) VALUES (
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      '11111111-1111-1111-1111-111111111102',
      '55555555-5555-5555-5555-555555555501',
      '77777777-7777-7777-7777-777777777701',
      'TEST-LOCK', 'operational', 'locked', 1000, NOW()
    ) RETURNING id`,
  );
  let failed = false;
  try {
    await client.query(
      `UPDATE budget_versions SET original_approved_amount = 2000 WHERE id = $1`,
      [rows[0].id],
    );
  } catch {
    failed = true;
  }
  assert(failed, "Locked budget original amount must be immutable");
  await client.query(`DELETE FROM budget_versions WHERE id = $1`, [rows[0].id]);
});

test("allocation total cannot exceed source transaction", async (client) => {
  await client.query("BEGIN");
  try {
    const { rows: txnRows } = await client.query(
      `INSERT INTO actual_transactions (
        legal_entity_id, source_system, source_transaction_id, transaction_date,
        amount_ex_vat, amount_inc_vat
      ) VALUES (
        '11111111-1111-1111-1111-111111111102', 'TEST', 'TXN-ALLOC-1', '2027-03-15', 100, 100
      ) RETURNING id`,
    );
    let failed = false;
    try {
      await client.query(
        `INSERT INTO actual_transaction_allocations (
          actual_transaction_id, organization_unit_id, cost_node_id, allocation_amount, allocation_percent
        ) VALUES ($1, '33333333-3333-3333-3333-333333333305', '66666666-6666-6666-6666-666666666603', 150, 150)`,
        [txnRows[0].id],
      );
      await client.query("COMMIT");
    } catch {
      failed = true;
      await client.query("ROLLBACK");
    }
    assert(failed, "Over-allocation should be rejected");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("duplicate source transaction id is rejected", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO actual_transactions (
        legal_entity_id, source_system, source_transaction_id, transaction_date, amount_ex_vat, amount_inc_vat
      ) VALUES ('11111111-1111-1111-1111-111111111102', 'TEST', 'TXN-DUP-1', '2027-03-01', 10, 10)`,
    );
    let failed = false;
    try {
      await client.query(
        `INSERT INTO actual_transactions (
          legal_entity_id, source_system, source_transaction_id, transaction_date, amount_ex_vat, amount_inc_vat
        ) VALUES ('11111111-1111-1111-1111-111111111102', 'TEST', 'TXN-DUP-1', '2027-03-02', 20, 20)`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "Duplicate source transaction should be rejected");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("project baseline dates cannot be overwritten", async (client) => {
  await client.query("BEGIN");
  try {
    const { rows } = await client.query(
      `INSERT INTO projects (
        id, control_scope_id, baseline_start, baseline_end
      ) VALUES (
        'cccccccc-cccc-cccc-cccc-ccccccccccc1',
        '55555555-5555-5555-5555-555555555503',
        '2027-01-01', '2028-06-30'
      ) RETURNING id`,
    );
    let failed = false;
    try {
      await client.query(
        `UPDATE projects SET baseline_start = '2027-02-01' WHERE id = $1`,
        [rows[0].id],
      );
    } catch {
      failed = true;
    }
    assert(failed, "Baseline start must be immutable");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("milestone reporter cannot verify own progress", async (client) => {
  await client.query("BEGIN");
  try {
    const { rows } = await client.query(
      `INSERT INTO projects (id, control_scope_id) VALUES (
        'cccccccc-cccc-cccc-cccc-ccccccccccc2', '55555555-5555-5555-5555-555555555503'
      ) RETURNING id`,
    );
    const { rows: ms } = await client.query(
      `INSERT INTO milestones (project_id, code, name_en, name_ar)
       VALUES ($1, 'MS-TEST', 'Test', 'اختبار') RETURNING id`,
      [rows[0].id],
    );
    let failed = false;
    try {
      await client.query(
        `INSERT INTO milestone_progress_updates (
          milestone_id, reported_by, reported_progress, verified_by, verified_progress
        ) VALUES ($1, $2, 50, $2, 50)`,
        [ms[0].id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6"],
      );
    } catch {
      failed = true;
    }
    assert(failed, "Self-verified progress should be rejected");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("RLS blocks cross-entity read for authenticated user without membership", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff"}', true)`,
    );
    const { rows } = await client.query(`SELECT count(*)::int AS c FROM legal_entities`);
    assert(rows[0].c === 0, "User without membership must not read legal entities");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("RLS allows member to read own legal entity", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"}', true)`,
    );
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM legal_entities WHERE id = '11111111-1111-1111-1111-111111111102'`,
    );
    assert(rows[0].c === 1, "Finance member should read assigned legal entity");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const t of tests) {
    try {
      await t.fn(client);
      passed += 1;
      console.log(`✓ ${t.name}`);
    } catch (error) {
      failed += 1;
      failures.push({ name: t.name, error });
      console.error(`✗ ${t.name}: ${error.message}`);
    }
  }

  await client.end();
  console.log(`\nDatabase tests: ${passed} passed, ${failed} failed, ${tests.length} total`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
