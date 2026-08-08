# Production rollback runbook

**Status:** future controlled procedure; no rollback was executed during this
audit.
**Principle:** restore service and control integrity without inventing reverse
SQL or erasing evidence.

## Preconditions

Rollback is not credible until the organization has:

- an approved incident commander and decision matrix;
- a recorded pre-change recovery point and verified isolated restore;
- an encrypted logical backup plus checksum and access test;
- an eligible known-good Vercel deployment compatible with both old and new
  schema states;
- exported Auth/Vercel/Supabase/monitoring configuration without secret values;
- measured RTO/RPO and business-approved maximum data loss;
- contact paths for DBA, identity, Vercel, security, finance, and business owners.

The migration repository has no supported down-migration chain. Never improvise
`DROP`, `DELETE`, migration-history repair, or `supabase db reset` in production.

## Immediate incident actions

1. Incident commander declares severity, records UTC time, release SHA,
   deployment ID, migration versions, symptoms, and affected tenants/workflows.
2. Stop further promotion/migration/configuration. Preserve logs and terminal
   output; do not rerun a failed migration.
3. If data integrity is at risk, disable application writes or enter maintenance
   mode using the pre-approved mechanism.
4. Capture current database backup/recovery position before any recovery action.
5. Determine whether the failure is application-only, database/configuration, or
   both. Vercel rollback cannot reverse database or Auth changes.
6. Select the smallest safe recovery path below and obtain the required approver.

## A. Application rollback

Use when the database migration is successful and backward-compatible, but the
new application artifact is faulty.

1. Confirm the known-good deployment supports the current schema and environment
   variables. If not, do not use application-only rollback.
2. Record the current and target deployment URLs/IDs and SHAs.
3. Vercel operator requests Instant Rollback to the approved target.
4. Verify rollback status and that production domains point to the target.
5. Run sign-in, tenant denial, critical read routes, CSP, server-error, and
   financial read-only smoke checks.
6. Confirm monitoring recovery and retain the failed deployment/logs.

Vercel rollback changes the served deployment; it does not rebuild with changed
environment variables. After a rollback, production-domain auto-assignment may
remain disabled until a later approved promotion. See the
[Vercel rollback guide](https://vercel.com/docs/deployments/rollback-production-deployment).

## B. Database rollback after a completed migration

Use only when forward-fix is unsafe and the approved recovery decision accepts
the RPO/downtime impact.

1. Stop all application/database writers and capture a fresh incident backup.
2. Identify transactions committed after the pre-change recovery point and
   obtain finance/business disposition for potential data loss/replay.
3. Prefer restoring/PITR to a new isolated project first. Validate catalog,
   Auth/profile consistency, row counts, financial control totals, audit events,
   RLS/FORCE, views, RPC ACLs, and application compatibility.
4. Execute the approved hosted restore/cutover procedure. Supabase restore can
   make the project unavailable; communicate the measured downtime.
5. Reapply only separately approved post-recovery transactions from authoritative
   sources with reconciliation and audit.
6. Point the application only to a fully verified recovered database, using
   controlled secret/environment change and a new deployment.
7. Run all security, identity, financial, and monitoring checks before reopening.

Do not write ad hoc reverse DDL against financial/audit data. Use a separately
reviewed forward corrective migration only when it is demonstrably safer than
restore and preserves data/evidence.

## C. Failed migration

1. Keep the old application serving only if schema compatibility and data safety
   are proven; otherwise disable writes.
2. Record the exact failing file, statement, SQLSTATE, transaction state, lock
   graph, and whether the migration history row was written.
3. Determine from catalog/data evidence—not assumption—whether PostgreSQL rolled
   back the file fully.
4. If fully rolled back and no side effects remain, correct/rehearse a new
   additive migration on a fresh restored copy before another change request.
5. If any effect committed, use the partial-migration procedure.
6. Never mark the migration applied/reverted with `migration repair` merely to
   bypass the failure.

## D. Partial migration chain

1. Freeze writes and preserve evidence.
2. Capture local versus production migration history and the dry-run suffix.
3. Inventory every object/data change for each applied version; validate grants,
   RLS, triggers, indexes, constraints, views, functions, and backfills.
4. Decide among:
   - retain the applied compatible prefix and deploy the old compatible app;
   - apply an approved, rehearsed forward fix;
   - restore/PITR to the pre-change recovery point.
5. Finance and security must approve any choice that preserves a partial prefix.
6. After recovery, rerun the complete catalog and financial sanity gates.

## E. Auth/configuration rollback

1. Stop new onboarding and preserve Auth/security logs.
2. Compare current settings with the approved pre-change snapshot: providers,
   Site URL, redirect allowlist, signup, password/confirmation, MFA, sessions,
   CAPTCHA/rates, SMTP, and templates.
3. Restore only the specific prior approved values under dual control.
4. Provider/IdP rollback must account for sessions already issued. Revoke affected
   sessions when required; deleting a user alone does not immediately invalidate
   an existing JWT.
5. Validate sign-in, callback, MFA/AAL, logout, recovery, invite, offboarding, and
   tenant access with named test identities.
6. If corporate SSO is unavailable, invoke the approved break-glass policy; do
   not enable public signup or a shared password.

## F. Secret rotation rollback

1. Treat a failed rotation as a security incident if either value may have been
   exposed.
2. Do not restore a compromised previous secret. Issue a new value instead.
3. If the previous value is not compromised, use only the pre-approved overlap
   window while the new deployment is validated.
4. Update the authoritative secret store/Vercel environment, create a new
   deployment, verify server and browser exposure, then revoke the superseded
   value.
5. Confirm Preview and Development did not inherit Production values.
6. Record secret identifiers and timestamps, never the values.

## Storage/email integration rollback

These integrations are currently deferred. If later enabled:

- Storage rollback must preserve object versions, metadata consistency, access
  policies, malware status, and retention/legal hold. Database restore alone
  does not restore deleted Storage objects.
- Email rollback must stop duplicate sends, preserve delivery evidence, revoke
  failed provider keys, and verify Auth recovery/invitation delivery before
  reopening those flows.

## Verification after any rollback

| Gate | Required evidence |
|---|---|
| Deployment | Served SHA/deployment ID and domain mapping |
| Database | Migration list, catalog counts, constraints/indexes/triggers |
| Authorization | 107/107 RLS+FORCE or approved target counts; all policy roles; tenant denial |
| Views/RPCs | Security-invoker views; empty-path SECURITY DEFINER RPCs; no anon/PUBLIC execute |
| Identity | Provider, callback, session, MFA, provisioning/offboarding checks |
| Audit | Append-only behavior and complete incident/change events |
| Financial | Signed pre/post totals and reconciliations |
| Monitoring | Error rate, latency, Auth/DB alerts, uptime, on-call receipt |
| Secrets | No secret/browser/log exposure; superseded values revoked |

## Reopening criteria

Production may reopen only when the incident commander, DBA, security owner,
identity owner, Vercel operator, and finance control owner approve the recovered
state. Unexplained financial differences, cross-tenant access, missing audit
evidence, failed monitoring, or uncertain migration history are hard no-go
conditions.

## Post-incident requirements

1. Preserve the full timeline, approvals, logs, commands, and recovery evidence.
2. Reconcile any transaction replay with source systems and audit IDs.
3. Complete root-cause analysis and update tests/runbooks.
4. Rotate exposed credentials and review all access.
5. Rehearse the corrected release on a fresh restore; a successful retry does not
   erase the original failure.
