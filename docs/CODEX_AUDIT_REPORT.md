# Codex independent repository audit

**Repository:** `ahmeds-almodawat/Budget`
**Pull request:** [#1 — `main` <- `feature/enterprise-control-platform`](https://github.com/ahmeds-almodawat/Budget/pull/1)
**Audited head:** `97049dfcf7da11879fa7d6e761af6e2563e5e918`
**Base:** `7d754c837fa5fcefc6597cc884c019169f170ce2`
**Audit date:** 2026-08-05 (Asia/Riyadh)
**Mode:** review only; local Supabase only; no production access; no correction, commit, push, merge, deployment, or non-local migration

> **Remediation addendum — 2026-08-05:** The report below is preserved as the
> evidence-based state of audited SHA `97049df`. On branch
> `fix/audit-p0-authorization`, remediation has been implemented for COD-C-001,
> COD-C-002, COD-C-003, COD-H-001, COD-H-002, and COD-M-001. COD-H-014 remains
> pending until required CI passes at the exact PR head. Fresh replay now creates
> zero Auth users; 54/54 public tables enable and force RLS; all 84 effective
> policies explicitly target `authenticated`; all three public views are
> `security_invoker`; and no function remains in `public`. These states are
> covered by the machine-generated privilege/policy matrix and 22 database
> tests. The final local sequence passed 29/29 Vitest, 22/22 database, 17/17
> Playwright (zero retries), and the 61-route build on first attempt; exact-head
> GitHub Actions remains pending. All financial, audit, import, concurrency,
> reporting, export, and
> scaffold findings outside that authorized scope remain unchanged and continue
> to block production. See `REMEDIATION_EVIDENCE.md` for current evidence.

## 1. Executive conclusion

**Conclusion: the branch is neither merge-ready nor production-ready.** The implementation has useful foundations—typed financial arithmetic, a broad schema, many tenant-aware policies, baseline-overwrite triggers, session-backed server actions, bilingual routing, and a reproducible local database reset—but those foundations do not yet form an enforceable enterprise control system.

The audit found three critical conditions:

1. A clean database has no table privileges for `authenticated`, so the implemented application and tests cannot use the tables at all. This is independently reproduced locally and in the current Linux CI runs.
2. The two views which *are* granted to `authenticated` are owner-executed views without `security_invoker`; rollback-only probes proved that an authenticated user with no membership can read restaurant data and approval records from another legal entity.
3. Ordinary migrations create fixed-password test users. Nothing in the migration chain prevents those credentials from being created by a production migration run.

Further high-risk defects affect role scoping, budget immutability and approval transitions, change control, import atomicity and segregation, actual allocation integrity, reversals, audit authenticity, project EVM inputs, financial reporting, export safety, and progress/schedule concurrency. The current PR is `UNSTABLE`; both current GitHub checks fail. Completion reports claiming green tests and complete modules are not reliable evidence for this head.

### Audit disposition

| Decision | Recommendation | Basis |
|---|---|---|
| Merge | **DO NOT MERGE** | Critical tenant/privacy and migration defects; clean-run unit, DB, and E2E failures; current required CI is red. |
| Production | **NO-GO** | Known credentials in migrations, cross-tenant view leakage, incomplete financial/audit controls, unfinished modules, and absent production operating controls. |
| Pilot with real financial data | **NO-GO** | Reporting and EVM inputs can materially misstate budget, actual, forecast, and project performance. |
| Local design/demo | **Conditionally usable** | Only as non-production sample software, after acknowledging failing data access and incomplete modules. |

### Finding count

| Severity | Count | Merge blockers | Production blockers |
|---|---:|---:|---:|
| Critical | 3 | 3 | 3 |
| High | 14 | 14 | 14 |
| Medium | 11 | 5 | 11 |
| Low | 2 | 0 | 0 |
| **Total** | **30** | **22** | **28** |

## 2. Scope and method

The final snapshot changes 118 files (`9,171` insertions, `458` deletions) from `main`. The audit read all 24 repository Markdown documents, all 16 migrations, the effective 75-policy database catalog (76 `CREATE POLICY` statements in source because one policy is dropped and recreated), every public table/view, all SQL functions and triggers, all server actions, authentication/context/permission code, repositories, calculations, imports, approvals, project progress, audit, reports/exports, tests, GitHub Actions, the PR diff, and the complete final tree.

Evidence sources were:

- source and documentation at the audited SHA;
- a clean local `npm ci`, local Supabase startup, and full database reset;
- live PostgreSQL catalog queries for RLS, policies, view options, grants, functions, indexes, and foreign keys;
- four rollback-only authorization probes plus one effective-date probe; every probe ended in `ROLLBACK` and left no persisted data or grant changes;
- first-attempt command results, with no retries;
- the current PR and GitHub Actions state.

The branch advanced from `ce1fc16` to `97049df` while review was in progress. The inventory and verification were re-baselined to `97049df`; this report does not attribute those concurrent changes to the auditor.

### Interpretation terms

- **Implementation defect:** shipped code or schema does not enforce the claimed behavior.
- **Test deficiency:** evidence can pass or miss a material failure.
- **Documentation mismatch:** documentation claims differ from executable state.
- **Environmental instability:** a tool/platform-sensitive result is not stable on a clean or alternate environment.
- **Intentionally deferred feature:** documentation acknowledges the function is partial or scaffolded; it still blocks production if required by the stated product scope.

## 3. Critical and high findings

### COD-C-001 — Clean databases grant no table access to authenticated users

**Remediation status (2026-08-05): implemented on the remediation branch; final PR CI pending.** Explicit operation grants now match the generated privilege matrix; anon, PUBLIC, and service-role business-object grants are empty.

| Field | Detail |
|---|---|
| Severity | **Critical** |
| Classification | Implementation defect; environmental compatibility defect |
| Affected file and line | All table-creating migrations; the migration set contains no table/default-privilege grant. The only data grants are the view grants at `20260805121400_approvals_workspace.sql:109` and `20260805121500_restaurant_operational.sql:34`. |
| Database object | All 54 public tables |
| Exact failure mode | After a clean reset, `anon` and `authenticated` have no `SELECT`, `INSERT`, `UPDATE`, or `DELETE` privilege on any public table. RLS is therefore not merely restrictive: table access fails before RLS can authorize intended users. |
| Exploit or misstatement scenario | Operational users cannot load scopes, budgets, actuals, approvals, or projects; attempted workflows stop with database permission errors. Emergency manual workarounds or broad ad-hoc grants would immediately expose the 14 tables without RLS and the overly broad policies in this report. |
| Evidence | Live catalog: 54/54 tables have no authenticated DML privilege. First run: `npm run test` failed 2 tests with `permission denied for table budget_versions` and `control_scopes`; `npm run test:db` failed 3 tests at legal-entity/budget privileges; E2E failed 6/17. The current PR and push [CI runs](https://github.com/ahmeds-almodawat/Budget/actions/runs/31041566204) fail at the same unit/integration step. Supabase's [2026 Data API default-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) makes explicit grants necessary, so relying on historical implicit grants is not safe. |
| Recommended correction | Add explicit, least-privilege schema/table/sequence/function grants and default privileges in a reviewed migration. Grant only objects/operations with complete RLS; keep internal tables in a private schema. Do not solve this with `GRANT ALL ON ALL TABLES`. |
| Required regression test | From an empty local database, assert the exact privilege matrix for `anon`, `authenticated`, and service roles, then execute one allowed and one denied operation for every policy-bearing table. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-C-002 — Granted views bypass RLS and leak cross-tenant data

**Remediation status (2026-08-05): implemented on the remediation branch; final PR CI pending.** All three public views are invoker views with explicit tenant predicates; cross-tenant and no-membership tests are non-vacuous.

| Field | Detail |
|---|---|
| Severity | **Critical** |
| Classification | Implementation defect |
| Affected file and line | `supabase/migrations/20260805121400_approvals_workspace.sql:31-84,109`; `supabase/migrations/20260805121500_restaurant_operational.sql:17-34` |
| Database object | `public.v_approval_inbox`; `public.v_restaurant_branch_performance` |
| Exact failure mode | Both views use default owner/definer semantics, omit `security_invoker`, contain no caller membership predicate, and are explicitly granted to `authenticated`. Base-table RLS is bypassed. |
| Exploit or misstatement scenario | Any signed-in account—including one with no legal-entity membership—can enumerate pending approval entity IDs, legal entities and requesters, and can read restaurant branch names and financial KPI aggregates from other tenants. The restaurant aggregate also sums allocations for unposted actuals because only the joined transaction row, not the allocation, is filtered by posting status. |
| Evidence | Live catalog confirmed no `security_invoker` option and authenticated `SELECT` on both views. A no-membership JWT read all three seeded restaurant branches. A separate rollback-only probe inserted a submitted budget and the same no-membership JWT read its ID, legal entity, and requester through `v_approval_inbox`. By contrast, `v_budget_vs_actual` correctly declares `security_invoker` at `20260805120700_integrity_triggers_rls.sql:221-222`. |
| Recommended correction | Recreate both views with `security_invoker = true`, enforce legal-entity membership in view/repository paths, filter posted actuals before aggregating, and revoke access until tests prove isolation. Consider tenant-safe RPCs for approval inboxes. |
| Required regression test | For two legal entities plus a no-membership user, query every view directly and through every report/action; assert exact allowed rows and verify unposted actuals are absent. Inspect `pg_class.reloptions` and view grants in CI. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-C-003 — Fixed development passwords are installed by ordinary migrations

**Remediation status (2026-08-05): implemented on the remediation branch; final PR CI pending.** Fresh production replay creates zero Auth users. Personas now require the explicitly enabled loopback-only fixture loader.

| Field | Detail |
|---|---|
| Severity | **Critical** |
| Classification | Implementation defect; documentation mismatch |
| Affected file and line | `supabase/migrations/20260805120800_workflow_seed_users.sql:50-60` and user insertion block; `supabase/migrations/20260805121200_project_schedule_progress.sql:110-154`, especially line 119 |
| Database object | `auth.users`, `auth.identities`, `public.profiles`, role/membership seed rows |
| Exact failure mode | Normal migration execution hashes and installs the published password `Password123!` for named application personas. There is no local-environment guard. The same migration chain also performs destructive seed rewrites (`20260805120800_workflow_seed_users.sql:7`). |
| Exploit or misstatement scenario | If these migrations reach a shared/staging/production project, an attacker who knows the repository can sign in as finance, approver, employee, or administrator personas and exercise their privileges. |
| Evidence | `supabase db reset` applied all 16 migrations and created the users without any opt-in seed step. `KNOWN_LIMITATIONS.md` says these migrations must not run in production and suggests skipping seed blocks, but Supabase applies migration files atomically as files; no executable skip mechanism exists here. |
| Recommended correction | Remove all environment/test data and `auth` writes from production migrations. Put deterministic personas in `supabase/seed.sql` or a local-only fixture command with an explicit environment guard. Rotate any shared environment where these migrations may have run. Split destructive seed cleanup from schema migrations. |
| Required regression test | Apply the production migration chain to an empty database with seeding disabled and assert that no test email, known password hash, or deterministic persona exists; separately prove local fixture creation works only when explicitly requested. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-001 — Fourteen exposed-schema tables have RLS disabled

**Remediation status (2026-08-05): implemented on the remediation branch; final PR CI pending.** All 54 public tables enable and force RLS; every table/view has a tested data-API or server-only classification.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | Creation sites: `20260805120000_extensions_and_organization.sql:64`; `20260805120100_auth_and_audit.sql:14,22,29,74`; `20260805120200_control_scopes_projects_wbs.sql:2,67,95`; `20260805120300_cost_structure_budgets.sql:29,38`; `20260805120400_actuals_commitments_forecasts.sql:2,96,110,151` |
| Database object | `control_scope_types`, `forecast_lines`, `forecast_versions`, `gl_accounts`, `gl_cost_mappings`, `notifications`, `organization_unit_types`, `permissions`, `role_permissions`, `roles`, `task_dependencies`, `team_members`, `vendors`, `work_packages` |
| Exact failure mode | RLS is off and no policies exist. Current missing table grants temporarily make them unreachable, but the grants required by COD-C-001 would expose them unless each object is separately secured. `roles`, `permissions`, mappings, vendors, forecasts and team membership are security- or tenant-sensitive. |
| Exploit or misstatement scenario | A broad authenticated grant intended to restore application operation permits tenant-wide vendor/forecast/master-data reads or writes, and role/permission metadata manipulation if write privileges are included. |
| Evidence | Post-reset live `pg_class`/`pg_policy` catalog: 14 tables report `relrowsecurity = false`, policy count zero. The policy coverage matrix below lists all 54 tables, rather than treating the count of 75 policies as coverage evidence. All policies are also created without `TO authenticated` and therefore target `public`, increasing future anonymous-exposure risk when grants change. |
| Recommended correction | Classify each table as private or Data API exposed. Move internals private; enable and, where appropriate, force RLS on exposed objects; specify policy roles; create tenant-aware CRUD policies and least-privilege grants together. |
| Required regression test | Catalog test fails if a table in an exposed schema lacks RLS, lacks an explicit classification exception, or has a policy targeting `public` without review. Cross-tenant tests must cover every retained exposed table. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-002 — Role and session authorization are not legal-entity/effective-date safe

**Remediation status (2026-08-05): implemented on the remediation branch; final PR CI pending.** SQL and TypeScript now enforce active profile/membership, effective dates, organization membership for group scope, legal-entity scope, and exact subordinate scope.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `supabase/migrations/20260805120500_rls_policies.sql:31-46`; representative calls at `:65-87` and throughout policy migrations; `src/lib/auth/context.ts:43-81`; `src/domain/auth/permissions.ts:175-184` |
| Database object | `user_has_role(text,uuid)`, `role_assignments`, all role-gated RLS policies, `profiles` |
| Exact failure mode | Most RLS calls omit `p_scope_id`; `user_has_role` then accepts a matching role in any assignment, independent of the row's legal entity/scope. It checks `effective_end` but not `effective_start`. The application loads role assignments without effective-date filtering and loads `profiles.status` without rejecting inactive profiles. |
| Exploit or misstatement scenario | A user with finance role in entity A and mere membership in entity B can satisfy finance RLS while writing entity B. A future-dated administrator assignment is effective immediately. An inactive profile with an active auth session/membership is still authorized. |
| Evidence | SQL at lines 44-45 contains the null-scope shortcut and only end-date test. A rollback-only probe inserted an administrator assignment starting 30 days in the future; `user_has_role('system_administrator')` returned `true` today. Source inspection confirms no inactive-profile rejection. |
| Recommended correction | Pass row-derived entity/scope to every policy helper; include membership, scope type/id, `effective_start <= current_date`, and end date in one canonical authorization function. Enforce disabled-profile denial in context and database policy. Avoid deriving permissions independently in TypeScript and SQL without parity tests. |
| Required regression test | Cartesian tenant/role/scope/effective-date/status matrix: two entities, group/entity/project scopes, future/expired assignments, inactive profiles, and conflicting roles; assert both direct SQL and every server action agree. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-003 — Audit records are forgeable, globally scoped, incomplete, and not physically append-only

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** Extended `audit_events` with tenant/correlation/idempotency columns; append-only triggers; command-only writes via `private.write_audit_event`.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `20260805120100_auth_and_audit.sql:81-97`; `20260805120500_rls_policies.sql:96-103`; sparse inserts at `src/data/repositories/financial-repository.ts:109-116` and `project-schedule-repository.ts:188+`; `src/data/repositories/audit-repository.ts:6-27` |
| Database object | `audit_events`; regulated business tables |
| Exact failure mode | `audit_events` has no legal entity/scope, insert policy only requires a JWT, and actor/action/entity fields are caller-supplied. Audit read is global for anyone satisfying an unscoped audit/admin role. No trigger produces authoritative audit events for budgets, imports, approvals, changes, progress, schedule, or most actual activity. UPDATE/DELETE lack user policies but no immutable trigger protects against owner/service/admin mutation. |
| Exploit or misstatement scenario | A signed-in user can write an event claiming another approver approved a transaction; an auditor for one tenant can see all tenant events; privileged maintenance can silently alter history; material approvals leave no record at all. |
| Evidence | Rollback-only probe temporarily applied the intended insert grant and a no-membership JWT inserted an `approve` event with `actor_id` set to another user. SQL lines 81-93 show no tenant field. Source audit found only isolated explicit inserts; the reversal event even records action `update`, not reversal. |
| Recommended correction | Make actor/session/tenant values server/database-derived; attach legal entity and scope; generate events in transactional SQL triggers/RPCs for all controlled state changes; deny direct client insert; add immutable UPDATE/DELETE triggers with tightly audited break-glass procedures; define retention and external/WORM export. |
| Required regression test | Attempt actor/tenant/action spoofing and UPDATE/DELETE as every role, including service-path tests; verify one correct event with before/after values is committed atomically for every material workflow and none is written after rollback. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-004 — Approved budgets and their lines/period allocations remain mutable

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** Immutability extended to `approved` status; line and monthly allocation triggers; change-only path via RPC.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `20260805120700_integrity_triggers_rls.sql:109-130`; `20260805120500_rls_policies.sql:65-78`; `20260805120700_integrity_triggers_rls.sql:269-288`; `20260805121100_fix_budget_version_update_rls.sql:5+` |
| Database object | `budget_versions`, `budget_lines`, `budget_monthly_allocations`, `trg_budget_versions_immutable` |
| Exact failure mode | The trigger protects only three version totals and only after status is `locked`, `posted`, or `superseded`. Status `approved` is mutable. No trigger protects approved/locked budget lines or monthly allocations. Write policies are based largely on membership and exclusion of auditor/viewer, not explicit budget ownership/finance roles. |
| Exploit or misstatement scenario | An employee changes an approved budget amount after approval, or changes a line/month profile without changing the header total. Reports show a revised budget with the original approval metadata and no authorized change record. |
| Evidence | A rollback-only probe supplied the intended table privileges and an employee JWT changed an `approved` version's original amount from `1000` to `999999`. The trigger condition at line 113 excludes `approved`; there are no equivalent line/month triggers. |
| Recommended correction | Treat approval as immutable. Enforce header/line/month changes only through a transactionally approved change-order RPC; version baselines instead of updating approved records; constrain monthly sum to line total; narrow write policies to scoped roles. |
| Required regression test | For every role, attempt to update every monetary, scope, period, line, month and status field in approved/locked/posted versions; assert denial and verify an approved change produces a new traceable version with reconciled totals. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-005 — Budget approval transitions are unconstrained, non-atomic, and race-prone

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** `private.budget_transition` / `rpc_budget_approve_and_lock` with expected-state checks, SOD, partial unique index.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `src/data/repositories/budget-repository.ts:151-190`; `src/app/actions/budget-actions.ts:93-150`; `20260805120300_cost_structure_budgets.sql:86-104` |
| Database object | `budget_versions`; budget approval workflow |
| Exact failure mode | `transitionBudgetVersion` updates by ID with no expected-current-status predicate or legal transition graph. Review requires `actual:read`, not a budget workflow permission. Approval deactivates the prior current version, approves the target, then locks it in separate requests. No partial unique index enforces one current approved budget, and locked rows may prevent prior deactivation. |
| Exploit or misstatement scenario | A draft is directly approved; concurrent approvers produce two current budgets; failure between calls leaves an approved but unlocked target or inconsistent current flags. Budget/actual reports select an arbitrary latest row. |
| Evidence | Lines 160-186 write any caller-provided next status and ID. `reviewHospitalBudgetAction` uses `actual/read` at `budget-actions.ts:93`; approval is three independent repository updates at `:123-150`. Schema has a boolean `is_current_approved` but no uniqueness constraint. |
| Recommended correction | Implement a single transactional, idempotent database command with a version/expected-state predicate, explicit state graph, scoped permission/SOD checks, one-current partial unique index, and audit event. Lock related lines/months in the same transaction. |
| Required regression test | Test every allowed/forbidden edge, approval from draft, two simultaneous approvals, repeat submission, mid-transaction failure, and one-current invariant. Confirm a retry returns the prior outcome without a second transition. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-006 — Budget change approval trusts unrelated client IDs and amounts

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** `rpc_budget_approve_change_request` accepts only change request ID; server derives deltas and new version.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `src/app/actions/budget-actions.ts:192-216`; `src/data/repositories/budget-repository.ts:238-279`; `20260805120900_auth_rls_expansion.sql:112-148` |
| Database object | `budget_change_requests`, `budget_change_lines`, `budget_versions`, `budget_lines`, `budget_monthly_allocations` |
| Exact failure mode | The approve action accepts `changeRequestId`, `budgetVersionId`, `budgetLineId`, and `increaseAmount` from the client. The repository never proves they belong together, never derives the amount from approved request lines, and never checks submitted/current status. Three updates are non-transactional; monthly allocations are not updated. On a correctly locked version the line update can be denied, making the advertised workflow fail partway. |
| Exploit or misstatement scenario | An approver approves a small request while applying an arbitrary larger amount to a different line/version, or a partial failure updates a line without approving the request. Header, line, and monthly budget totals diverge. |
| Evidence | Lines 242-276 independently select/update each supplied ID and add supplied `increaseAmount`. No join to `budget_change_lines` or request-version relationship exists. The UI contains hard-coded `50000` action values. |
| Recommended correction | Accept only a request ID. In one locked transaction, load the request and lines, validate ownership/status/SOD/scope, calculate deltas server-side with decimal arithmetic, reconcile month allocations and header totals, create a new budget version/change ledger, and audit it. |
| Required regression test | Tamper each ID/amount, cross tenants and versions, repeat and concurrently approve, inject a mid-operation failure, and verify line/month/header reconciliation and complete rollback. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-007 — Import posting violates segregation, atomicity, and idempotency controls

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** `rpc_import_review_batch` / `rpc_import_post_batch` with SOD and single-transaction posting.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `src/app/actions/import-actions.ts:111-124`; `src/data/repositories/import-repository.ts:52-61,98-219`; `20260805120400_actuals_commitments_forecasts.sql:35-67` |
| Database object | `import_batches`, `imported_source_rows`, `actual_transactions`, allocations and exception queues |
| Exact failure mode | The importer who has `actual:import` also posts and is stored as approver. Posting loops through rows and writes actuals, allocations/queues and the batch in separate requests. A mid-loop failure leaves posted actuals while the batch remains unposted. File-hash duplicate checking is check-then-insert and only checks posted batches; there is no database uniqueness/claim lock. Binary XLSX is hashed after UTF-8 conversion. |
| Exploit or misstatement scenario | A preparer posts their own journal; concurrent submissions duplicate a file; a transient error leaves a partial ledger which a retry treats inconsistently; different binary workbooks can be normalized to degraded UTF-8 hash input. |
| Evidence | Action lines 115 and 123 use the same user for import permission and approval. Repository lines 125-218 show per-row writes followed by the batch flag. The only actual uniqueness is `(legal_entity_id, source_system, source_transaction_id)`, not batch/file hash; exceptions are written without checking errors. |
| Recommended correction | Separate prepare/review/post permissions and users; validate batch tenant against caller; store SHA-256 of raw bytes; add appropriate unique/idempotency keys; claim/post through one serializable or locked SQL transaction; keep actuals unposted until successful reconciliation; fail on any ignored queue write. |
| Required regression test | Self-post denial, two-user approval, two concurrent uploads/posts, same bytes/name variations, failure on row N, retry after failure, tenant-ID tampering, and exact all-or-nothing ledger/batch/audit assertions. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-008 — Upload handling is unbounded and uses a vulnerable Excel parser

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect; dependency risk |
| Affected file and line | `src/app/actions/import-actions.ts:49-103`; `package.json:49`; `package-lock.json` resolved `xlsx@0.18.5` |
| Database object | Import service/process memory; imported source data |
| Exact failure mode | The action buffers the entire upload, trusts filename extension, has no MIME/magic-byte, size, row, column, cell-length, sheet-count, decompression, formula, or timeout limits, and parses `.xls/.xlsx` in-process. `npm audit` reports the direct `xlsx@0.18.5` dependency high severity (prototype pollution and ReDoS; no automatic fix). Numeric/date/UUID inputs also lack comprehensive schema/finite/range validation before persistence. |
| Exploit or misstatement scenario | A permitted importer submits a zip bomb/oversized workbook to exhaust the server, a crafted workbook exercises the vulnerable parser, or malformed numeric/date values poison or abort a batch after partial work. |
| Evidence | Lines 59 and 79 read/parse the full buffer. Only extensions and required headers are checked. First `npm ci` reports one high vulnerability; `npm audit` identifies the `xlsx` advisories. |
| Recommended correction | Reject by byte limit before buffering; validate media signature/MIME; stream CSV with row/field limits; parse spreadsheets in a constrained worker/sandbox with decompression limits; replace or isolate the vulnerable package; validate every normalized row with a strict schema and formula policy. |
| Required regression test | Oversized, mislabeled, empty, multi-sheet, zip-bomb-shaped, excessive-row/column/cell, formula-bearing, malformed date/UUID/decimal, NaN/infinity, and dependency-security gate tests; verify no partial database writes. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-009 — Actual posting and allocation integrity are not enforceable

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** Draft default (`is_posted=false`), exact reconciliation RPC, cross-tenant allocation trigger, posted immutability.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `20260805120400_actuals_commitments_forecasts.sql:35-78`; `20260805120700_integrity_triggers_rls.sql:133-154`; `20260805120900_auth_rls_expansion.sql:50-67`; import write at `src/data/repositories/import-repository.ts:153-197` |
| Database object | `actual_transactions`, `actual_transaction_allocations`, `trg_allocation_reconciliation` |
| Exact failure mode | Actuals default posted on insert. The constraint trigger rejects only over-allocation (`sum > source + .0001`), not under-allocation or exact non-reconciliation. Unmapped posted actuals deliberately have no allocation. Allocation RLS validates the organization unit's tenant but not transaction, cost node, project/control account, or their mutual tenant. FKs are individually valid but not tenant-consistent. Immutability relies on RLS false-update/delete rather than a table trigger, so owner/service paths can rewrite posted actuals. |
| Exploit or misstatement scenario | A posted SAR 1m actual is left unallocated, allocated to an organization in one tenant and a cost node/transaction in another, or changed through a privileged path. Department and project actuals, remaining budget, tax and consolidated reports disagree with the ledger. |
| Evidence | Trigger line 144 contains only `>`; no equality/posting gate exists. Actual schema line 64 defaults `is_posted = true`. Policy checks at `20260805120900...:57-67` do not prove all referenced objects share a legal entity. Live tests never exercise cross-tenant allocations. |
| Recommended correction | Introduce draft/validated/posted states; allow posting only through a transactional RPC which proves exact signed allocation reconciliation, period openness, tenant consistency, active leaves, VAT totals, and SOD; add composite tenant FKs/constraints and physical immutability triggers after posting. |
| Required regression test | Zero/under/over allocations, negative/credit allocations, mixed tenants, inactive nodes, closed periods, privileged update/delete, concurrent allocation/posting, and rollback; assert signed sum equals source at posting. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-010 — Reversals are repeatable, incomplete, and role-incompatible

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** `rpc_reverse_actual_transaction` with idempotency, unique reversal index, allocation mirror, audit action `reverse`.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `src/data/repositories/financial-repository.ts:76-118`; `src/app/actions/financial-actions.ts:94-105`; `20260805120400_actuals_commitments_forecasts.sql:60-66` |
| Database object | `actual_transactions.reverses_transaction_id`; allocations; audit events |
| Exact failure mode | The code prevents reversing a reversal but does not prevent multiple reversals of the same original. No unique constraint exists on `reverses_transaction_id`. It negates through JavaScript `Number`, copies no accounting period, invoice/vendor/tax dates or allocations, uses current date, and inserts the audit separately with action `update`. The action requires an approver, while RLS insert allows finance/cost-controller/admin, so a normal approver can be rejected. |
| Exploit or misstatement scenario | Double-click or concurrent approval creates two credits; the original remains allocated while reversals are not, so control reports do not net to zero; date/period shift moves the reversal into another close; a valid approver cannot execute it. |
| Evidence | Lines 88-104 show the sole repeat check and partial copied fields; line 95 uses timestamp uniqueness; lines 97-99 use `Number`; no allocation insert follows. The operation and audit are separate calls. |
| Recommended correction | Use one idempotent transactional reversal RPC, unique one-reversal constraint (or governed reversal chain), decimal-safe negation, original period/dimension/allocation replication, explicit posting-date policy, compatible scoped role/SOD, and authoritative audit action. |
| Required regression test | Repeat/double/concurrent reversal, role matrix, decimal >2^53, allocation and VAT net-to-zero, closed-period policy, mid-failure rollback, and audit linkage. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-011 — Core reports and project EVM use mis-scoped or fabricated inputs

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect; intentionally scaffolded calculation presented as live |
| Affected file and line | `20260805120700_integrity_triggers_rls.sql:221-238`; `src/data/repositories/budget-repository.ts:286-371`; `src/data/repositories/project-repository.ts:137-160`; `src/domain/financial/calculations.ts` |
| Database object | `v_budget_vs_actual`; hospital budget performance; project EVM dashboard |
| Exact failure mode | The view joins actual allocations to every approved budget line sharing cost node/org unit, without legal entity, scope, fiscal year/period, budget version, transaction posting status, or control account. Hospital actuals are fetched by organization IDs only; YTD budget/actual sum all periods; current period is hard-coded to 3; full-year forecast equals `YTD actual + one month budget`. Project PV and EV are hard-coded 45% and 35% of BAC; AC is all allocations for the responsible department, uses JavaScript `Number`, and is not project/control-account scoped. |
| Exploit or misstatement scenario | One actual is counted against multiple budget versions/projects/tenants; future periods appear in YTD; a project reports fixed SPI/CPI unrelated to schedule completion; forecasts and VAC lead management to approve incorrect funding or performance actions. |
| Evidence | View join is only cost node/org unit at lines 234-236. Hospital lines 323, 343, 350, 356, 371 show the scoping/period/forecast logic. Project lines 153-160 show fixed PV/EV and department-only AC. Decimal-safe formula functions calculate CV/SV/CPI/SPI/EAC/ETC/VAC correctly for their documented variants, but the inputs are not authoritative. |
| Recommended correction | Define reporting grain and lineage. Join actuals to tenant/scope/project/control account and period, include posted status, select one baseline version, derive status date, time-phased PV and objectively measured EV, and calculate AC from project-coded posted allocations. Retain Decimal end-to-end. Define and label EAC variants. |
| Required regression test | Two tenants, two scopes, repeated cost nodes/orgs, multiple budget versions, posted/unposted actuals and multiple periods; hand-calculate PV/EV/AC/CV/SV/CPI/SPI/EAC/ETC/VAC and assert exact results including zero denominators and decimals. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-012 — Progress and schedule workflows permit repeat/concurrent state corruption

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** Transactional progress/schedule RPCs with expected status, SOD, and `schedule_baseline_versions`.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `src/data/repositories/project-schedule-repository.ts:105-137,140-173,176-195,230-270`; `20260805121200_project_schedule_progress.sql:1-108,218-364` |
| Database object | `milestone_progress_updates`, `milestones`, `progress_evidence`, `schedule_change_requests`, `projects` |
| Exact failure mode | Submit, milestone update and evidence insert are separate, with later errors ignored. Verification has no `status='submitted'`/version predicate and milestone update is separate. Repeat verifications overwrite prior values. Milestone accept can repeat. Schedule approval has no current-state predicate; each retry adds days to the already extended forecast, and request/project updates are separate. No database check constrains progress to 0–100. |
| Exploit or misstatement scenario | Two approvers verify different percentages and the last wins; a retry extends a project twice; a request is approved while the project update fails; 150% progress inflates EV; evidence is absent although submission succeeded. |
| Evidence | Verification updates by ID only at lines 152-171. Schedule approval updates any request at 241-251 then adds to current `forecast_end` at 260-268. No transition/optimistic predicate or transaction surrounds either sequence. |
| Recommended correction | Implement transactional state-machine RPCs with expected status/version, idempotency key, progress range/monotonic/evidence rules, SOD, baseline-preserving schedule change ledger, and audit. Derive revised end from approved baseline plus approved changes, not cumulative retry state. |
| Required regression test | Out-of-range/regressive progress, missing evidence, self-approval, repeated and simultaneous verification/acceptance/schedule approval, stale version, mid-failure and retry; assert exactly one deterministic outcome. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-013 — CSV exports allow spreadsheet formula injection

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Implementation defect |
| Affected file and line | `src/data/repositories/report-repository.ts:41-56`; `src/app/actions/report-actions.ts:52-78` |
| Database object | Exported audit, exception, variance, budget and financial report data |
| Exact failure mode | `rowsToCsv` quotes fields and doubles quotes but does not neutralize values beginning with `=`, `+`, `-`, `@`, tab, CR or LF formula markers. User/import-controlled descriptions, reasons and identifiers reach reports. Quoting does not stop Excel/LibreOffice formula evaluation. |
| Exploit or misstatement scenario | An imported description such as a hyperlink/DDE-style formula is exported and executed when a finance user opens the CSV, enabling phishing, data exfiltration or command-like behavior depending on spreadsheet settings. |
| Evidence | Lines 49-52 convert arbitrary values and only replace quote characters. No formula-safe serialization or warning exists. |
| Recommended correction | Apply a documented spreadsheet-safe encoding policy (for example prefix risky text with an apostrophe and preserve original data separately), sanitize headers too, and set explicit text cell types for XLSX. Consider offering a non-spreadsheet export for raw fidelity. |
| Required regression test | Cells beginning with every dangerous prefix, leading whitespace/control characters, bilingual text, embedded quotes/newlines, and values that are legitimately negative numbers; open/inspect generated CSV and XLSX cell types. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-H-014 — The current branch is red while completion evidence says it is green

**Remediation status (2026-08-05): open pending required GitHub Actions at the exact remediation PR head.** Local development checks are recorded in `REMEDIATION_EVIDENCE.md` and are not substituted for final CI.

| Field | Detail |
|---|---|
| Severity | **High** |
| Classification | Test deficiency; documentation mismatch; environmental instability |
| Affected file and line | `.github/workflows/ci.yml:35,56-67`; `docs/COMPOSER_COMPLETION_REPORT.md:20-26,49`; `docs/CODEX_HANDOFF.md:47-49`; `docs/DATABASE_EXECUTION_REPORT.md:22`; `docs/IMPLEMENTATION_STATUS.md:7-16,26-31` |
| Database object | Verification/release evidence |
| Exact failure mode | Current Linux PR and push checks fail at unit/integration tests; DB, E2E and build are skipped. Independent first attempts fail unit/integration, DB and E2E. Reports claim 26/26 unit/integration, 15/15 DB, 17/17 E2E, passing build, 75 RLS policies and complete modules, but are stale and/or based on an environment whose implicit privileges differ. |
| Exploit or misstatement scenario | Reviewers merge on a narrative completion report even though clean installs cannot execute core workflows and CI has never validated downstream DB/E2E/build steps at the final SHA. |
| Evidence | PR status `UNSTABLE`. [PR run 31041566204](https://github.com/ahmeds-almodawat/Budget/actions/runs/31041566204) and [push run 31041559715](https://github.com/ahmeds-almodawat/Budget/actions/runs/31041559715) both fail `npm run test` with the same table permission errors. Earlier final-branch runs first failed `npm ci`, then lint, before those were patched; there is no all-green run. Independent results are in section 10. |
| Recommended correction | Make CI authoritative and required, fix the underlying schema/test issues, run every stage even when earlier test groups fail where practical, publish machine-readable evidence, and update completion documents only from a green immutable SHA. |
| Required regression test | A required clean CI run at the exact merge SHA must pass install, reset, lint, typecheck, unit/integration, DB, E2E and build on first attempt; record retry count separately. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

## 4. Medium and low findings

### COD-M-001 — Security-definer and trigger functions need privilege/search-path hardening

**Remediation status (2026-08-05): implemented on the remediation branch; final PR CI pending.** Application and extension functions have been removed from `public`; private helper/trigger search paths, security modes, and execute ACLs are catalog-tested.

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect |
| Affected file and line | `20260805120500_rls_policies.sql:17-46`; revoke/grant at `20260805120900_auth_rls_expansion.sql:222-226`; trigger functions throughout `20260805120700_integrity_triggers_rls.sql:2-196` |
| Database object | `user_legal_entity_ids`, `user_has_role`, ten public trigger functions |
| Exact failure mode | The two `SECURITY DEFINER` helpers use mutable `search_path = public` rather than an empty path with fully qualified objects. They are revoked from `PUBLIC`, but remain in the exposed public schema. Ten trigger functions have default PUBLIC execute and no explicit hardened search path; direct execution of trigger-return functions is usually impractical but the privilege surface is unnecessary. |
| Exploit or misstatement scenario | A future object-creation privilege or name collision can alter definer resolution; an accidentally broadened function signature/grant can turn a trigger helper into an exposed API. |
| Evidence | Function catalog: 12 custom functions; two definers have `proconfig={search_path=public}` and authenticated execute; ten trigger functions retain default PUBLIC execute/no `proconfig`. |
| Recommended correction | Put authorization helpers in a private schema, use `SET search_path = ''`, fully qualify every object, revoke PUBLIC on all functions, and grant only deliberate RPC/helper signatures. Keep trigger helpers non-executable by client roles. |
| Required regression test | Catalog assertion over `prosecdef`, `proconfig`, schema and ACL for every custom function, plus search-path shadowing attempts. |
| Blocks merge | **No**, if fixed before any table grants are released |
| Blocks production | **Yes** |

### COD-M-002 — Exception and report repositories query columns that do not exist

**Remediation status (2026-08-06): implemented on `fix/audit-p2-financial-transactions`.** Repositories join exception queues through `import_batches`; unmapped status aligned to `open`.

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect; test deficiency |
| Affected file and line | `src/data/repositories/audit-repository.ts:31-51`; `src/data/repositories/financial-repository.ts:15-22`; `src/data/repositories/report-repository.ts:31-37`; schema at `20260805120700_integrity_triggers_rls.sql:191-217` |
| Database object | `unmapped_transaction_queue`, `duplicate_review_queue`; audit exceptions and report workspaces |
| Exact failure mode | Repositories filter queue tables on `legal_entity_id`, but neither queue has that column. `audit-repository` also requests unmapped status `pending` while unmapped default/allowed status is `open`. These pages throw raw database errors when reached. |
| Exploit or misstatement scenario | Controllers see an empty/broken exception report and assume all actuals are mapped or duplicate-free, allowing unresolved transactions into management reporting. |
| Evidence | Direct schema/source comparison; no migration later adds the missing tenant columns. Current E2E does not assert exception row content. |
| Recommended correction | Either add authoritative tenant columns with consistency constraints or join through batch/transaction; align status enums/constants; use generated database types to prevent nonexistent-column queries. |
| Required regression test | Seed open/pending queues for two tenants and assert exact exception/audit/report rows, counts and status behavior through repository and page. |
| Blocks merge | **Yes** |
| Blocks production | **Yes** |

### COD-M-003 — Commitment/procurement control is a read-only partial model

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Intentionally deferred feature; documentation mismatch |
| Affected file and line | `20260805120400_actuals_commitments_forecasts.sql:80-94`; `src/domain/financial/calculations.ts:56-64`; `src/data/repositories/financial-repository.ts:65-72`; `src/components/financial/commitments-workspace.tsx:11-18,45-91`; `docs/IMPLEMENTATION_STATUS.md:13,39`; `docs/KNOWN_LIMITATIONS.md:9` |
| Database object | `commitments`; absent invoices, payments, credit notes, three-way match and period-close objects |
| Exact failure mode | Open commitment arithmetic (`committed - invoiced - cancelled`) is implemented, but no database constraints prevent negative/over-invoiced values and no controlled creation/approval/update lifecycle exists. Invoice, payment and credit-note tabs are scaffolds. The report named `budget_actual_commitments` reuses budget-vs-actual data and does not include commitments. |
| Exploit or misstatement scenario | Remaining commitments become negative or omit invoices/payments; projected cost and available budget are understated; a report labeled as including commitments excludes them. |
| Evidence | Only one commitment table exists; no invoice/payment/credit-note tables or corresponding actions/policies are present. Documentation itself marks procurement tabs partial while broader completion text presents actual/commitment control as complete. |
| Recommended correction | Either remove/label these as deferred in release scope or implement PO/commitment/invoice/payment/credit lifecycle, matching, amendments/cancellations, currency/tax/period rules, SOD, constraints and audit. Define remaining commitment precisely and include it in correctly named reports. |
| Required regression test | Partial/full/over invoice, cancellations, credit notes, payments, currency/VAT, closed periods and concurrent matching; reconcile subledger to commitments and actuals. |
| Blocks merge | **No** only if the PR/product scope is explicitly reduced and UI/report labels are corrected; otherwise **Yes** |
| Blocks production | **Yes** |

### COD-M-004 — Server actions are hard-coded to one entity and leak database errors

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect; intentionally deferred feature |
| Affected file and line | `src/app/actions/_shared.ts`; all action files using `LEGAL_ENTITY_MODAWAT`; examples `budget-actions.ts:41-296`, `import-actions.ts:49-124`; `src/data/repositories/budget-repository.ts:6-12` |
| Database object | All action-backed multi-entity workflows |
| Exact failure mode | Actions authorize and query a fixed Modawat entity/scope/fiscal-year UUID rather than deriving and validating a selected tenant/scope. Repository errors preserve `error.message`; action maps frequently rethrow it, revealing relation, constraint, column and policy details. |
| Exploit or misstatement scenario | A user belonging only to a different legitimate entity cannot use the platform; future UI parameterization may bolt caller-supplied scope onto assumptions and cause tenant mistakes. Attackers learn schema/policy names from database errors. |
| Evidence | Repeated constants appear in every workflow action. E2E logs expose `permission denied for table ...` and unauthenticated context details. Server actions are public endpoints and require independent per-action authorization; the current pattern is not a general enterprise tenancy implementation. |
| Recommended correction | Introduce a validated active tenant/scope context, authorize the concrete resource after loading it, remove fixed IDs from production actions, and map internal errors to stable public codes while logging correlation IDs server-side. |
| Required regression test | Two-entity action matrix, ID tampering, stale/absent active tenant, direct action calls without UI, and assertions that client errors reveal no table/constraint/policy names. |
| Blocks merge | **Yes** for the stated multi-entity platform scope |
| Blocks production | **Yes** |

### COD-M-005 — Cross-tenant relational integrity and domain constraints are incomplete

**Remediation status (2026-08-06): partial on `fix/audit-p2-financial-transactions`.** Cross-tenant allocation trigger, progress range checks, one-reversal unique index, one-current-budget partial unique index.

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect |
| Affected file and line | Table definitions across `20260805120000`–`20260805120400` and `20260805121200`–`20260805121500`; representative actual/allocation definitions at `20260805120400_actuals_commitments_forecasts.sql:35-78` |
| Database object | Tenant-owned FKs and financial/project domain columns |
| Exact failure mode | Independent UUID FKs do not prove related rows share legal entity/control scope. Missing checks include progress 0–100, risk probability/impact ranges, nonnegative/consistent commitment amounts, invoice/transaction amount identities, approved change relationships, and monthly allocation sum. No one-current-budget or one-reversal constraints exist. |
| Exploit or misstatement scenario | Valid IDs from different tenants are combined into a single allocation/change/project relation; out-of-range progress and inconsistent totals persist and then feed reports. |
| Evidence | Schema inspection of all migrations found UUID FKs but no composite tenant keys for these relationships and no listed checks/unique partial indexes. Application validation is incomplete and cannot protect service/import/direct SQL paths. |
| Recommended correction | Add composite unique keys and tenant-bearing FKs or verified constraint triggers; add decimal/range/status/date constraints and deferred reconciliation constraints; use database enums/checks consistently. |
| Required regression test | For every cross-object FK attempt mismatched tenants/scopes; property/boundary tests for amounts, percentages, dates and status relationships; assert database rejection independent of UI. |
| Blocks merge | **Yes** for financial write paths |
| Blocks production | **Yes** |

### COD-M-006 — Baseline preservation is partial and not version-complete

**Remediation status (2026-08-06): partial on `fix/audit-p2-financial-transactions`.** `schedule_baseline_versions` table; schedule approve command snapshots approved revisions.

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect |
| Affected file and line | `20260805120700_integrity_triggers_rls.sql:156-177`; budget trigger at `:109-130`; schedule approval `src/data/repositories/project-schedule-repository.ts:254-270` |
| Database object | Project/phase/task/milestone baseline dates; budget baseline amounts/lines/months |
| Exact failure mode | Project schedule triggers prevent overwriting a non-null baseline field, which is a positive control, but there is no complete versioned baseline/snapshot and no transactional approved-change ledger that reconstructs revisions. Budget baseline protections omit approved status, lines and time phasing. Revised schedule is derived by mutating current forecast dates. |
| Exploit or misstatement scenario | Management cannot reproduce the exact original and approved-revised schedule/budget at a prior reporting date or distinguish authorized changes from operational forecast changes. |
| Evidence | Baseline trigger protects updates only; no baseline-version tables/snapshots are present. Schedule approval mutates `forecast_end` and `approved_revised_end`; budget gaps are in COD-H-004/H-006. |
| Recommended correction | Store immutable baseline versions and effective-dated approved change records; derive current approved baseline from them; separate baseline, approved-revised, and live forecast; snapshot line/month data and audit all promotions. |
| Required regression test | Reconstruct original/current baseline after multiple approved/rejected changes, retries and forecast updates; verify original fields and historical reports never change. |
| Blocks merge | **No** if clearly marked partial and no baseline claims are made |
| Blocks production | **Yes** |

### COD-M-007 — Foreign-key and RLS access paths are broadly unindexed

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect; performance risk |
| Affected file and line | Index definitions across all migrations; policy joins in `20260805120500_rls_policies.sql`, `20260805120700_integrity_triggers_rls.sql`, `20260805120900_auth_rls_expansion.sql`, `20260805121200_project_schedule_progress.sql`, and `20260805121300_risk_issue_action_decision.sql` |
| Database object | 111 individual FK columns without a left-prefix supporting index; frequent membership/entity/scope/status/date filters |
| Exact failure mode | Most indexes are primary/unique constraints. RLS subqueries and dashboard/report joins repeatedly scan membership, role, version, line, allocation, status and date paths. At enterprise row counts, every RLS-protected request can multiply sequential scans. |
| Exploit or misstatement scenario | Budget/report pages time out under normal volume, approvals appear unavailable, and batch imports hold locks longer, increasing race/deadlock exposure. |
| Evidence | Live catalog comparison of foreign-key column order against index left prefixes reported 111 uncovered individual FK columns. The view/report predicates above lack matching composite indexes. No production-scale plans/load results exist. |
| Recommended correction | Add workload-driven indexes for FK, RLS and report predicates (tenant first where appropriate); use partial indexes for active/current/submitted/posted states; validate with `EXPLAIN (ANALYZE, BUFFERS)` and realistic cardinality; avoid blanket indexing without write-cost review. |
| Required regression test | Seed production-scale skewed data, capture representative query/RLS plans and latency budgets, and fail on critical sequential scans/plan regression. |
| Blocks merge | **No** for a small local demo |
| Blocks production | **Yes** |

### COD-M-008 — Automated tests provide weak security/accounting assurance

**Remediation status (2026-08-06): improved on `fix/audit-p2-financial-transactions`.** Command unit tests, extended DB invariants, concurrency script mapped to findings.

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Test deficiency |
| Affected file and line | `supabase/tests/rls_foundation.test.sql` (single always-true pgTAP assertion); `vitest.database.config.ts:5-6`; `src/domain/integration/hospital-workflow.integration.test.ts`; `scripts/test-database.mjs`; `tests/e2e/*.spec.ts` |
| Database object | Test evidence for all controls |
| Exact failure mode | The SQL pgTAP file is a placeholder and its filename does not match `**/*.test.sql`; `passWithNoTests: true` hides that absence. A DB assertion uses `count >= 0`, which is vacuous. Integration tests call repositories directly and bypass server-action authorization. Fixtures have one tenant. E2E mostly checks headings/buttons and may pass without validating accounting content. |
| Exploit or misstatement scenario | A build reports dozens of passing tests while cross-tenant reads, forged audits, mutable approved budgets, duplicate posting, false EVM and formula injection remain untouched. |
| Evidence | Manual review of all six Vitest files, 15-script DB checks, one pgTAP file and 17 Playwright tests found no complete policy matrix or concurrency/transaction/security-negative suite. Current failures also show the previous reported pass depended on implicit privileges. |
| Recommended correction | Replace count-oriented evidence with invariant/abuse-case tests mapped to this report; exercise server actions and direct SQL; create two tenants and no-membership users; use real transaction/concurrency tests; make zero tests fail. |
| Required regression test | The required tests are the regression tests specified on each finding; add a traceability manifest so every critical/high control has positive, negative, cross-tenant and privileged-path coverage. |
| Blocks merge | **Yes** until critical/high fixes have meaningful tests |
| Blocks production | **Yes** |

### COD-M-009 — CI is tool-version sensitive and retry semantics mask first-run stability

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Environmental instability; test deficiency |
| Affected file and line | `.github/workflows/ci.yml:16,35`; `playwright.config.ts:5-8`; Next config/startup output |
| Database object | Release pipeline |
| Exact failure mode | CI installs Supabase CLI `latest`, so database defaults/tool behavior can change without a code change. Playwright uses two CI retries; retry success would not prove first-run stability. Push and PR events duplicate the same workflow. E2E/dev output reports an ignored parent lockfile/Turbopack root ambiguity and deprecated middleware convention, relevant to Windows/local variance. |
| Exploit or misstatement scenario | A green retry hides race/startup/auth flakiness; a new CLI release breaks migrations; workspace-root detection resolves unexpected files on a developer/runner. |
| Evidence | CI line 35 pins `latest`; Playwright line 7 sets two retries. Earlier final-branch runs failed Linux `npm ci`, then lint, before follow-up commits; current run fails tests. Independent E2E produced six first-attempt failures while build passed. |
| Recommended correction | Pin Supabase CLI and runtime/container versions; report first-run and retry outcomes separately; retain artifacts for every attempt; set explicit Next/Turbopack root; migrate middleware convention; avoid duplicate required runs or make one authoritative. |
| Required regression test | Repeat clean runs on Windows and Linux from empty caches, measure first-attempt pass rate, and inject service readiness delays; fail release if first attempt fails even when retry passes. |
| Blocks merge | **No** independently; current red CI in COD-H-014 does block |
| Blocks production | **Yes** |

### COD-M-010 — Arabic/English implementation is inconsistent and not localization-source complete

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Implementation defect; intentionally deferred feature |
| Affected file and line | `src/components/layout/app-shell.tsx:35-42`; `src/components/layout/app-sidebar.tsx:82`; `src/components/pages/module-placeholder-page.tsx:68-84`; representative inline branches at `src/components/imports/actual-import-workflow.tsx:44-114`; `messages/ar.json:125-126` |
| Database object | Bilingual UI, RTL/LTR accessibility and operational labels |
| Exact failure mode | Many functional labels are inline conditionals rather than translation catalogs; some shell/ARIA/placeholder text remains English in Arabic; module keys can render as English headings; mixed strings include untranslated English terms (for example `favorable`). Layout direction exists but component-level icon/order/alignment and generated export bilingual behavior are not systematically verified. |
| Exploit or misstatement scenario | Arabic operators misread approval/variance state or encounter English-only control labels; assistive technology receives the wrong language/direction; bilingual exports are inconsistent. |
| Evidence | Repository-wide source search and UI review found hard-coded bilingual branches and English literals outside messages; E2E checks only a small sign-in/navigation subset and one Arabic sign-out test failed on first run. |
| Recommended correction | Move all user-visible/ARIA text to typed message catalogs, establish glossary/status terminology, test `lang`/`dir`, bidirectional numbers/currency/dates/tables/icons, and generate locale-specific exports. |
| Required regression test | Visual/accessibility snapshots for every route in `en`/LTR and `ar`/RTL, keyboard/screen-reader names, mixed Arabic/Latin financial data, and CSV/XLSX filenames/headers. |
| Blocks merge | **No** for a labeled preview |
| Blocks production | **Yes** for the stated bilingual platform |

### COD-M-011 — Production operating and identity controls are absent

| Field | Detail |
|---|---|
| Severity | **Medium** |
| Classification | Intentionally deferred feature; missing production control |
| Affected file and line | `docs/KNOWN_LIMITATIONS.md:3,7,9,17`; `docs/IMPLEMENTATION_STATUS.md:37-39`; auth/configuration files; repository-wide absence of executable controls |
| Database object | Production identity, secrets, monitoring, recovery, audit retention and release operations |
| Exact failure mode | No production SSO/MFA enforcement, joiner/mover/leaver/delegation administration, service-role custody/rotation, period-close/freeze, backup/restore evidence, DR targets, audit retention/WORM export, security alerting, rate/abuse limits, data retention, or migration promotion/rollback procedure is implemented. |
| Exploit or misstatement scenario | Compromised credentials retain access, privileged changes go undetected, a bad migration cannot be safely promoted/recovered, and audit evidence is lost or mutable. |
| Evidence | Documentation acknowledges password auth, local personas and incomplete administration/delegation; no executable production configurations/runbooks/tests implement these controls. `.env.example` contains placeholders rather than secrets, which is correct, and no committed live secret was identified. |
| Recommended correction | Define the production control baseline and owners before pilot: enterprise IdP/MFA, lifecycle/delegation, secret manager/rotation, environment separation, migration gates/backups/restore drills, close calendar, observability/security alerts, audit retention/export and incident/DR runbooks. |
| Required regression test | Staging operational-readiness exercise covering SSO/MFA, deprovisioning, secret rotation, backup restore, failed migration recovery, period close/reopen, alerting and audit retrieval. |
| Blocks merge | **No** for a clearly labeled non-production preview |
| Blocks production | **Yes** |

### COD-L-001 — Framework/configuration warnings are unresolved

| Field | Detail |
|---|---|
| Severity | **Low** |
| Classification | Environmental instability; maintenance defect |
| Affected file and line | `src/middleware.ts:1-8`; Next configuration (no explicit Turbopack root); `supabase/config.toml:97`; generated `AGENTS.md:1-11` instruction source |
| Database object | Build/dev tooling |
| Exact failure mode | Next reports deprecated middleware convention and a parent `C:\Users\molte\package-lock.json` being ignored while inferring Turbopack root. Supabase reports deprecated `[inbucket]` configuration. The repository's generated instruction points to `node_modules/next/dist/docs/`, which is absent in installed Next 16.3.0, although the generator contains the instruction. |
| Exploit or misstatement scenario | Future framework/CLI upgrades turn warnings into failures or use unexpected workspace inputs. |
| Evidence | First-run E2E/build/reset output; local package inspection. Build still passed. |
| Recommended correction | Set explicit workspace root, adopt the current Next request-interception convention after reading the installed/version-matched docs, and update Supabase configuration. |
| Required regression test | Warning-free clean dev/build/reset on Windows and Linux. |
| Blocks merge | **No** |
| Blocks production | **No**, but fix before upgrade |

### COD-L-002 — Policy/document counts are internally inconsistent

| Field | Detail |
|---|---|
| Severity | **Low** |
| Classification | Documentation mismatch; maintenance defect |
| Affected file and line | `docs/SECURITY_REVIEW.md:5`; `docs/DATABASE_EXECUTION_REPORT.md:22`; `docs/CODEX_HANDOFF.md:20,66`; `docs/COMPOSER_COMPLETION_REPORT.md:49,83`; duplicate policy source in `20260805120700_integrity_triggers_rls.sql:294,303`; replacement in `20260805121100_fix_budget_version_update_rls.sql:3-5` |
| Database object | Security evidence and `import_batches` policies |
| Exact failure mode | Documents cite 49 or 75 policies interchangeably. Source contains 76 creation statements, but the live effective catalog has 75 because `budget_versions_update` is replaced. `import_batches` has duplicate equivalent read policies. Counts are presented as assurance without coverage semantics. |
| Exploit or misstatement scenario | Reviewers infer complete protection from a count while 14 tables lack RLS and two views leak tenants. |
| Evidence | Source and live catalog counts; full matrix below. |
| Recommended correction | Generate an object/operation/predicate/role coverage report from the live database; remove duplicate policies and stale narrative counts. |
| Required regression test | Catalog snapshot with reviewed deltas, not a minimum policy count. |
| Blocks merge | **No** |
| Blocks production | **No** after substantive RLS blockers are fixed |

## 5. RLS coverage matrix

This matrix is from the live post-reset PostgreSQL catalog, not from counting migration statements. There are **54 public tables, 40 with RLS and 14 without, and 75 effective policies**. All tables report `relforcerowsecurity = false`. Every policy is created without an explicit `TO` clause and therefore applies to `public`; current absent table grants prevent most direct access, but that is a broken-availability condition rather than a sound authorization design. `S/I/U/D` below means a policy exists for that command; an explicit false policy is identified separately.

| Public table | RLS | Effective policies | Coverage/control assessment |
|---|---:|---|---|
| `actual_transaction_allocations` | On | 2: S, I | Tenant consistency incomplete; insert validates only part of the referenced dimension chain. |
| `actual_transactions` | On | 4: S, I, U, D | U/D are explicit `FALSE`; insert role is unscoped and posting/reconciliation controls fail COD-H-009. |
| `approval_requests` | On | 3: S, I, U | Update roles are unscoped; no state graph or self-approval predicate in RLS. |
| `audit_events` | On | 2: S, I | I accepts any JWT and caller-supplied actor; S is global for unscoped audit/admin role. |
| `budget_change_lines` | On | 1: I | No direct S/U/D policy; relationship/amount integrity is not enforced. |
| `budget_change_requests` | On | 3: S, I, U | Role/scope and state transition weaknesses. |
| `budget_lines` | On | 3: S, I, U | Approved/locked line immutability absent; role checks unscoped. |
| `budget_monthly_allocations` | On | 2: S, I | No update path or database sum-to-line invariant; no approved immutability trigger. |
| `budget_versions` | On | 3: S, I, U | Broad member write; approved status mutable; state and one-current invariants absent. |
| `commitments` | On | 1: S | Read-only partial module; no controlled lifecycle. |
| `control_accounts` | On | 1: S | Entity membership read; no write workflow. |
| `control_scope_types` | **Off** | 0 | Unclassified exposed reference table. |
| `control_scopes` | On | 1: S | Entity membership read. |
| `cost_nodes` | On | 1: S | Entity membership read. |
| `decisions` | On | 2: S, I | Broad non-viewer member insert; no update lifecycle. |
| `duplicate_review_queue` | On | 2: S, I | Tenant derived indirectly from batch; no controlled resolution update policy. |
| `fiscal_periods` | On | 1: S | Predicate is `TRUE`; any role with grant reads all periods. |
| `fiscal_years` | On | 1: S | Predicate is `TRUE`; any role with grant reads all years. |
| `forecast_lines` | **Off** | 0 | Tenant financial data unprotected; module scaffolded. |
| `forecast_versions` | **Off** | 0 | Tenant financial data unprotected; module scaffolded. |
| `gl_accounts` | **Off** | 0 | Legal-entity GL master data unprotected. |
| `gl_cost_mappings` | **Off** | 0 | Cross-system financial mappings unprotected. |
| `import_batches` | On | 4: S, S, I, U | Duplicate equivalent read policies; importer can update/post own workflow without SOD. |
| `imported_source_rows` | On | 2: S, I | Tenant derived through batch; input validation/atomicity deficient. |
| `issues` | On | 2: S, I | Member read and broad role insert; no controlled update/closure. |
| `legal_entities` | On | 1: S | Membership read; currently inaccessible due missing grant. |
| `memberships` | On | 1: S | Own-row read only; useful positive pattern. |
| `milestone_progress_updates` | On | 3: S, I, U | Self-verification check exists in repository, not full DB state/SOD enforcement. |
| `milestone_steps` | On | 1: S | Project/member read. |
| `milestones` | On | 2: S, U | Update role/state too broad; repeat approvals possible. |
| `notifications` | **Off** | 0 | User-sensitive messages unprotected. |
| `organization_unit_types` | **Off** | 0 | Unclassified exposed reference table. |
| `organization_units` | On | 1: S | Entity membership read. |
| `organizations` | On | 1: S | Membership-derived read. |
| `permissions` | **Off** | 0 | Authorization metadata unprotected. |
| `profiles` | On | 2: S, U | Own row only, but update is not column-restricted and inactive status is not enforced by context. |
| `progress_evidence` | On | 2: S, I | Metadata only; insert failures ignored by workflow; no real storage control. |
| `project_phases` | On | 1: S | Project/member read. |
| `projects` | On | 2: S, I | Insert role unscoped; no controlled update policy for lifecycle. |
| `register_actions` | On | 2: S, I | Broad member insert; no closure/update policy. |
| `register_dependencies` | On | 2: S, I | Broad member insert; no update policy. |
| `risks` | On | 3: S, I, U | Role/scope checks incomplete; range constraints missing. |
| `role_assignments` | On | 1: S | Own assignment read; effective-start/session defects remain. |
| `role_permissions` | **Off** | 0 | Authorization mapping unprotected. |
| `roles` | **Off** | 0 | Authorization master data unprotected. |
| `schedule_change_requests` | On | 3: S, I, U | Self-approval is application-only; state/retry rules absent. |
| `task_dependencies` | **Off** | 0 | Project schedule relationships unprotected. |
| `tasks` | On | 1: S | Project/member read. |
| `team_members` | **Off** | 0 | Employee/team membership and performance-relevant data unprotected. |
| `teams` | On | 1: S | Entity membership read. |
| `unmapped_transaction_queue` | On | 2: S, I | Missing direct tenant column; repository queries invalid status/column; no resolution update. |
| `variance_explanations` | On | 2: S, I | No approval/update policy despite submitted approval state. |
| `vendors` | **Off** | 0 | Tenant vendor master data unprotected. |
| `work_packages` | **Off** | 0 | Project WBS data unprotected. |

### View coverage

| View | `security_invoker` | Authenticated grant | Tenant result |
|---|---:|---:|---|
| `v_budget_vs_actual` | Yes | No explicit view grant | Base RLS is honored if accessed, but financial joins materially misattribute actuals. |
| `v_approval_inbox` | **No** | **Yes** | **Proven cross-tenant leak** to a no-membership JWT. |
| `v_restaurant_branch_performance` | **No** | **Yes** | **Proven cross-tenant leak** and includes unposted allocation amounts. |

### Policy coverage conclusion

The policy count is not assurance. Effective coverage fails on four independent axes: table privilege availability, 14 RLS-disabled tables, two definer-view leaks, and incorrect scope/role/state predicates on policy-bearing tables. Any remediation must review grants, RLS enablement, policy role, row predicate, column privilege, view semantics and privileged/service paths as one system.

## 6. Financial-control matrix

| Control area | Status | Evidence and failure | Required production condition |
|---|---|---|---|
| Decimal-safe arithmetic | **Partial** | `Decimal` with precision 28/half-up is used in core helpers and most formulas. Reversal converts to JS `Number`; project AC reduces with `Number`; import validation lacks bounds. | Decimal/string end-to-end through persistence, calculations and reversals; currency-scale/rounding policy and property tests. |
| Original approved budget | **Fail** | Header trigger excludes `approved`; lines/months are mutable; rollback probe changed approved header. | Immutable approved baseline version including lines and time phasing. |
| Approved changes/current budget | **Fail** | Client-supplied unrelated IDs/amount; non-atomic; no monthly reconciliation. | Request-derived transactional version/change ledger with SOD and exact reconciliation. |
| One current approved version | **Fail** | Boolean flag has no partial unique index; approval is multi-call and race-prone. | Unique invariant plus one transactional state transition. |
| Posted actual immutability | **Partial/fail** | User RLS denies update/delete, but no physical trigger protects owner/service; inserted actuals default posted. | Controlled posting command and immutable posted-row trigger/privileged audit. |
| Allocation reconciliation | **Fail** | Deferred trigger prevents only over-allocation; under/unallocated posted actuals accepted. | Exact signed equality at posting, including credits/reversals. |
| Allocation tenant/dimension integrity | **Fail** | Referenced transaction/org/cost/project dimensions need not share tenant/scope. | Composite tenant keys/constraints and controlled dimension validation. |
| Reversal/replacement | **Fail** | Multiple reversals allowed; no allocations/period fidelity; non-atomic; role mismatch. | Idempotent one-reversal/replacement transaction with full dimension/period lineage. |
| Commitments | **Partial** | Open commitment formula is correct for the chosen definition; lifecycle/constraints are absent. | Approved commitment amendments/cancellations and reconciliation to invoices/actuals. |
| Invoices/payments/credits | **Scaffold** | Tabs exist; subledgers and matching controls do not. | Implement or remove from production scope and claims. |
| VAT/tax identity | **Partial** | Helpers calculate inclusive amounts, but database does not consistently constrain `inc = ex + vat` and reversal metadata is incomplete. | Database identity/rounding/tax-date constraints and tests. |
| PV/EV/AC inputs | **Fail** | PV=45% BAC, EV=35% BAC; AC is department-wide. | Status-date time-phased baseline, objective earned rules, project-coded posted AC. |
| CV/SV/CPI/SPI | **Formula pass; system fail** | Mathematical helpers correctly implement CV=EV−AC, SV=EV−PV, CPI=EV/AC, SPI=EV/PV with safe zero handling. Inputs are fabricated/mis-scoped. | Authoritative inputs and hand-reconciled scenario tests. |
| EAC/ETC/VAC | **Formula partial; system fail** | Helpers implement BAC/CPI and alternate actual+open+forecast variants; the UI/report lineage and variant label are not controlled. | Approved forecasting methodology, clearly labeled variants, authoritative commitments/forecast and audit. |
| Hospital MTD/YTD/forecast | **Fail** | Period 3 hard-coded; YTD includes all periods; actuals weakly scoped; forecast is YTD actual + one MTD budget. | Calendar/status-date derived period ranges and documented forecast formula. |
| Budget-vs-actual report | **Fail** | View joins only cost node/org across versions/entities/scopes/periods and ignores posted status. | Grain-specific tenant/scope/period/version/posting joins with non-duplication tests. |
| Original schedule baseline | **Partial** | Non-null overwrite triggers are positive; no versioned baseline history. | Immutable baseline versions and approved revision ledger. |
| Transaction atomicity | **Fail** | Approval, change, import, reversal, progress and schedule are multi-request operations. | Transactional RPC/command per controlled business event. |
| Concurrency/idempotency | **Fail** | No expected state/version on transitions; no unique current/reversal/file claims. | Optimistic/row locking, unique idempotency keys and concurrent regression suite. |
| CSV/XLSX safety | **Fail** | CSV formula injection; upload limits absent; vulnerable Excel parser. | Safe serialization, strict upload controls and supported parser. |

## 7. Approval and segregation matrix

| Workflow | Initiator permission | Approver/reviewer permission | Self-approval defense | State/atomicity | Audit | Result |
|---|---|---|---|---|---|---|
| Budget submit | `budget:update` | N/A | N/A | Any nonlocked row can be moved to submitted; no expected state | None | **Fail** |
| Budget review | `actual:read` is used | Same caller performs review | No preparer/reviewer comparison | Any status to under-review; one update | None | **Fail** |
| Budget approve/lock | `budget:approve` | Approver role via TypeScript | Checks submitter in action, not authoritative DB command | Deactivate/approve/lock are separate; no one-current invariant | None | **Fail** |
| Budget change request | `budget:update` | `budget:approve` | Action compares requester | Client supplies unrelated request/version/line/amount; three writes | None | **Fail** |
| Import prepare/post | `actual:import` | Same `actual:import`; same user stored as approver | **None** | Row loop and batch post are non-atomic | None | **Fail** |
| Actual reversal | N/A | `actual:approve` | No original preparer/poster SOD | Non-idempotent insert + separate audit; RLS role mismatch | Incorrect `update` event | **Fail** |
| Progress report | Project permission | Separate verifier path | Repository rejects same `reported_by` | No expected status; multi-write | None | **Partial/fail** |
| Milestone accept | Project approval | Approver action | No creator/acceptor relation check shown | Repeatable update + separate audit | One explicit event | **Fail** |
| Schedule extension | Requester | Project approver | Repository rejects same requester | Repeat approval cumulatively extends forecast; non-atomic | None | **Fail** |
| Unified approval inbox | Various | Unscoped role policies | Per-workflow and view inconsistent | View includes only pending states; approved/rejected/delegated tabs are not real history | None | **Fail/leak** |
| Risk/issues/actions/decisions | Broad member/role insert | No complete approval lifecycle | Not consistently applicable/enforced | Mostly insert/read only | None | **Partial** |

Segregation is split between UI/action checks, repository checks and unscoped RLS helpers. Because server actions are independently callable endpoints and service/SQL paths exist, production SOD must be enforced in one authoritative transactional database command per workflow, with actor identity derived from the session and explicit preparer/approver relationship checks.

## 8. Migration-safety assessment

| Area | Assessment | Evidence/risk | Disposition |
|---|---|---|---|
| Fresh local replay | **Pass** | All 16 migrations applied on first local reset. | Necessary but not sufficient. |
| Production/test data separation | **Critical fail** | Fixed-password personas and destructive seed cleanup are ordinary migrations. | Split before merge; rotate affected shared environments. |
| Data API privileges | **Critical fail** | No table/default privileges; clean application is unusable. | Add explicit least-privilege grants only after RLS coverage. |
| RLS/view safety | **Critical fail** | 14 tables RLS-off; two granted definer views leak tenants. | Reclassify schema, repair views/policies, revoke until verified. |
| Destructive behavior | **Fail** | `DELETE` of seed-domain data in migration; no environment condition. | Never rewrite business/reference data implicitly in production schema promotion. |
| Backfill/default safety | **Unproven** | Migrations are evaluated only against small empty/seeded DB; no large-table lock/backfill analysis. | Rehearse on production-shaped clone with locks/timeouts and backup. |
| Roll-forward/rollback | **Unproven** | No rollback/runbook, preflight, backup/restore or failure recovery evidence. | Define forward-fix and restore plan per release. |
| Function privilege safety | **Partial** | Two definer helpers revoked from PUBLIC but use `public` search path; trigger functions keep PUBLIC execute. | Harden ACL/schema/search path. |
| Version determinism | **Fail** | CI installs Supabase CLI `latest`; image versions can drift. | Pin CLI and containers/toolchain. |
| Migration ordering | **Partial** | Timestamp ordering is deterministic; later files repair earlier policy/view behavior, increasing interim-state risk. | Squash only before first production release if governance permits, or ensure every deployed boundary is safe. |
| Production authorization | **Absent** | No proof this audit accessed production (it did not), and no environment/promotion approval guard is in repo. | Add protected environments and separate credentials/promotion workflow. |

## 9. Test-evidence assessment

### Independent first-run results

No command was retried. A retry is therefore not represented as stability evidence. All database operations targeted the isolated local Supabase project.

| Requested operation | First attempt | Duration | Evidence |
|---|---:|---:|---|
| `npm ci` | **Pass** | 128.9 s | 613 packages; one high vulnerability; three dependency install scripts reported as not approved. |
| `supabase start` (local CLI via `npx`) | **Pass** | 11.5 s | Local services started; deprecated config and stopped optional vector-service warnings. |
| `supabase db reset` (local CLI via `npx`) | **Pass** | 152.0 s | PostgreSQL 17.6 image pulled; all 16 migrations and seed behavior applied. |
| `npm run lint` | **Pass** | 12.3 s | No lint error at final head. |
| `npm run typecheck` | **Pass** | 6.1 s | TypeScript passed. |
| `npm run test` | **Fail** | 8.6 s | 24/26 pass; two DB integration tests fail on `budget_versions`/`control_scopes` privileges. Multiple GoTrue client-instance warning. |
| `npm run test:db` | **Fail** | 1.1 s | 12/15 pass; three RLS checks fail at table privileges for legal entities/budgets. |
| `npm run test:e2e` | **Fail** | 236.4 s | 11/17 pass; six fail across budget controls, auth shell/sign-out, milestones and tasks. Permission/auth errors logged. |
| `npm run build` | **Pass** | 19.7 s | 61 routes generated. Next middleware and workspace-root warnings remain. |

### Evidence quality by risk area

| Risk area | Existing evidence | Quality conclusion |
|---|---|---|
| Money helper formulas | Focused unit tests | Useful positive coverage; limited boundary/property/rounding/currency coverage. |
| Auth permission map | Unit tests | Covers selected role cases; does not prove SQL/app parity, tenants, effective dates or inactive users. |
| Repository integration | Two database-backed hospital workflow tests | Bypasses server actions and currently fails at grants; one tenant only. |
| RLS | 15 custom script checks; placeholder pgTAP | Incomplete and partly vacuous; no 54-table/view/operation matrix. |
| Workflow state/SOD | Sparse E2E/repository tests | No comprehensive invalid-edge, self-approval, replay or concurrent tests. |
| Financial reporting | Heading/value-presence checks | No independent hand reconciliation; fabricated/mis-scoped inputs pass unnoticed. |
| Import | Parser/money unit tests only | No posting transaction, duplicate race, malicious file or rollback tests. |
| Audit | Page-level checks | No authenticity, tenant, append-only or event-completeness tests. |
| Export | Download path | No formula injection/content/type tests. |
| Localization | Limited auth/navigation tests | No route-wide RTL/accessibility/financial formatting verification. |
| Performance/migration safety | None | No production-scale data, plans, lock timing, backfill or restore exercises. |

## 10. CI stability assessment

At the audited SHA the PR is open, mergeable at the Git graph level, but `mergeStateStatus=UNSTABLE` because both checks fail.

| Run | Trigger | Head | Result | First failing stage | Downstream consequence |
|---|---|---|---|---|---|
| [31041566204](https://github.com/ahmeds-almodawat/Budget/actions/runs/31041566204) | Pull request | `97049df` | **Failure** | Unit/integration: table permissions | DB, E2E and build skipped. |
| [31041559715](https://github.com/ahmeds-almodawat/Budget/actions/runs/31041559715) | Push | `97049df` | **Failure** | Unit/integration: table permissions | DB, E2E and build skipped. |

The failure evolution also matters: at `ce1fc16` Linux `npm ci` failed due a lockfile dependency; at `a7dfddf` lint included Supabase temporary artifacts; `97049df` fixes those but exposes the database privilege failure. This is evidence of successive first-run breakage, not a stable final run. Playwright's configured two CI retries must be reported as retries if retained. The independent Windows build passed, but Windows E2E failed on first attempt; no claim of flaky recovery is possible because no retry was run.

## 11. Remaining scaffold and partial-module inventory

| Module/claim | Actual state | Classification | Production impact |
|---|---|---|---|
| Cost control | `ModulePlaceholderPage` route | Intentionally deferred | Cannot provide cost-control workflow. |
| Forecasts | Placeholder UI; forecast tables exist without RLS/workflow | Intentionally deferred + security defect | No governed forecast/EAC source. |
| Administration | Placeholder UI | Intentionally deferred | No lifecycle/delegation/control administration. |
| Master data | Placeholder UI | Intentionally deferred | No governed vendors/GL/mappings/org/WBS maintenance. |
| Employee performance | Seed-backed counts/scorecard presentation; no complete objectives, weighting, review/calibration workflow | Partial/scaffold | Cannot support defensible performance decisions. |
| Delegated approvals | Tab/count exists; repository returns empty behavior | Partial/scaffold | Absence/delegation SOD not supported. |
| Approval history | View only includes pending/submitted/under-review items; approved/rejected tabs cannot be authoritative history | Implementation defect | Misleading approval workspace. |
| Invoices/payments/credit notes | Tabs/placeholders without subledger models | Intentionally deferred | Commitments/actuals/payment reconciliation incomplete. |
| Evidence uploads | Writes metadata with fixed `field-report.txt`; no controlled object storage upload/scanning/access | Partial/scaffold | Evidence is not durable/verifiable. |
| Budget workflow | Hospital-specific, fixed entity/scope/year; unsafe transitions/change control | Partial + implementation defects | Not enterprise/multi-entity ready. |
| Actual import | Parses/stores/posts, but unsafe/unbounded/non-atomic/self-approved | Partial + implementation defects | Cannot be a production journal interface. |
| Audit workspace | Search UI exists; schema/repository/authenticity defects | Partial + implementation defects | Not a reliable audit trail. |
| Reports/exports | Several DB-backed routes exist; commitment label is inaccurate; financial joins/formulas/export safety fail | Partial + implementation defects | Material reporting risk. |
| Restaurant operations | Seeded branch KPI view exists; cross-tenant/unposted leakage | Partial + critical defect | Must be revoked/rebuilt. |
| Risk/issue/action/decision | Basic insert/read registers | Partial | No full ownership, approval, closure, escalation or audit lifecycle. |
| Production authentication | Password/local personas; no SSO/MFA/lifecycle | Intentionally deferred | Production blocker. |

Documentation should distinguish these states explicitly. `COMPOSER_COMPLETION_REPORT.md`, `CODEX_HANDOFF.md`, `IMPLEMENTATION_STATUS.md`, `REPORT_CATALOG.md`, `SECURITY_REVIEW.md` and `IMPLEMENTATION_PLAN.md` currently disagree on module completion, export readiness, policy counts, test results and next priorities.

## 12. Prioritized remediation plan

### Priority 0 — Contain and re-establish trustworthy release evidence

1. Keep PR #1 unmerged and mark it non-production.
2. Revoke access to `v_approval_inbox` and `v_restaurant_branch_performance` in any shared environment until rebuilt; inspect access logs if either was deployed.
3. Determine whether fixed-password migrations ran anywhere shared; disable/rotate all seeded accounts and credentials.
4. Replace completion claims with this exact-SHA first-run evidence; require a green immutable SHA.

### Priority 1 — Rebuild the authorization boundary

1. Classify public/private objects; move internal tables/functions private.
2. Enable and review RLS for every exposed table; specify policy roles and force RLS where owner-path expectations require it.
3. Fix definer views, legal-entity/scope/effective-date authorization and inactive profile handling.
4. Add explicit least-privilege table/sequence/function grants only after the corresponding RLS tests exist.
5. Add a generated live-catalog matrix plus two-tenant/no-membership direct SQL and action tests.

### Priority 2 — Make controlled financial events transactional and immutable

1. Define state machines and SOD for budgets, changes, imports, actual posting, reversals, progress and schedule.
2. Implement one transactional/idempotent database command per event with expected state/version and actor derived from session.
3. Add one-current-budget, one-reversal/idempotency, tenant-consistency, amount/range, exact allocation and period-close constraints.
4. Make approved budgets/lines/months and posted actuals physically immutable; version approved changes and baselines.
5. Generate authoritative, tenant-scoped, append-only audit events in the same transaction.

### Priority 3 — Correct financial/reporting lineage

1. Define grain and source-of-truth for budget, actual, commitment, project, period and control account.
2. Rebuild budget-vs-actual and hospital reports with tenant/scope/version/period/posting joins and no duplication.
3. Implement status-date, time-phased PV; objective EV; project-coded posted AC; approved forecast/EAC methodology.
4. Hand-reconcile all formulas and multi-period/two-tenant examples; retain Decimal end-to-end.

### Priority 4 — Secure data ingress and egress

1. Replace/isolate vulnerable XLSX parsing and add strict byte/decompression/row/cell/type limits.
2. Store raw-byte hashes, unique idempotency keys and quarantined validation results.
3. Separate importer/reviewer/poster and make posting all-or-nothing.
4. Neutralize spreadsheet formulas in CSV/XLSX and test malicious bilingual cells.

### Priority 5 — Complete or de-scope the product

1. Either implement commitments/invoices/payments/credits, forecasts, administration, master data, employee performance, delegated approvals and evidence storage, or remove/label them as unavailable.
2. Complete catalog-based localization and route-wide RTL/accessibility verification.
3. Add workload indexes based on production-scale plans.
4. Implement SSO/MFA, user lifecycle, secret rotation, period close, monitoring, audit retention, backup/restore, DR and migration promotion controls.

### Exit criteria for a second audit

- Exact reviewed SHA and clean worktree.
- No fixed credentials or production data mutations in migrations.
- Complete grants/RLS/view/function matrix with two-tenant negative tests.
- Transactional financial workflows and immutable/audited approved/posted records.
- Independently reconciled financial/EVM/report fixtures.
- First-attempt green Windows and Linux runs for every requested command; retries reported separately.
- No high dependency vulnerability and malicious upload/export tests pass.
- Documentation generated or updated from executable evidence and accurately labels every scaffold.
- Production readiness evidence for identity, secrets, close, monitoring, audit retention, backup/restore and migration recovery.

## Final recommendation

**Do not merge `feature/enterprise-control-platform` into `main` in its audited state, and do not deploy it to production or use it for real financial/performance decisions.** Review and authorize remediation separately, beginning with the critical containment and authorization items. No corrections are implemented by this audit.
