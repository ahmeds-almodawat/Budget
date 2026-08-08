# Production readiness audit

**Repository:** `ahmeds-almodawat/Budget`
**Authoritative main:** `69d9a5bcf116ce9a6f9788c0afd3c9674075c89f`
**Audit branch:** `prod/production-readiness`
**Audit date:** 2026-08-08 (Asia/Riyadh)
**Mode:** local and repository-only; no production Supabase, Vercel, Auth, user,
secret, deployment, migration, or external provider was accessed or changed

## Executive conclusion

The application and database controls pass the prescribed safe local checks,
but the platform is **not ready for production promotion**. The correct overall
classification is `BLOCKER`.

The most immediate database blocker is independently reproduced: the migration
chain described as production-safe creates deterministic Al Modawat scenario
data on an empty database. A fresh `supabase db reset --no-seed` produced zero
Auth users but also produced one organization, one legal entity, seven
organization units, three control scopes, one project, one risk, six actual
transactions, one fiscal year, and twelve fiscal periods. The current safety
script checks forbidden Auth/test-persona patterns but does not prohibit these
business fixtures.

Production identity, domain, Vercel, strict CSP, monitoring, backup/restore,
SMTP, and initial provisioning are also unconfigured. An unsafe post-login
redirect accepts an untrusted `redirectTo` value and passes it to
`router.push`, which Next.js documents as an XSS risk for `javascript:` URLs.
Approval workflows also do not retain the applicable approval-rule version on
submission. These are launch blockers, not documentation-only gaps.

## Evidence snapshot

| Evidence | Result | Interpretation |
|---|---|---|
| Baseline | Exact required main SHA; clean tree before branch creation | `READY` |
| `npm ci` | 699 packages; completed | `READY`; advisories retained below |
| Fresh migrations, no seed flag | All 53 migrations applied | Technically executable on empty local DB, but data-polluting |
| Existing migration safety script | Passed; zero Auth users | Test deficiency: does not detect deterministic business fixtures |
| Zero-fixture business-data probe | 1 org, 1 entity, 7 units, 3 scopes, 1 project, 1 risk, 6 actuals, 12 periods | `BLOCKER` |
| RLS/FORCE RLS | 107/107 public tables | `READY` in schema; hosted grants still require rehearsal |
| Views | 9/9 `security_invoker` | `READY` |
| Policies | 208/208 target `authenticated` | `READY` |
| Public RPCs | 115/115 SECURITY DEFINER; empty `search_path`; authenticated execute only; zero `PUBLIC`/`anon` execute | `READY` |
| Lint | Pass; two existing unused-variable warnings | `READY` with low-priority cleanup |
| Typecheck | Pass | `READY` |
| Unit/integration | 27 files, 174/174 pass | `READY` in isolated follow-up |
| i18n | EN 1067 / AR 1067, parity | `READY`; one intentional inline locale branch reported |
| Import security | 17/17 pass | `READY` for covered inputs |
| Concurrency | 9/9 pass | `READY` for covered commands |
| Database tests | 102/102 pass | `READY` for covered controls |
| Build | Next.js 16.3.0; 87/87 static-generation entries; pass | `READY` locally |
| First combined verification | Timed out after four minutes during the unit/integration stage without a footer; orphaned test processes were stopped | `REQUIRES CONFIGURATION` / environmental instability; not called first-run green |
| `npm audit --json` | 2 Moderate, 0 High, 0 Critical (`exceljs -> uuid`) | Documented exception; unresolved |

## Material production findings

### PRD-B-001 — Production migration path inserts demonstration business data

- **Classification:** `BLOCKER` — implementation/configuration defect.
- **Evidence:** `20260805120600_seed_data.sql`,
  `20260805120800_workflow_seed_users.sql`,
  `20260805121200_project_schedule_progress.sql`,
  `20260805121300_risk_issue_action_decision.sql`, and
  `20260805121500_restaurant_operational.sql` contain top-level deterministic
  inserts. The fresh local probe reproduced the resulting records.
- **Failure mode:** an empty production database is initialized with a named
  company, 2027 scopes/calendar, sample project/risk, cost/organization
  hierarchy, and posted restaurant actuals.
- **Impact:** fake master and financial data can be mistaken for production
  balances, collide with real codes/IDs, and contaminate reporting/audit.
- **Required correction:** preserve historical migration integrity, but create
  an approved production-baseline strategy that excludes/quarantines demo DML.
  Rehearse both a clean empty path and a legacy-existing path. Expand the safety
  script to assert zero tenant/business rows unless an explicitly approved
  initialization artifact is being applied.

### PRD-B-002 — Exact existing-database migration suffix and data quality are unknown

- **Classification:** `BLOCKER` — missing production evidence.
- **Evidence:** production was intentionally not accessed; no sanitized clone,
  remote migration history, row volume, duplicate preflight, or lock timing is
  present in the repository.
- **Failure mode:** the 53-file chain contains non-concurrent indexes, unique
  indexes, checked constraints, backfills, trigger/function replacements,
  grant changes, and view drops/recreates. An existing database may fail on
  duplicates/inconsistent relationships or experience blocking locks.
- **Required correction:** obtain an authorized read-only migration inventory
  and sanitized restore, run `supabase db push --dry-run`, execute the exact
  suffix against that restore, measure locks/duration, validate data, and prove
  rollback before scheduling production.

### PRD-B-003 — Production identity and administrator provisioning do not exist

- **Classification:** `BLOCKER` — configuration and operational control gap.
- **Evidence:** local Auth enables signup, permits six-character passwords,
  disables email confirmation/secure password change/MFA, and configures only
  loopback URLs. The app implements password sign-in; there is no SSO or MFA
  flow. No trigger creates `profiles`, memberships, or scoped roles for a new
  Auth user, and administration is a read-only inventory.
- **Impact:** production users cannot be safely onboarded/offboarded or assigned
  least privilege; local defaults are unsuitable for an enterprise financial
  platform.
- **Required correction:** identity-owner decision, hosted hardening, tested
  invite/SSO/MFA flows, dual-controlled bootstrap, lifecycle/offboarding runbook,
  and negative authorization smoke tests.

### PRD-B-004 — Strict CSP/security headers are absent and post-login redirect is unsafe

- **Classification:** `BLOCKER` — application security defect.
- **Evidence:** `next.config.ts` defines no headers; `src/proxy.ts` emits no CSP;
  `src/app/[locale]/layout.tsx` renders an inline theme script without a nonce.
  `src/components/auth/sign-in-form.tsx` reads `redirectTo` from the URL and
  passes it directly to `router.push`.
- **Impact:** the production application lacks a core browser injection boundary;
  a crafted login link can supply an untrusted navigation target.
- **Required correction:** allow internal locale-relative destinations only and
  reject schemes/hostnames; implement and test per-request nonce CSP plus the
  additional headers listed in the configuration matrix. Do not use
  `'unsafe-inline'` as the production resolution.

### PRD-B-005 — Backup, restore, and database rollback are unproven

- **Classification:** `BLOCKER` — operational control gap.
- **Evidence:** no production backup configuration, PITR decision, restore test,
  measured RTO/RPO, or migration rollback rehearsal exists.
- **Impact:** a failed migration or accounting-data corruption may have no
  time-bounded recovery path. Vercel rollback cannot undo database changes.
- **Required correction:** select plan/retention, enable platform backups/PITR as
  required, take an encrypted logical backup, restore to an isolated project,
  verify it, and approve the rollback runbook before migration.

### PRD-B-006 — Minimum production observability is absent

- **Classification:** `BLOCKER` — missing production control.
- **Evidence:** application errors use `console.error` with correlation IDs, but
  no central error tracker, log drain, alert routing, uptime monitor, database
  alert, Auth-failure monitor, or retention policy is configured.
- **Impact:** security, availability, and financial-workflow failures may remain
  undetected or lack durable evidence.
- **Required correction:** implement the launch controls in the monitoring
  matrix, prove redaction, trigger test alerts, and record on-call ownership.

### PRD-B-007 — Approval rule version is not retained on workflow submission

- **Classification:** `BLOCKER` — financial governance defect.
- **Evidence:** `src/config/route-inventory.ts` and
  `docs/FINAL_PLATFORM_CLOSURE.md` explicitly classify approval-rule retention
  as incomplete.
- **Impact:** an auditor may be unable to reproduce which approval rules,
  thresholds, and approver chain governed a historical submission after rules
  change.
- **Required correction:** bind immutable rule-version evidence to each governed
  submission and test rule changes between submit and approve.

### PRD-C-008 — Hosted Vercel, domain, environment, and Supabase settings are unknown

- **Classification:** `REQUIRES CONFIGURATION`, becoming `BLOCKER` at go-live.
- **Evidence:** no `vercel.json`, no local project link, no hosted-setting export,
  and no production domain/value inventory exist.
- **Required correction:** configure from the approved matrix, use isolated
  Preview values, prefer staged promotion, and independently verify every value
  without printing secrets.

### PRD-D-009 — Storage attachments and business email are intentionally deferred

- **Classification:** `INTENTIONALLY DEFERRED`, unless launch requirements say
  otherwise.
- **Evidence:** no storage buckets/policies/upload path or external business
  email provider exists. Progress/close “evidence” is text/reference data.
- **Boundary:** user-facing and operating procedures must not describe these as
  uploaded retained attachments or delivered external notifications. Auth SMTP
  is separate and is required if invite/password recovery is used.

## Database promotion status

### Empty database

The exact migration order is deterministic and all 53 files replay locally, but
the path is `BLOCKER` because of PRD-B-001. It must not be applied to a new
production project in its current form.

### Existing database

The exact suffix cannot be truthfully stated without the target migration
history. The ordered local chain is documented in
`PRODUCTION_DEPLOYMENT_RUNBOOK.md`; the target-specific sequence is the ordered
set difference between that list and the authorized target's migration table,
as confirmed by a linked read-only list and `db push --dry-run`. This is
`BLOCKER` until an operator supplies and rehearses that evidence.

### Lock/backfill/operator-risk groups

| Migration area | Risk on populated database | Required handling |
|---|---|---|
| Historical seed migrations | Demo data insertion/collision | Block; design production baseline/quarantine |
| Hierarchy and progress constraints | Table lock and validation scan; inconsistent rows can fail | Preflight all violations; measure on sanitized scale |
| Unique current/reversal/award/template indexes | Non-concurrent build; duplicate rows can fail; write blocking | Duplicate query, approved cleanup, lock window |
| Forecast/progress/template backfills | Row updates and trigger interaction | Count affected rows; transaction/WAL/replica impact |
| Authorization boundary/grants | Operationally breaking for undiscovered direct clients | Exercise every supported client and RPC smoke path |
| View/function/trigger replacement | Plan invalidation and brief object locks | Rehearse with representative load; monitor errors |
| Large final closure migration | Many constraints/indexes/triggers/functions in one file | Dedicated rehearsal, duration/lock evidence, rollback trigger |

No migration contains `CREATE INDEX CONCURRENTLY`; do not assume zero downtime
on a populated target.

## Auth and identity status

Production Auth is `BLOCKER`. The repository supports secure SSR cookie sessions
and validates users server-side, but it does not select/configure the production
provider, enforce AAL2, provision identities, or bootstrap the first
administrator. Required values and a safe bootstrap sequence are in the
configuration matrix and deployment runbook.

## Vercel and CSP status

- Vercel: `REQUIRES CONFIGURATION`; domain/environment isolation is a go-live
  blocker until verified.
- CSP: `BLOCKER`; per-request nonce is the selected approach for the future
  configuration phase.
- Production branch: must be `main`, but automatic production-domain assignment
  should remain disabled until database and smoke gates pass.
- Node: configure 22.x and align with CI's 22.18.0.

## Storage, email, backup, and monitoring status

| Area | Status | Launch boundary |
|---|---|---|
| Real attachments | `INTENTIONALLY DEFERRED` | Becomes `BLOCKER` if required by policy |
| Business email delivery | `INTENTIONALLY DEFERRED` | In-app notifications only |
| Auth SMTP | `BLOCKER` if invite/password is retained | Custom SMTP and sender-domain controls |
| Backup/restore | `BLOCKER` | Verified backup and isolated restore required |
| Application rollback | `REQUIRES CONFIGURATION` | Known-good compatible Vercel deployment retained |
| Database rollback | `BLOCKER` | Restore/forward-fix decision and rehearsal required |
| Monitoring/alerting | `BLOCKER` | Central errors/logs/security/uptime before launch |

## Security controls preserved by repository evidence

| Control | Evidence | Classification |
|---|---|---|
| RLS and FORCE RLS | 107/107 public tables | `READY` locally |
| Tenant policies | 208 policies, all `authenticated` | `READY` locally |
| Invoker views | 9/9 | `READY` |
| SECURITY DEFINER hardening | 115/115 public RPCs; empty search path | `READY` |
| RPC grants | Authenticated execute; zero anon/PUBLIC execute | `READY` |
| Segregation of duties | Database and concurrency suites pass covered cases | `READY` for covered workflows |
| Appraisal privacy | Database suite covers employee/manager/viewer boundaries | `READY` for covered cases |
| Audit append-only | Trigger/database tests pass | `READY` in DB; retention/export still configuration |
| Secrets in tracked files | Pattern scan found no private key/service token; local personas absent from migrations | `READY` with normal secret-scanning still required in CI |
| Data API default-grant change | Current migrations explicitly establish application grants; new-project behavior still requires rehearsal | `REQUIRES CONFIGURATION` |

## Banking and payments boundary

`approved payment request = ready-for-payment`.

Bank transfer, payment API, settlement, cash posting, payment release, and
automatic actual generation remain `INTENTIONALLY DEFERRED`. No production
configuration may imply or enable those capabilities.

## Production initialization checklist

Do not reuse deterministic IDs, names, periods, users, passwords, projects, or
financial transactions from local fixtures.

1. Approve the legal organization and legal-entity list.
2. Create organization-unit types and the authoritative hierarchy.
3. Approve fiscal years, fiscal periods, close dates, and module-close controls.
4. Create control-scope types/scopes and project/control-account hierarchy.
5. Load governed cost categories/subcategories/items and posting flags.
6. Load revenue component types, payer categories/payers, service lines, and GL
   reporting rules under finance ownership.
7. Load approved vendors and procurement policies.
8. Publish versioned approval rules and ensure workflow submissions retain the
   selected version before enabling transactions.
9. Provision Auth identities, profiles, memberships, and least-privilege scoped
   roles; test tenant A/B denial.
10. Configure teams, delegation policy, period-close templates, appraisal cycles,
    templates, and criteria.
11. Create real projects, WBS, milestones, baselines, budgets, and forecasts only
    through approved workflows.
12. Reconcile all opening balances/imports to signed source evidence; no fake
    actuals or unapproved allocations.
13. Obtain finance, HR/privacy, procurement, security, and system-owner signoff.

## Final go-live matrix

| Readiness item | Classification |
|---|---|
| Repository baseline and local build/tests | `READY` with recorded first combined timeout |
| RLS/FORCE RLS/policies/views/RPC ACLs | `READY` locally |
| Empty-database migration chain | `BLOCKER` |
| Existing-database exact suffix/rehearsal | `BLOCKER` |
| Production Auth/IdP/MFA/provisioning | `BLOCKER` |
| Vercel project/domain/environment isolation | `REQUIRES CONFIGURATION` / go-live `BLOCKER` |
| Strict CSP and redirect validation | `BLOCKER` |
| Storage attachments | `INTENTIONALLY DEFERRED` unless required |
| External business email | `INTENTIONALLY DEFERRED` |
| Auth SMTP | `BLOCKER` if password/invite path retained |
| Backup/PITR/restore proof | `BLOCKER` |
| Application/database rollback rehearsal | `BLOCKER` |
| Monitoring/logging/alerting/uptime | `BLOCKER` |
| Production master/reference data | `REQUIRES CONFIGURATION` after migration blocker resolution |
| Approval-rule version retention | `BLOCKER` |
| Bank/payment execution | `INTENTIONALLY DEFERRED` |
| `exceljs -> uuid` dependency risk | `REQUIRES OPERATOR DECISION`; unresolved |

## Known dependency exception

`npm audit --json` independently reconfirmed:

- 2 Moderate
- 0 High
- 0 Critical
- path: `exceljs -> uuid <11.1.1`
- advisory: `GHSA-w5hq-g745-h8pq`

The reported automatic fix changes `exceljs` to 3.4.0 across a major boundary.
No dependency was changed, and the advisory is not represented as resolved. A
named security owner must accept the risk with an expiry date or approve a
separately tested dependency change before production promotion.

## Recommendation

Proceed only to a separately authorized **configuration and remediation phase**.
Do not create a production project, link this repository to production, apply a
remote migration, configure production Auth/Vercel, or deploy until every
`BLOCKER` has closed with evidence and the go/no-go board approves the frozen
release SHA.
