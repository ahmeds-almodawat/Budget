# Production deployment runbook

**Status:** future controlled procedure; this audit did not execute any step
against production.
**Repository baseline reviewed:** `69d9a5bcf116ce9a6f9788c0afd3c9674075c89f`

## Stop conditions before scheduling

Do not schedule or begin a production change window while any of these remains:

1. The migration chain still inserts deterministic demonstration business data.
2. The exact target migration history and dry-run suffix are unknown.
3. A sanitized production-scale rehearsal and lock-duration report are absent.
4. A verified backup/restore and approved rollback decision are absent.
5. Production Auth/IdP/MFA/provisioning and canonical URLs are undecided.
6. Strict CSP, safe post-login redirect validation, and security headers are
   unimplemented.
7. Central monitoring, paging, and uptime checks are unverified.
8. Approval-rule version retention is unimplemented.
9. Required master/reference data lacks signed owner approval.

## Roles and segregation

| Role | Responsibility | Must not be same person where practical |
|---|---|---|
| Release manager | Freeze SHA, coordinate gates, record go/no-go | Production migration executor |
| DBA/Supabase operator | Backup, dry-run, migration, DB verification | Migration approver |
| Identity operator | Auth/IdP/SMTP/session configuration | Identity approver |
| Vercel operator | Stage and promote/rollback application | Deployment approver |
| Security approver | CSP, secrets, tenant probes, risk exceptions | Primary implementer |
| Finance control owner | Opening data and financial sanity signoff | Data loader |
| Business owners | Legal entity, procurement, HR/appraisal configuration | Data loader |
| Incident commander | Own rollback decision and communication | Change executor |

Every operator records identity, UTC timestamp, command/tool version, target
project identifier, frozen SHA, result, and evidence location. Commands must not
print secrets or connection strings into tickets or CI logs.

## Exact local migration sequence

An empty database currently receives all 53 files in this order:

```text
01  20260805120000_extensions_and_organization.sql
02  20260805120100_auth_and_audit.sql
03  20260805120200_control_scopes_projects_wbs.sql
04  20260805120300_cost_structure_budgets.sql
05  20260805120400_actuals_commitments_forecasts.sql
06  20260805120500_rls_policies.sql
07  20260805120600_seed_data.sql
08  20260805120700_integrity_triggers_rls.sql
09  20260805120800_workflow_seed_users.sql
10  20260805120900_auth_rls_expansion.sql
11  20260805121000_fix_auth_user_tokens.sql
12  20260805121100_fix_budget_version_update_rls.sql
13  20260805121200_project_schedule_progress.sql
14  20260805121300_risk_issue_action_decision.sql
15  20260805121400_approvals_workspace.sql
16  20260805121500_restaurant_operational.sql
17  20260805205823_authorization_boundary.sql
18  20260806040000_p2_command_framework_audit.sql
19  20260806040100_p2_budget_state_machine.sql
20  20260806040200_p2_import_actuals_reversals.sql
21  20260806040300_p2_progress_schedule.sql
22  20260806040400_p2_rpc_definer_wrappers.sql
23  20260806040500_p2_budget_approve_amount_fix.sql
24  20260806040600_p2_budget_status_transition_fix.sql
25  20260806040700_p2_private_function_acls.sql
26  20260806040800_p2_budget_current_unique_fix.sql
27  20260806090000_p3_reporting_forecast_indexes.sql
28  20260806100000_p3_budget_change_approve_fix.sql
29  20260806110000_p4_forecast_state_machine.sql
30  20260806120000_p4_forecast_supersede_transaction.sql
31  20260806120100_p4_forecast_lock_role_fix.sql
32  20260806120200_p4_forecast_data_api_read.sql
33  20260806130000_p5_enums_and_master_data.sql
34  20260806130100_p5_delegated_approvals.sql
35  20260806130200_p5_period_close.sql
36  20260806130300_p5_procurement_lifecycle.sql
37  20260806130400_p5_approval_rule_versioning.sql
38  20260806130500_p5_approval_item_types.sql
39  20260806130600_p5_rls_grants_inbox.sql
40  20260806130700_p5_approval_inbox_view.sql
41  20260806130800_p6_revenue_reference_and_dimensions.sql
42  20260806130900_p6_revenue_reporting_views.sql
43  20260806131000_p6_revenue_rls_grants.sql
44  20260807100000_audit_search_rpc.sql
45  20260807120000_ultra_procurement_sourcing.sql
46  20260807120100_ultra_procurement_purchasing.sql
47  20260807120200_ultra_delegation_period_appraisal.sql
48  20260807120300_ultra_requisition_procurement_review_rpc.sql
49  20260807120400_ultra_classification_comments.sql
50  20260807120500_ultra_grant_resolve_approver.sql
51  20260807120600_ultra_appraisal_profile_peers.sql
52  20260807120700_enforce_workflow_authorization_and_integrity.sql
53  20260807132939_final_blocker_closure.sql
```

This is an inventory, not authorization. Files 07, 09, 13, 14, and 16 include
demonstration/business DML and currently block the empty production path.

### Existing production database

The target-specific sequence is not knowable from the repository alone. After
explicit read-only production authorization, the DBA must capture:

```powershell
supabase migration list --linked
supabase db push --dry-run --linked
```

The exact sequence is the ordered set of local versions missing from the target
history. Save both outputs as change evidence. Do not use `--include-all`,
`migration repair`, or a direct database URL to force a mismatch without a
separate DBA-approved reconciliation plan.

## Migration preflight on a sanitized restore

1. Restore a recent production backup to an isolated, access-controlled project.
2. Confirm PostgreSQL major version 17 compatibility and the required
   `pgcrypto`/`btree_gist` extensions.
3. Capture current migration history, table/row sizes, long-running queries,
   replication/backup status, and available disk/WAL capacity.
4. Detect all deterministic scenario IDs/codes and classify each as real,
   legacy test, or collision. Do not delete automatically.
5. Check duplicates that would violate every new unique index, including current
   budgets/forecasts, reversals, live award-to-PO, invoice replacements,
   workflow pending assignments, active/versioned period and appraisal
   templates, governed master revisions/current rows, document lines, and awards.
6. Check hierarchy cycles, out-of-range progress, cross-entity fiscal/document
   relationships, invoice/commitment reconciliation, and incomplete allocation
   debt.
7. Run the exact dry-run suffix and then apply it only to the isolated restore.
8. Record each migration's duration, lock waits, blocked sessions, CPU, memory,
   disk/WAL growth, errors, and row counts changed.
9. Run the catalog, RLS, tenant isolation, workflow, financial reconciliation,
   and application smoke suite.
10. Repeat from a newly restored copy. A retry after a failed first rehearsal is
    not first-run stability; retain both results.

Any duplicate cleanup, backfill, or quarantine requires a separately reviewed,
auditable data-change script and finance/data-owner approval.

## Backup prerequisites

Before the production window, the DBA must prove all of the following:

- Hosted backup/PITR policy and current recovery window meet approved RPO/RTO.
- A pre-change recovery point exists and its timestamp is recorded.
- An encrypted logical backup has been created with `supabase db dump`/approved
  `pg_dump`, stored off-platform, access-tested, and checksum-verified.
- A restore into an isolated project has completed and passed row-count,
  constraint, Auth-profile, RLS, financial-total, and audit checks.
- Storage objects have a separate backup if object storage is ever enabled;
  database backups contain only Storage metadata.
- Auth/IdP, redirect, email-template, SMTP, Vercel environment/domain, and
  monitoring configurations have been exported or captured without secret
  values.
- The rollback target Vercel deployment is retained and schema-compatible.

See the [Supabase backup guide](https://supabase.com/docs/guides/platform/backups)
and `PRODUCTION_ROLLBACK_RUNBOOK.md`.

## Future controlled release sequence

### 1. Freeze release SHA

1. Select a reviewed commit already green on Linux CI.
2. Record the full SHA; disallow force-push and dependency/config drift.
3. Build the production artifact from that SHA with Node 22.x and `npm ci`.
4. Attach test, audit, SBOM/dependency, migration, and approval evidence.

### 2. Backup

Complete every backup prerequisite above. Record recovery-point time in UTC and
the maximum acceptable data loss. Do not continue on an unverified backup.

### 3. Verify production environment

Using read-only views/tools where possible, compare hosted settings to
`PRODUCTION_CONFIGURATION_MATRIX.md`. Verify project identifiers, region,
Postgres version, plan/capacity, network restrictions, domain/TLS, environment
separation, Auth providers, Site URL/redirects, SMTP, sessions/MFA, monitoring,
and backup status. Never print values.

### 4. Migration dry-run and rehearsal

1. Re-run migration list and `db push --dry-run` against the authorized target.
2. Compare byte-for-byte with the approved rehearsal suffix.
3. Confirm no seed/fixture flag or fixture path is present.
4. Confirm the data-pollution blocker has been resolved in the approved release.
5. Revalidate expected lock/downtime and rollback thresholds.

Any difference is a no-go.

### 5. Production migrations

1. Announce change start and, if required by measured locks, enter a controlled
   maintenance/read-only window.
2. Stop background writers/imports. No scheduled jobs exist in the current
   repository, but confirm hosted state.
3. Apply only the approved suffix using the pinned Supabase CLI version.
4. Stream sanitized output to the change record.
5. On any error, stop and invoke the failed/partial migration procedure. Do not
   rerun blindly and do not mark migration history repaired merely to continue.
6. Capture final migration list and catalog counts.

### 6. Auth and configuration

Apply only the approved hosted settings. Verify public signup, providers,
password policy, confirmation, callbacks, session limits, MFA, CAPTCHA/rates,
SMTP, and email templates. Do not create deterministic or shared-password users.

#### Initial administrator bootstrap

This is a dual-controlled operation after approved organization/legal-entity
master records exist:

1. Identity operator creates or invites one named break-glass/initial admin in
   Supabase Auth or provisions it through the approved IdP.
2. Verify corporate identity and factor enrollment; capture the Auth UUID without
   exposing tokens.
3. DBA executes a reviewed transaction that inserts the matching `profiles` row,
   active `memberships` row, and the minimum scoped `role_assignments` row. For a
   group administrator, `scope_id` must be the approved organization ID; for a
   legal-entity administrator, use that entity and role.
4. A second approver compares UUID, email, organization/entity, role, scope, and
   effective dates before commit.
5. Sign in, select the active entity, and prove intended access plus tenant-B
   denial.
6. Use that governed identity process to provision remaining users. Retain a
   separately monitored break-glass account with time-bound use.

There is no automatic profile/membership trigger; an Auth user alone cannot use
the application safely.

### 7. Application deployment

1. Build a staged production Vercel deployment from the frozen SHA with
   production-scoped variables.
2. Keep production-domain auto-assignment disabled.
3. Inspect build output and runtime startup; verify the release SHA.
4. Do not use Preview variables or a Preview Supabase project for this artifact.
5. Promote the exact staged artifact only after steps 8–11 pass in its staging
   access path and the migration is confirmed.

### 8. Smoke tests

Run non-destructive tests using named production test identities and approved
test tenant data only:

- English and Arabic sign-in, sign-out, session refresh, access-denied behavior.
- Unauthenticated redirect and validated internal post-login destination.
- Active legal-entity selection and tenant-A/tenant-B denial.
- Read dashboards, project timeline, budgets, approvals, procurement, period
  close, appraisal self view, reports, audit search, and administration inventory.
- Verify no demo organization/project/risk/actual or `@modawat.local` identity.
- Verify light/dark and RTL/LTR on critical routes.

Do not post an actual, approve a real payment request, close a period, or mutate
real master data as a smoke test.

### 9. Security checks

1. Confirm HTTPS/HSTS and the exact strict CSP/security headers.
2. Confirm the inline theme script and framework scripts carry the nonce.
3. Test `redirectTo=javascript:...`, absolute URLs, protocol-relative URLs, and
   encoded variants are rejected.
4. Confirm no service-role key/client secret appears in browser bundles, page
   source, logs, or errors.
5. Re-run RLS/FORCE RLS, policy role, invoker view, RPC search-path/ACL catalogs.
6. Execute tenant denial and privileged-role negative probes.
7. Verify WAF/rate limits, MFA/AAL2, session timeout, and Auth alerts.

### 10. Financial sanity checks

Finance signs recorded, read-only queries for:

- opening approved budget, actual, commitment, invoice, and payment-ready totals;
- budget allocation and actual allocation reconciliation;
- approved invoice commitment relief and reversed exposure;
- budget/current-version uniqueness and baseline immutability;
- PV, EV, AC, CV, SV, CPI, SPI, EAC, ETC, and VAC on approved sample projects;
- revenue gross-to-net, VAT treatment, profitability, fiscal MTD/YTD cutoffs;
- zero fake restaurant transactions and explicit known allocation debt only if
  formally accepted for the production dataset.

Differences from the signed pre-migration control totals trigger rollback review.

### 11. Monitoring verification

Send test events for application error, server error, Auth failure, database
warning, security alert, and uptime failure. Confirm receipt, severity, routing,
redaction, correlation ID, release SHA, and on-call acknowledgement. Verify the
audit trail remains append-only and queryable by authorized auditors.

### 12. Go/no-go decision

Required unanimous approvals: release manager, DBA, security, identity, Vercel
operator, finance control owner, and affected business owners. Record every gate
as pass/fail with evidence. Silence or unavailable monitoring is a no-go.

### 13. Rollback trigger criteria

Invoke the rollback runbook for any of:

- migration error, unexpected suffix, or unapproved DML;
- lock/downtime beyond the rehearsed threshold;
- RLS/FORCE/ACL/view catalog mismatch or cross-tenant access;
- login/MFA/callback/provisioning failure without safe workaround;
- material financial/control-total mismatch;
- sustained 5xx/error-rate or critical latency breach;
- missing audit/security evidence;
- CSP blocks required application behavior or allows an unapproved origin;
- monitoring/backup becomes unavailable during the window.

## Post-release hold period

Maintain heightened monitoring, restrict nonessential configuration changes, and
review Auth, RLS, database, application, and financial alerts through the
approved hold period. Record a formal closure only after finance and security
sign off. Payment approval remains ready-for-payment; no bank execution is part
of this release.
