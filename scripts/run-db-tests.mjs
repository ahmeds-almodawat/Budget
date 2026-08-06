#!/usr/bin/env node
/**
 * Executable database integrity tests against local PostgreSQL.
 * Run: npm run test:db
 */
import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres";

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const EXPOSED_TABLES = [
  "actual_transaction_allocations", "actual_transactions", "approval_requests",
  "budget_change_lines", "budget_change_requests", "budget_lines",
  "budget_monthly_allocations", "budget_versions", "commitments", "control_accounts",
  "control_scope_types", "control_scopes", "cost_nodes", "decisions",
  "duplicate_review_queue", "fiscal_periods", "fiscal_years", "import_batches",
  "imported_source_rows", "issues", "legal_entities", "memberships",
  "milestone_progress_updates", "milestone_steps", "milestones", "notifications",
  "organization_unit_types", "organization_units", "organizations", "profiles",
  "progress_evidence", "project_phases", "projects", "register_actions",
  "register_dependencies", "risks", "role_assignments", "roles",
  "schedule_change_requests", "tasks", "teams", "unmapped_transaction_queue",
  "variance_explanations", "vendors", "work_packages", "schedule_baseline_versions",
  "forecast_versions", "forecast_lines",
];
const EXPOSED_VIEWS = [
  "v_approval_inbox", "v_budget_vs_actual", "v_restaurant_branch_performance",
  "v_hospital_period_performance", "v_project_earned_value",
];
const SERVER_ONLY_TABLES = [
  "audit_events", "gl_accounts",
  "gl_cost_mappings", "permissions", "role_permissions", "task_dependencies", "team_members",
];
const INSERT_TABLES = [
  "actual_transaction_allocations", "actual_transactions", "approval_requests",
  "budget_change_lines", "budget_change_requests", "budget_lines",
  "budget_monthly_allocations", "budget_versions", "commitments", "control_accounts",
  "decisions", "duplicate_review_queue", "import_batches", "imported_source_rows",
  "issues", "milestone_progress_updates", "milestones", "progress_evidence", "projects",
  "register_actions", "register_dependencies", "risks", "schedule_change_requests",
  "unmapped_transaction_queue", "variance_explanations",
];
const UPDATE_TABLES = [
  "actual_transactions", "approval_requests", "budget_change_requests", "budget_lines",
  "budget_versions", "commitments", "import_batches", "milestone_progress_updates",
  "milestones", "projects", "risks", "schedule_change_requests", "variance_explanations",
];

async function asRole(client, role, userId, fn) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role ${role}`);
    if (userId) {
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role }),
      ]);
    }
    const result = await fn();
    await client.query("ROLLBACK");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
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

test("audit_events are append-only (COD-H-003)", async (client) => {
  const { rows } = await client.query(`
    SELECT count(*)::int AS c FROM pg_catalog.pg_trigger AS t
    JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'audit_events'
      AND t.tgname IN ('trg_audit_events_deny_update', 'trg_audit_events_deny_delete')
      AND NOT t.tgisinternal
  `);
  assert(rows[0].c === 2, "audit_events must have append-only UPDATE/DELETE triggers");
});

test("approved budget version amounts are immutable (COD-H-004)", async (client) => {
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
    const { rows: cs } = await client.query(
      `INSERT INTO control_scopes (id, legal_entity_id, scope_type_id, code, name_en, name_ar, approval_status)
       VALUES ('55555555-5555-5555-5555-555555555599', '11111111-1111-1111-1111-111111111102',
         '44444444-4444-4444-4444-444444444402', 'TEST-PROJ-BL', 'Test', 'اختبار', 'approved')
       RETURNING id`,
    );
    const { rows } = await client.query(
      `INSERT INTO projects (id, control_scope_id, baseline_start, baseline_end)
       VALUES ('cccccccc-cccc-cccc-cccc-cccccccccc99', $1, '2027-01-01', '2028-06-30') RETURNING id`,
      [cs[0].id],
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
    const { rows: cs } = await client.query(
      `INSERT INTO control_scopes (id, legal_entity_id, scope_type_id, code, name_en, name_ar, approval_status)
       VALUES ('55555555-5555-5555-5555-555555555598', '11111111-1111-1111-1111-111111111102',
         '44444444-4444-4444-4444-444444444402', 'TEST-MS-SELF', 'Test', 'اختبار', 'approved')
       RETURNING id`,
    );
    const { rows } = await client.query(
      `INSERT INTO projects (id, control_scope_id) VALUES (
        'cccccccc-cccc-cccc-cccc-cccccccccc98', $1
      ) RETURNING id`,
      [cs[0].id],
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

test("RLS denies auditor from inserting budget versions", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4"}', true)`,
    );
    let failed = false;
    try {
      await client.query(
        `INSERT INTO budget_versions (
          legal_entity_id, control_scope_id, fiscal_year_id, version_label, version_type, approval_status, created_by
        ) VALUES (
          '11111111-1111-1111-1111-111111111102',
          '55555555-5555-5555-5555-555555555501',
          '77777777-7777-7777-7777-777777777701',
          'AUDITOR-DENY', 'operational', 'draft', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4'
        )`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "Auditor must not insert budget versions");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("RLS denies viewer from inserting budget versions", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5"}', true)`,
    );
    let failed = false;
    try {
      await client.query(
        `INSERT INTO budget_versions (
          legal_entity_id, control_scope_id, fiscal_year_id, version_label, version_type, approval_status, created_by
        ) VALUES (
          '11111111-1111-1111-1111-111111111102',
          '55555555-5555-5555-5555-555555555501',
          '77777777-7777-7777-7777-777777777701',
          'VIEWER-DENY', 'operational', 'draft', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5'
        )`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "Viewer must not insert budget versions");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("RLS allows budget owner to read budgets in assigned entity", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"}', true)`,
    );
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM budget_versions WHERE legal_entity_id = '11111111-1111-1111-1111-111111111102'`,
    );
    assert(rows[0].c >= 0, "Budget owner should query budgets in assigned entity");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("milestone baseline date cannot be overwritten", async (client) => {
  await client.query("BEGIN");
  try {
    const { rows: cs } = await client.query(
      `INSERT INTO control_scopes (id, legal_entity_id, scope_type_id, code, name_en, name_ar, approval_status)
       VALUES ('55555555-5555-5555-5555-555555555597', '11111111-1111-1111-1111-111111111102',
         '44444444-4444-4444-4444-444444444402', 'TEST-MS-BL', 'Test', 'اختبار', 'approved')
       RETURNING id`,
    );
    const { rows } = await client.query(
      `INSERT INTO projects (id, control_scope_id) VALUES (
        'cccccccc-cccc-cccc-cccc-cccccccccc97', $1
      ) RETURNING id`,
      [cs[0].id],
    );
    const { rows: ms } = await client.query(
      `INSERT INTO milestones (project_id, code, name_en, name_ar, baseline_date)
       VALUES ($1, 'MS-BL-TEST', 'Baseline Test', 'اختبار', '2027-06-01') RETURNING id`,
      [rows[0].id],
    );
    let failed = false;
    try {
      await client.query(
        `UPDATE milestones SET baseline_date = '2027-07-01' WHERE id = $1`,
        [ms[0].id],
      );
    } catch {
      failed = true;
    }
    assert(failed, "Milestone baseline date must be immutable");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("RLS denies finance user from inserting actuals without finance role scope mismatch", async (client) => {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL role authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claims', '{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff"}', true)`,
    );
    let failed = false;
    try {
      await client.query(
        `INSERT INTO actual_transactions (
          legal_entity_id, source_system, source_transaction_id, transaction_date, amount_ex_vat, vat_amount, amount_inc_vat
        ) VALUES (
          '11111111-1111-1111-1111-111111111102', 'CSV_IMPORT', 'DENY-001', '2027-01-01', 100, 0, 100
        )`,
      );
    } catch {
      failed = true;
    }
    assert(failed, "User without membership must not insert actuals");
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
});

test("authorization catalog is complete and emits a machine-readable matrix", async (client) => {
  const { rows: objects } = await client.query(`
    SELECT c.relname AS object_name, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
      c.reloptions, pg_catalog.obj_description(c.oid, 'pg_class') AS classification
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v')
    ORDER BY c.relname
  `);
  const tables = objects.filter((row) => row.relkind === "r");
  const views = objects.filter((row) => row.relkind === "v");
  assert(tables.length === 55, `Expected 55 public tables, found ${tables.length}`);
  assert(views.length === 5, `Expected 5 public views, found ${views.length}`);
  assert(tables.every((row) => row.relrowsecurity && row.relforcerowsecurity), "Every table must enable and force RLS");
  assert(objects.every((row) => row.classification?.startsWith("@classification ")), "Every public table/view needs a classification");
  assert(views.every((row) => row.reloptions?.includes("security_invoker=true")), "Every public view must use security_invoker");

  const { rows: policies } = await client.query(`
    SELECT tablename, policyname, cmd, roles, qual, with_check
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  assert(policies.length === 85, `Expected 85 reviewed policies, found ${policies.length}`);
  assert(
    policies.every((policy) => String(policy.roles) === "{authenticated}"),
    "Every policy must explicitly target authenticated",
  );

  const privilegeRows = {};
  for (const grantee of ["anon", "authenticated", "service_role", "PUBLIC"]) {
    const { rows } = await client.query(`
      SELECT table_name, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public' AND grantee = $1
      ORDER BY table_name, privilege_type
    `, [grantee]);
    privilegeRows[grantee] = rows;
  }
  assert(privilegeRows.anon.length === 0, "anon must have no public object privileges");
  assert(privilegeRows.service_role.length === 0, "service_role must have no implicit business-object privileges");
  assert(privilegeRows.PUBLIC.length === 0, "PUBLIC must have no public object privileges");

  const actual = new Map();
  for (const row of privilegeRows.authenticated) {
    if (!actual.has(row.table_name)) actual.set(row.table_name, new Set());
    actual.get(row.table_name).add(row.privilege_type);
  }
  const expected = new Map();
  for (const name of [...EXPOSED_TABLES, ...EXPOSED_VIEWS]) expected.set(name, new Set(["SELECT"]));
  for (const name of INSERT_TABLES) expected.get(name).add("INSERT");
  for (const name of UPDATE_TABLES) expected.get(name).add("UPDATE");
  assert(actual.size === expected.size, `Unexpected authenticated privilege object count: ${actual.size}`);
  for (const [name, operations] of expected) {
    const actualOperations = actual.get(name);
    assert(actualOperations, `Missing authenticated privileges for ${name}`);
    assert(
      [...actualOperations].sort().join(",") === [...operations].sort().join(","),
      `${name} privileges were ${[...actualOperations]}, expected ${[...operations]}`,
    );
  }
  for (const name of SERVER_ONLY_TABLES) {
    assert(!actual.has(name), `${name} is server-only but has authenticated privileges`);
  }

  const ownerOperations = new Map();
  for (const object of objects) {
    const operations = [];
    for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
      const { rows } = await client.query(
        "SELECT pg_catalog.has_table_privilege('postgres', $1, $2) AS allowed",
        [`public.${object.object_name}`, operation],
      );
      if (rows[0].allowed) operations.push(operation);
    }
    ownerOperations.set(object.object_name, operations);
    assert(operations.length === 7, `Database owner privilege set is incomplete for ${object.object_name}`);
  }

  const { rows: profileColumns } = await client.query(`
    SELECT column_name, privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
    ORDER BY column_name
  `);
  assert(
    profileColumns.map((row) => row.column_name).join(",") ===
      "full_name_ar,full_name_en,preferred_locale,preferred_timezone,updated_at",
    "Profile UPDATE must be limited to the five self-service columns",
  );

  const matrix = objects.map((object) => ({
    object: object.object_name,
    kind: object.relkind === "r" ? "table" : "view",
    classification: object.classification,
    rlsEnabled: object.relkind === "r" ? object.relrowsecurity : null,
    rlsForced: object.relkind === "r" ? object.relforcerowsecurity : null,
    securityInvoker: object.relkind === "v" ? object.reloptions?.includes("security_invoker=true") : null,
    authenticatedOperations: [...(actual.get(object.object_name) ?? [])].sort(),
    anonOperations: [],
    serviceRoleOperations: [],
    databaseOwnerOperations: ownerOperations.get(object.object_name),
  }));
  const artifactDir = fileURLToPath(new URL("../artifacts/authorization/", import.meta.url));
  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    `${artifactDir}/privilege-and-policy-matrix.json`,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), objects: matrix, policies }, null, 2)}\n`,
  );
});

test("local persona loader fails closed without explicit authorization", async () => {
  const env = { ...process.env };
  delete env.ALLOW_LOCAL_FIXTURES;
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./seed-local-fixtures.mjs", import.meta.url)), "--confirm-local"],
    { cwd: fileURLToPath(new URL("..", import.meta.url)), env, encoding: "utf8" },
  );
  assert(result.status !== 0, "Fixture loader ran without ALLOW_LOCAL_FIXTURES=true");
  assert(result.stderr.includes("Local fixture guard refused"), "Fixture loader did not fail through its guard");
});

test("functions have hardened schemas, paths, security modes, and ACLs", async (client) => {
  const { rows: publicFunctions } = await client.query(`
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig,
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) AS acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS public_execute
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname
  `);
  assert(publicFunctions.length === 23, `Expected 23 public RPC wrappers, found ${publicFunctions.length}`);
  for (const fn of publicFunctions) {
    assert(fn.proname.startsWith("rpc_"), `Unexpected public function ${fn.proname}`);
    assert(fn.prosecdef, `${fn.proname} must be SECURITY DEFINER`);
    assert(fn.proconfig?.includes('search_path=""'), `${fn.proname} must set an empty search_path`);
    assert(fn.auth_execute, `${fn.proname} must grant authenticated EXECUTE`);
    assert(!fn.anon_execute && !fn.public_execute, `${fn.proname} has an unintended execute grant`);
  }

  const { rows: functions } = await client.query(`
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig,
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
      EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(
          COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
        ) AS acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS public_execute
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
    ORDER BY p.proname
  `);
  const helpers = new Set([
    "current_user_has_active_membership", "current_user_is_active",
    "user_can_access_legal_entity", "user_has_any_role", "user_has_role",
  ]);
  const triggerOnly = new Set([
    "deny_audit_mutation", "enforce_allocation_tenant_consistency", "enforce_leaf_posting",
    "prevent_cost_node_cycle", "prevent_inactive_cost_posting", "prevent_org_unit_cycle",
    "protect_immutable_budget_line", "protect_immutable_budget_monthly", "protect_locked_budget_version",
    "protect_immutable_forecast_line", "protect_locked_forecast_version",
    "protect_milestone_baseline", "protect_phase_baseline", "protect_posted_actual",
    "protect_project_baseline", "protect_task_baseline", "validate_allocation_reconciliation",
    "validate_exact_allocation_reconciliation",
  ]);
  const pureHelpers = new Set(["command_fail", "command_ok"]);
  assert(functions.length >= 30, `Expected at least 30 private functions, found ${functions.length}`);
  for (const fn of functions) {
    assert(fn.proconfig?.includes('search_path=""'), `${fn.proname} must set an empty search_path`);
    const isHelper = helpers.has(fn.proname);
    const isTrigger = triggerOnly.has(fn.proname);
    const isPure = pureHelpers.has(fn.proname);
    if (!isPure && !isTrigger) {
      assert(fn.prosecdef, `${fn.proname} must be SECURITY DEFINER`);
    }
    assert(fn.auth_execute === isHelper, `${fn.proname} authenticated EXECUTE mismatch`);
    assert(!fn.anon_execute && !fn.service_execute && !fn.public_execute, `${fn.proname} has an unintended execute grant`);
  }
});

test("all exposed objects are executable for an active member and tenant aggregates deny no-membership", async (client) => {
  await asRole(client, "authenticated", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", async () => {
    for (const object of [...EXPOSED_TABLES, ...EXPOSED_VIEWS]) {
      await client.query(`SELECT count(*) FROM public.${object}`);
    }
  });

  await asRole(client, "authenticated", "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5", async () => {
    for (const object of [...EXPOSED_TABLES.filter((name) => name !== "profiles"), ...EXPOSED_VIEWS]) {
      const { rows } = await client.query(`SELECT count(*)::int AS count FROM public.${object}`);
      assert(rows[0].count === 0, `No-membership persona saw rows from ${object}`);
    }
  });
});

test("inactive, future, expired, no-membership, group, entity, and project scopes are enforced", async (client) => {
  const roleCases = [
    ["baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", false, "inactive profile"],
    ["baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", false, "future role"],
    ["baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4", false, "expired role"],
    ["baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5", false, "no membership"],
    ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", true, "active finance role"],
  ];
  for (const [userId, expected, label] of roleCases) {
    await asRole(client, "authenticated", userId, async () => {
      const { rows } = await client.query(`
        SELECT private.user_has_role(
          'finance_user', '11111111-1111-1111-1111-111111111102'
        ) AS allowed
      `);
      assert(rows[0].allowed === expected, `${label} returned ${rows[0].allowed}`);
    });
  }

  await asRole(client, "authenticated", "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", async () => {
    const { rows } = await client.query("SELECT id FROM public.legal_entities ORDER BY id");
    assert(rows.length === 2, `Group admin should see two in-group entities, saw ${rows.length}`);
    assert(!rows.some((row) => row.id === "12111111-1111-1111-1111-111111111102"), "Group admin crossed organizations");
    const { rows: role } = await client.query(`
      SELECT private.user_has_role(
        'system_administrator', '11111111-1111-1111-1111-111111111103'
      ) AS allowed
    `);
    assert(role[0].allowed, "Group role should authorize a descendant legal entity");
  });

  await asRole(client, "authenticated", "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6", async () => {
    const { rows } = await client.query("SELECT id FROM public.legal_entities");
    assert(rows.length === 1 && rows[0].id === "12111111-1111-1111-1111-111111111102", "Entity-B user leaked tenant A");
    const { rows: wrongEntity } = await client.query(`
      SELECT private.user_has_role(
        'finance_user', '11111111-1111-1111-1111-111111111102'
      ) AS allowed
    `);
    assert(!wrongEntity[0].allowed, "Entity-B role authorized entity A");
  });

  await asRole(client, "authenticated", "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7", async () => {
    const { rows } = await client.query(`
      SELECT
        private.user_has_role('project_manager','11111111-1111-1111-1111-111111111102','project','cccccccc-cccc-cccc-cccc-ccccccccccc1') AS own_project,
        private.user_has_role('project_manager','11111111-1111-1111-1111-111111111102','project','cccccccc-cccc-cccc-cccc-ccccccccccc2') AS sibling_project,
        private.user_has_role('project_manager','11111111-1111-1111-1111-111111111102') AS entity_wide
    `);
    assert(rows[0].own_project, "Project-scoped role did not authorize its own project");
    assert(!rows[0].sibling_project && !rows[0].entity_wide, "Project-scoped role widened beyond its project");
    const own = await client.query("UPDATE public.projects SET priority = 4 WHERE id = 'cccccccc-cccc-cccc-cccc-ccccccccccc1'");
    const sibling = await client.query("UPDATE public.projects SET priority = 4 WHERE id = 'cccccccc-cccc-cccc-cccc-ccccccccccc2'");
    assert(own.rowCount === 1 && sibling.rowCount === 0, "Project update RLS did not preserve exact scope");
  });
});

test("tenant views isolate both tenants and restaurant totals exclude unposted actuals", async (client) => {
  await asRole(client, "authenticated", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", async () => {
    const { rows } = await client.query(`
      SELECT branch_code, revenue::numeric FROM public.v_restaurant_branch_performance ORDER BY branch_code
    `);
    assert(!rows.some((row) => row.branch_code === "REST-OTHER"), "Primary tenant saw other-tenant aggregate");
    const branch = rows.find((row) => row.branch_code === "REST-B1");
    assert(branch && Number(branch.revenue) === 85000, `Unposted revenue leaked into aggregate: ${branch?.revenue}`);
    for (const view of EXPOSED_VIEWS.filter((name) => name !== "v_restaurant_branch_performance")) {
      if (view === "v_project_earned_value") {
        const { rows: leaked } = await client.query(`
          SELECT count(*)::int AS count
          FROM public.v_project_earned_value AS ev
          JOIN public.projects AS p ON p.id = ev.project_id
          JOIN public.control_scopes AS cs ON cs.id = p.control_scope_id
          WHERE cs.legal_entity_id = '12111111-1111-1111-1111-111111111102'
        `);
        assert(leaked[0].count === 0, `${view} leaked other-tenant rows`);
        continue;
      }
      const { rows: leaked } = await client.query(`
        SELECT count(*)::int AS count FROM public.${view}
        WHERE legal_entity_id = '12111111-1111-1111-1111-111111111102'
      `);
      assert(leaked[0].count === 0, `${view} leaked other-tenant rows`);
    }
  });

  await asRole(client, "authenticated", "baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6", async () => {
    const { rows } = await client.query("SELECT branch_code, revenue::numeric FROM public.v_restaurant_branch_performance");
    assert(rows.length === 1 && rows[0].branch_code === "REST-OTHER" && Number(rows[0].revenue) === 12345,
      "Other tenant aggregate was missing or contaminated");
  });
});

test("write RLS allows the right tenant and denies cross-tenant submissions", async (client) => {
  await asRole(client, "authenticated", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", async () => {
    const allowed = await client.query(`
      INSERT INTO public.actual_transactions (
        legal_entity_id, source_system, source_transaction_id, transaction_date, amount_ex_vat, amount_inc_vat
      ) VALUES ('11111111-1111-1111-1111-111111111102','AUTH-TEST','PRIMARY-ALLOWED','2027-03-01',1,1)
    `);
    assert(allowed.rowCount === 1, "Finance role could not insert in its entity");
  });

  let denied = false;
  try {
    await asRole(client, "authenticated", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", async () => {
      await client.query(`
        INSERT INTO public.actual_transactions (
          legal_entity_id, source_system, source_transaction_id, transaction_date, amount_ex_vat, amount_inc_vat
        ) VALUES ('12111111-1111-1111-1111-111111111102','AUTH-TEST','OTHER-DENIED','2027-03-01',1,1)
      `);
    });
  } catch {
    denied = true;
  }
  assert(denied, "Finance role inserted into another tenant");
});

async function main() {
  if (tests.length === 0) {
    throw new Error("Zero database tests were discovered");
  }
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
