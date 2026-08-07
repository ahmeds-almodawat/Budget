# ULTRA MEGA Required Modules

**Status:** REQUIRED MODULES IMPLEMENTED LOCALLY — NOT PRODUCTION READY  
**Branch:** `feat/mega-finish-platform`  
**Starting SHA:** `d448c39d3c54b4dcf7da3ffa688234b28993f6b0`  
**Assessment date:** 2026-08-07

This document inventories the ULTRA MEGA tranche that closes the previously open required modules (procurement lifecycle through payment readiness, delegation inbox resolution, master-data hierarchy/deactivate, period-close checklist/senior reopen, and appraisal lifecycle). It does **not** claim production readiness.

## Starting point

Work begins from SHA `d448c39d3c54b4dcf7da3ffa688234b28993f6b0` (`fix: harden route authorization and platform closure controls`). That commit is the route-authorization / platform-closure checkpoint. ULTRA MEGA migrations, routes, actions, fixtures, and docs land on top of it.

## Migration inventory (`20260807120000`–`20260807120600`)

| Migration | Purpose |
|---|---|
| `20260807120000_ultra_procurement_sourcing.sql` | Extends `vendors` (no separate suppliers table); `procurement_policies`; RFQ / quotation / evaluation / award schema and RPCs; requisition line upsert |
| `20260807120100_ultra_procurement_purchasing.sql` | PO lines/contracts/receipts/service entries/supplier invoices/match exceptions/payment requests; commitment creation on PO **issue**; payment stop at `approved` = ready-for-payment |
| `20260807120200_ultra_delegation_period_appraisal.sql` | Effective-approver resolution; `v_approval_inbox` / `v_delegated_approval_inbox`; period-close checklist + gated hard close + senior reopen; appraisal cycle/assignment/ratings; master-data deactivate/reject |
| `20260807120300_ultra_requisition_procurement_review_rpc.sql` | Public `rpc_requisition_procurement_review` wrapper (`budget_checked` → `procurement_review`) |
| `20260807120400_ultra_classification_comments.sql` | `@classification` comments required by authorization catalog tests |
| `20260807120500_ultra_grant_resolve_approver.sql` | Grants `EXECUTE` on `private.resolve_effective_approver` to `authenticated` so security-invoker inbox views resolve |
| `20260807120600_ultra_appraisal_profile_peers.sql` | Narrow `profiles` SELECT policy so appraisal peers can read display identity for assignments in scope |

Additive only. Money remains `NUMERIC(18,4)`. No bank/payment-execution fields.

## Procurement lifecycle (RFQ → payment readiness)

End-to-end path implemented locally (UI + server actions + SECURITY DEFINER RPCs):

1. Requisition draft / line upsert / submit / department / budget check / approve / procurement review  
2. RFQ create-from-requisition → invite → issue → close responses  
3. Supplier quotation create against open RFQs  
4. Evaluation submit → award create/submit → award approve  
5. PO create-from-award → submit → approve → **issue** → cancel  
6. Contract create / approve / activate (optional path)  
7. Goods receipt / service entry create and accept  
8. Supplier invoice create → match / override → approve  
9. Payment request create → submit → approve (**ready-for-payment**)

**Stop before bank.** `payment_request_status.approved` means treasury-ready (`ready_for_payment`). There is no bank API, disbursement execution, or automatic mark-as-paid from approval.

Routes: `/requisitions`, `/rfqs`, `/quotations`, `/evaluations`, `/purchase-orders`, `/contracts`, `/receipts`, `/service-entries`, `/supplier-invoices`, `/payment-requests`.

## Accounting semantics

| Rule | Behavior |
|---|---|
| Commitment posting | Commitment row is created/updated when a PO transitions to **`issued`** (not on approve alone). Cancel updates cancelled amounts against the linked commitment. |
| Actuals from procurement | **No** automatic `actual_transactions` inserts from procurement RPCs. Invoice/receipt/payment readiness do not post GL actuals. Actuals remain the existing import/posting path. |
| Money | `NUMERIC(18,4)`; application money/Decimal layer for report arithmetic |

## Supplier model

There is **no** `suppliers` table. Supplier identity is the existing `vendors` table extended with tax/commercial registration, country, currency, contacts, payment terms, category, legal name, effective dates, and audit columns. Active-vendor checks gate sourcing/purchasing commands.

## SOD matrix (required controls)

| Area | Enforcement (examples) |
|---|---|
| Requisition | Requester cannot approve own requisition (`SOD_VIOLATION`) |
| Award | Requester / award submitter cannot final-approve; evaluator cannot sole final-approve |
| PO / contract / invoice / payment | Creator/requester/recorder cannot self-approve; invoice creator cannot override own match |
| Period reopen | Requester cannot approve own reopen; approve limited to senior roles (`system_administrator`, `legal_entity_administrator`) |
| Appraisal | Employee ≠ manager; employee cannot manage/finalize own appraisal; self-submit only by employee |
| Delegation | Cannot delegate to self; existing self-delegation / segregated-approve tests retained |

Enforced in database RPCs (`private.user_has_any_role` + actor checks), not UI-only.

## Delegation: effective assignee + inbox views

- `private.resolve_effective_approver(original, legal_entity, workflow_type)` walks active, in-window delegations with cycle detection.  
- `public.v_approval_inbox` (security_invoker) exposes `original_assignee_id`, `effective_assignee_id`, and `delegation_id`.  
- `public.v_delegated_approval_inbox` filters to items where the current user is the effective delegate.  
- Approvals UI supports act-as-delegate decisions against the resolved inbox.  
- Inbox base set includes budgets, changes, imports, milestone progress, schedule extensions, variances, delegations, purchase requisitions, and approval rules. PO/payment approval also remains available through dedicated procurement RPCs with SOD.

## Master data: hierarchy + deactivate

- Workspace covers the governed `RECORD_TYPES` set (org units, cost structure, GL, vendor, UoM, currency, VAT, fiscal, project/control-scope/workflow types, variance/risk/approval thresholds).  
- Hierarchical types support parent selection and tree browse; cycle rejection remains database-enforced.  
- Lifecycle: draft → submit → approve / reject; `rpc_master_record_deactivate` for controlled deactivation.  
- Submitter cannot decide (approve/reject) own master-data submission (SOD).

## Period close: checklist + gated hard close + senior reopen

- Checklist templates/items/instances/results with automatic and blocking item evaluation.  
- `rpc_period_hard_close_with_checklist` / `rpc_period_hard_close_gated` refuse hard close while blocking checklist items are incomplete.  
- Reopen requires `rpc_period_reopen_request` then `rpc_period_reopen_approve` by senior admin roles with SOD.  
- Soft/hard close and module open assertions continue to gate posting commands.

## Appraisal architecture + privacy

Architecture:

- Cycles, templates, criteria, assignments, ratings, goals, acknowledgements  
- Status path: self review → self submitted → manager review → manager submitted → (optional reviewer) → finalized → employee acknowledged  
- Weighted score computation in the database; UI for scorecard, my appraisal, team, cycle admin, and assignment detail

Privacy:

- RLS on assignments/ratings/goals/acknowledgements limits read/write to employee, manager, reviewer, or entity/system administrators  
- Commands enforce actor role (employee self-submit; manager submit; finalize SOD)

This is an appraisal lifecycle, not only the earlier team-milestone scorecard (scorecard remains available alongside appraisals).

## Routes added / upgraded

| Route | Capability |
|---|---|
| `/rfqs` | RFQ create, invite, issue, close |
| `/quotations` | Supplier quotation create |
| `/evaluations` | Evaluation submit; award create/approve |
| `/contracts` | Contract create, approve, activate |
| `/receipts` | Goods receipt create/accept |
| `/service-entries` | Service entry create/accept |
| `/supplier-invoices` | Invoice create, match, override, approve |
| `/payment-requests` | Payment request create/submit/approve (ready-for-payment) |
| `/performance/appraisals/[id]` | Appraisal self/manager submit, finalize, acknowledge |
| `/requisitions`, `/purchase-orders`, `/approvals`, `/delegations`, `/master-data`, `/period-close`, `/performance` | Upgraded from partial to functional for the ULTRA MEGA scope |

All localized business routes remain behind the shared server-side permission guard.

## Permissions

- Procurement surfaces continue to use **`commitment` as the permission proxy** for route/nav access (`route-access.ts`).  
- New resources: **`period_close`** and **`appraisal`**, with role grants in `src/domain/auth/permissions.ts` (admins/finance/cost controller for period close; employee/manager/admin/auditor/viewer-appropriate appraisal actions).  
- Mutation authority remains role-checked inside RPCs in addition to route read gates.

## Fixtures

`supabase/fixtures/local_personas.sql` ULTRA MEGA section (still gated by `ALLOW_LOCAL_FIXTURES=true`):

- Cost-controller persona for delegation target  
- Active vendors and procurement policy rows  
- Active finance → cost-controller delegation  
- Appraisal template/criteria/cycle/assignment seed  
- Period-close checklist template/items/instance/results seed  

Lifecycle documents (requisition → RFQ → PO → payment) are created via RPC in tests/E2E, not pre-materialized as full chains in fixtures.

## Reports (15 total)

| ID | Notes |
|---|---|
| `budget_vs_actual` | Existing |
| `budget_actual_commitments` | Existing commitment-aware view |
| `forecast_at_completion` | Existing |
| `monthly_cash_flow` | Existing |
| `milestone_performance` | Existing |
| `restaurant_operational` | Existing; excludes intentional REST-POS orphans |
| `project_cost_phase_category` | Existing |
| `team_milestone_performance` | Existing |
| `variance_explanations` | Existing |
| `unmapped_actuals` | Existing |
| `audit_history` | Existing; audit permission gated |
| `procurement_pipeline` | ULTRA: requisition/RFQ/award/PO stages |
| `invoice_match_exceptions` | ULTRA |
| `period_close_readiness` | ULTRA |
| `appraisal_cycle_completion` | ULTRA |

Exports remain formula-injection protected via `exceljs` helpers.

## Known exceptions (accepted for this tranche)

| Exception | Disposition |
|---|---|
| `exceljs` → transitive `uuid <11.1.1` (moderate npm audit) | Documented; no forced breaking exceljs downgrade |
| No bank / payment execution | Intentional stop at ready-for-payment |
| No production IdP / OAuth administration | Administration remains read-only inventory |
| No production object storage attachments | Deferred |
| No external email delivery | In-app `notifications` helper only |

## Intentional exclusions

From mega-finish scope (unchanged):

- Production SSO / OAuth provider admin  
- Banking API payment execution  
- Remote Supabase / production deploy  
- External email notifications  
- Paid malware scanning service  
- Claiming “production ready” or “platform complete” solely from local green suites  

Still open outside ULTRA MEGA required-module scope:

- Approval-rule retention on workflow submit (approval-rules route remains functional_partial)  
- Production observability, backup/recovery, and operating runbooks  

## Evidence pointers (local)

- Migrations: `supabase/migrations/20260807120*.sql` (through `20260807120600`)
- Fixtures: `supabase/fixtures/local_personas.sql` (15 personas)
- E2E: `e2e/procurement-lifecycle.spec.ts`, `delegation-inbox.spec.ts`, `master-data-hierarchy.spec.ts`, `period-close-checklist.spec.ts`, `appraisal-lifecycle.spec.ts`
- Closure companion: `docs/FINAL_PLATFORM_CLOSURE.md`
- Checklist: `docs/MEGA_FINISH_STATUS.md`

## Local verification snapshot (2026-08-07)

| Suite | Result |
|---|---|
| `npm run lint` | pass (2 pre-existing unused-var warnings) |
| `npm run typecheck` | pass |
| `npm run test` | 159 passed |
| `npm run test:i18n` | EN=811 AR=811 |
| `npm run test:import-security` | 17 passed |
| `npm run test:concurrency` | 8 passed (incl. UM-CONC-01..03) |
| `npm run test:db` cycle 1 | 83 passed |
| `npm run test:db` cycle 2 (independent reset+fixtures) | 83 passed |
| `npm run build` | pass |
| `npm audit` | 2 moderate (`exceljs`→`uuid`); 0 high/critical |
| E2E first full run | 64 passed / 3 failed (sign-out missing between personas) |
| E2E corrections | signOut between users; department-approve persona = cost.controller; appraisal peer profile policy; master-data empty copy + entity select |
| E2E module retest | 5/5 required-module specs passed |
| E2E final full suite | **67 passed**, 0 failed, retries=0 |
| Public RLS policies | 206 |

**Final label:** REQUIRED MODULES COMPLETE FOR LOCAL ULTRA MEGA SCOPE — NOT PRODUCTION READY
