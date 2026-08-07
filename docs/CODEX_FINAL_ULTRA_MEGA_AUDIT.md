# CODEX Final Ultra-Mega Audit

**Repository:** `ahmeds-almodawat/Budget`

**Branch:** `feat/mega-finish-platform`

**Audited baseline:** `86451705f1176c03614173c2061f98d22bb2393a`

**Audit mode:** local, defensive, no production access, no deployment, no merge

**Report date:** 2026-08-07 (Asia/Riyadh)

## 1. Executive conclusion

The defensive authorization correction materially improves the platform. Direct authenticated writes to 41 workflow-owned tables are removed; unsafe delegated decisions are fail-closed; period close now requires a materialized, completed, audited checklist; period reopen failure is atomic; contract submission exists; appraisal field ownership and finalization are command-controlled; peer identity lookup is names-only; duplicate purchase orders per award are blocked; and cross-entity fiscal-period and master-parent relationships are rejected.

The branch is **not eligible for merge or production promotion** because five required modules still fail their completion criteria and four High procurement/accounting defects remain open. The most serious remaining risks are whole-PO invoice matching, missing document-line relationship validation, commitments never being relieved by approved invoices, and weak sourcing evaluation/award integrity. Delegated approvals are safely disabled rather than completed. Master data remains a shadow catalog, while appraisal and period-close configuration lack controlled mutation workflows.

No correction is represented as complete solely because a test reported green. Every closed finding below has a catalog check or an exact negative/positive database regression. The database suite initially passed before the defects were corrected, which is itself evidence that the former coverage was insufficient.

## 2. Recommendations

### Merge recommendation

**Block merge.** Resolve findings `OPEN-H-101` through `OPEN-H-107` and decide whether `OPEN-M-108` and `OPEN-M-109` are required for the target release. Re-run the complete clean-environment sequence after those corrections.

### Production-promotion recommendation

**Block production promotion.** In addition to the merge blockers, establish deployment rehearsal, backup/restore evidence, monitoring and alerting, secrets rotation, data-retention controls, rate/size limits for imports, and documented rollback procedures.

### Required-module judgment

| Required module | Judgment | Evidence |
|---|---:|---|
| Procurement | **FAIL** | Invoice matching, cross-document integrity, commitment relief, and sourcing award integrity defects remain. |
| Delegated approvals | **FAIL** | The unsafe path is fail-closed and the inbox is intentionally empty; there is no correct original-assignee model. |
| Master data | **FAIL** | UI writes `governed_master_records`, not the authoritative operational tables it claims to govern. |
| Period close | **FAIL** | Runtime checklist gating works, but checklist template/item administration is unavailable through controlled commands/UI. |
| Employee appraisal | **FAIL** | Rating/finalization controls work, but templates, criteria, and goals have no controlled administration workflow/UI. |

## 3. Scope and method

The audit inspected the full branch state, additive migrations, grants, RLS, SECURITY DEFINER functions, server actions, repositories, command paths, workflows, tests, CI-facing scripts, and closure documentation. It used a local Supabase stack only. No remote database, production credential, deployment, merge, tag, or pull request was used.

The evidence sequence included:

1. Baseline verification against local and `origin/feat/mega-finish-platform`.
2. Clean database resets without seed data.
3. Explicit local fixture loading.
4. Exact database authorization, atomicity, workflow, tenant, and accounting regressions.
5. A separate zero-fixture migration replay and catalog inspection.
6. Lint, type checking, unit/integration, import security, concurrency, localization, E2E, and build checks.
7. First-run failures retained in this report; retries are not treated as first-run stability.

## 4. Material findings

### Corrected in the working tree

#### CDF-H-001 — Direct lifecycle-table writes bypassed workflow commands

- **Severity / type:** High — implementation defect — corrected.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:9`.
- **Objects:** 41 procurement, period, delegation, appraisal, and governed-master tables listed in the grant matrix.
- **Failure mode:** `authenticated` held direct INSERT/UPDATE/DELETE privileges. RLS limited row scope but did not enforce state transitions, field ownership, audit semantics, or multi-row atomicity.
- **Scenario:** An authorized tenant member directly changes an approved procurement document or writes an appraisal score without invoking the audited command.
- **Evidence:** Pre-correction grant probes succeeded. Post-correction catalog evidence shows SELECT only on every listed table, with RLS and FORCE RLS enabled.
- **Correction:** Revoke table mutations and require narrow SECURITY DEFINER commands.
- **Regression:** `UM-29` asserts the complete 41-table grant matrix and direct writes fail.
- **Blocks merge / production:** No / No, provided the final migration is retained and the regression remains green.

#### CDF-H-002 — Delegated action could record a decision for a nonexistent item

- **Severity / type:** High — implementation defect — contained; completion tracked by `OPEN-H-105`.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:58`, `:540`; original inbox construction at `supabase/migrations/20260807120200_ultra_delegation_period_appraisal.sql:330`.
- **Objects:** `rpc_approval_act_as_delegate`, `v_delegated_approval_inbox`, `delegated_approval_actions`, `audit_events`.
- **Failure mode:** The command accepted an arbitrary UUID, recorded success/audit, and did not atomically transition an underlying workflow. The inbox treated each requester as the original approver.
- **Scenario:** A delegate manufactures an apparent approval for a nonexistent or unrelated item while the actual document remains unchanged.
- **Evidence:** Reproduced before correction. The replacement command returns `DELEGATED_DECISION_UNAVAILABLE`, writes no decision/audit, and the security-invoker inbox returns no actionable rows.
- **Correction:** Fail closed until each workflow has a real assignee and transactional adapter.
- **Regression:** `UM-31` asserts failure, no decision row, no audit row, and an empty delegated inbox.
- **Blocks merge / production:** No for containment / Yes for claiming the delegation module complete.

#### CDF-H-003 — Hard close did not require instantiated checklist evidence

- **Severity / type:** High — implementation defect — corrected.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:1290`, `:1376`, `:1500`, `:1680`.
- **Objects:** period-close checklist tables and `rpc_period_*close*` functions.
- **Failure mode:** An active checklist template with no close instance/results did not prevent hard close. A client-supplied gate could influence the action.
- **Scenario:** A fiscal period is hard-closed without reconciliations or reviewer evidence.
- **Evidence:** Reproduced before correction. Soft close now materializes the active checklist; readiness rejects missing/mismatched/incomplete evidence; hard close uses server-derived readiness only.
- **Correction:** Server-owned checklist materialization and audited result command.
- **Regression:** `UM-32` rejects a missing checklist; `UM-33` completes audited items and then permits hard close.
- **Blocks merge / production:** No / No for the runtime path; configuration completeness remains `OPEN-M-108`.

#### CDF-H-004 — Appraisal score ownership and privacy were bypassable

- **Severity / type:** High — implementation defect — corrected.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:85`, `:196`, `:315`, `:414`, `:1002`, `:1124`.
- **Objects:** appraisal assignments/ratings, appraisal command functions, `profiles` peer lookup.
- **Failure mode:** Direct writes allowed employees to set manager/calibrated scores, including out-of-range values; assignment finalization could consume those values. A peer-selection policy exposed full profile rows.
- **Scenario:** An employee inflates their own final rating to 999 or reads unrelated employee profile attributes.
- **Evidence:** Both behaviors were reproduced. Commands now enforce actor, exact score field, range, stage completeness, and independent finalization; peer lookup returns identity labels only.
- **Correction:** Command-only mutation, exact JSON field validation, and names-only peer identity RPC.
- **Regression:** `UM-34` denies direct writes and validates exact self fields; `UM-35` proves the reduced peer projection.
- **Blocks merge / production:** No / No for rating integrity; configuration completeness remains `OPEN-H-107`.

#### CDF-H-005 — Cross-entity parents and fiscal periods were accepted

- **Severity / type:** High — implementation defect — corrected.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:652`, trigger installation near `:692`.
- **Objects:** governed master hierarchy; fiscal-period references on requisitions, POs, receipts, service entries, invoices, controls, close instances, and reopen requests.
- **Failure mode:** A row could reference a parent or fiscal period from another legal entity.
- **Scenario:** Tenant/entity financial activity is posted into another entity's period, contaminating close and reporting totals.
- **Evidence:** Exact cross-entity inserts were accepted before correction and rejected after trigger enforcement.
- **Correction:** Same-entity/same-type hierarchy checks and a FORCE-RLS-safe fiscal-period entity trigger.
- **Regression:** `UM-36` covers cross-entity fiscal periods; hierarchy regression covers cross-entity/type parents.
- **Blocks merge / production:** No / No.

#### CDF-H-006 — Multiple live purchase orders could be created from one award

- **Severity / type:** High — implementation defect — corrected.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:706`.
- **Objects:** `purchase_orders`, purchase-order creation command.
- **Failure mode:** Concurrent or repeated submissions could create duplicate live POs for the same sourcing award.
- **Scenario:** The awarded amount is committed twice and procurement/reporting totals are overstated.
- **Evidence:** Duplicate creation was possible before correction. A partial unique index plus locked command check now rejects it.
- **Correction:** Database uniqueness is authoritative; command check provides a stable error.
- **Regression:** `UM-10` asserts duplicate and concurrent-equivalent submissions cannot create a second live PO.
- **Blocks merge / production:** No / No.

#### CDF-H-007 — Contract lifecycle had no submit transition

- **Severity / type:** High — implementation defect and documentation mismatch — corrected.
- **Affected file/line:** `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:828`, `:921`; action/UI wiring in `src/app/actions/procurement-actions.ts` and `src/components/governance/fulfillment-workspace.tsx`.
- **Objects:** procurement contracts and contract lifecycle RPCs.
- **Failure mode:** Draft contracts could not enter the approval lifecycle through an authorized command/UI, although the module was represented as implemented.
- **Scenario:** Users bypass the intended state machine or the module is operationally unusable.
- **Evidence:** No submit command/action existed before correction. Create, submit, approve, reject, activate, close, terminate, and expire now have controlled wrappers.
- **Correction:** Add the missing transition and actor/state/audit checks.
- **Regression:** `UM-30` exercises exact actors, transitions, segregation, and audit events.
- **Blocks merge / production:** No / No.

#### CDF-H-008 — Failed reopen could persist an approved request

- **Severity / type:** High — implementation defect — corrected.
- **Affected file/line:** original `supabase/migrations/20260807120200_ultra_delegation_period_appraisal.sql:732`; replacement `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:1768`.
- **Objects:** `rpc_period_reopen_approve`, `period_reopen_requests`, `fiscal_periods`.
- **Failure mode:** The request was marked approved before the period transition. A returned transition failure could leave an approved request while the period remained hard-closed.
- **Scenario:** Close governance reports an authorized reopen that never occurred, creating contradictory accounting evidence.
- **Evidence:** Code-order inspection and exact failure-path test. Replacement performs the transition first and updates the request only after success in the same transaction.
- **Correction:** Atomic transition-first ordering.
- **Regression:** `UM-37` forces transition failure and asserts both request and period remain unchanged.
- **Blocks merge / production:** No / No.

### Open High findings

#### OPEN-H-101 — Invoice matching compares invoices to whole-PO totals

- **Severity / type:** High — implementation defect.
- **Affected file/line:** `supabase/migrations/20260807120100_ultra_procurement_purchasing.sql:1417-1469`.
- **Objects:** invoice matching RPC/results/exceptions.
- **Failure mode:** Matching aggregates the whole PO and all accepted evidence for the PO, then compares that to the current invoice. If receipt/service evidence is absent it falls back to two-way matching, making missing-evidence exception branches unreachable.
- **Scenario:** A valid partial invoice is rejected against the full PO, while an invoice that should require three-way evidence is treated as two-way and may pass.
- **Evidence:** Joins at `:1425` aggregate by PO; match-mode selection depends on positive receipt/service totals; missing-evidence branches at `:1463-1469` cannot be selected in those zero-evidence cases.
- **Recommended correction:** Match per invoice line against the referenced PO line and the procurement policy's required evidence; account for cumulative prior invoices, tolerances, reversals, and partial receipts/services.
- **Required regression:** Partial/multiple invoices, mixed goods/services, no-receipt required-three-way, overbilling, cumulative quantity/value, reversal and concurrency cases.
- **Blocks merge / production:** Yes / Yes.

#### OPEN-H-102 — Procurement document relationships are not validated end to end

- **Severity / type:** High — implementation defect.
- **Affected file/line:** `supabase/migrations/20260807120100_ultra_procurement_purchasing.sql:963-977`, `:1049-1068`, `:1115-1183`, `:1239-1252`, `:1280-1352`.
- **Objects:** goods receipts/lines, service entries/lines, supplier invoices/lines, POs/contracts/vendors/entities.
- **Failure mode:** Caller-supplied line IDs and header entity/vendor/PO/contract values are not consistently proven to belong to one another. Contract-only ceilings are not enforced on service acceptance.
- **Scenario:** A user links a receipt or invoice header for one PO/entity/vendor to lines from another, causing false receipt, service, payable, and project-cost evidence.
- **Evidence:** Create functions cast caller JSON line IDs directly; acceptance looks up lines by ID without proving header ownership; invoice creation lacks complete PO/entity/vendor/line relationship checks.
- **Recommended correction:** Resolve all header identity from authoritative parents, validate every child line under locked parents, reject mixed documents, and enforce PO/contract ceilings cumulatively.
- **Required regression:** Cross-PO, cross-vendor, cross-entity, cross-contract, cancelled/closed parent, duplicate line, ceiling, and concurrent acceptance tests.
- **Blocks merge / production:** Yes / Yes.

#### OPEN-H-103 — Approved invoices never relieve commitments

- **Severity / type:** High — implementation defect / accounting misstatement.
- **Affected file/line:** commitment creation/cancellation at `supabase/migrations/20260807120100_ultra_procurement_purchasing.sql:637-658`; schema at `supabase/migrations/20260805120400_actuals_commitments_forecasts.sql:90`; reporting at `supabase/migrations/20260806090000_p3_reporting_forecast_indexes.sql:98` and `supabase/migrations/20260806130900_p6_revenue_reporting_views.sql:16`.
- **Objects:** commitments, approved supplier invoices, commitment reporting views.
- **Failure mode:** Reports calculate open commitment using `invoiced_applied`, but no repository code writes that field when invoices are approved/reversed.
- **Scenario:** Approved invoices become actual/payable exposure while the full PO commitment remains open, overstating total exposure and remaining commitment.
- **Evidence:** Repository-wide search finds only the column definition and reads/cancellation use; no invoice lifecycle write exists.
- **Recommended correction:** Atomically allocate approved invoice value to commitment lines, maintain cumulative decimal-safe relief, and reverse/reapply it on reversal/replacement.
- **Required regression:** Partial/multiple invoices, taxes, line allocations, over-invoice rejection, reversals, cancellation, and concurrent approval reconciliation to the cent/base precision.
- **Blocks merge / production:** Yes / Yes.

#### OPEN-H-104 — Sourcing evaluation and award integrity is insufficient

- **Severity / type:** High — implementation defect.
- **Affected file/line:** `supabase/migrations/20260807120000_ultra_procurement_sourcing.sql:1143-1209`, `:1333-1445`.
- **Objects:** RFQs, evaluation criteria/scores/evaluations, quotations, sourcing awards/lines.
- **Failure mode:** Evaluations can be changed on awarded RFQs; criterion replacement deletes mutable criteria before existing score dependencies; an existing submitted evaluation can be reset to draft; award creation accepts evaluation/quotation/price relationships without proving same RFQ, submitted status, mandatory compliance, or authoritative quoted price.
- **Scenario:** After evaluation or award, criteria/scores are changed and an award is created from an unrelated or noncompliant quote at a caller-supplied price.
- **Evidence:** Allowed RFQ states include `awarded` at `:1145` and `:1375`; criteria are deleted at `:1169`; evaluation upsert resets workflow near `:1194`; award line values are caller-derived near `:1418-1445`.
- **Recommended correction:** Freeze submitted evaluations/criteria, version any replacement, bind award lines to submitted compliant evaluation and quotation lines, derive prices server-side, and lock cumulative awarded quantity.
- **Required regression:** Post-submit mutation denial, mandatory-failure denial, cross-RFQ evaluation/quote rejection, price tamper rejection, duplicate/concurrent award quantity, and immutable audit history.
- **Blocks merge / production:** Yes / Yes.

#### OPEN-H-105 — Delegated approval module is safely disabled, not complete

- **Severity / type:** High — intentionally deferred feature after security containment.
- **Affected file/line:** original inbox `supabase/migrations/20260807120200_ultra_delegation_period_appraisal.sql:321-418`; containment `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:58`, `:540`.
- **Objects:** delegated inbox/action RPC and underlying approval workflows.
- **Failure mode:** No authoritative pending-assignee model exists. The current safe implementation exposes no actionable inbox rows and rejects every delegated decision.
- **Scenario:** Delegated approval is either dangerous if re-enabled as before or unavailable to users if left contained.
- **Evidence:** Original view copied requester into `original_assignee_id`; current view is intentionally empty and command fail-closed.
- **Recommended correction:** Introduce authoritative approval assignments per workflow and a single transaction that verifies active delegation, locks the item, invokes the real workflow transition, and records one linked audit event.
- **Required regression:** Each workflow; delegator/delegate/entity/date/scope; self-approval; stale/double decision; nonexistent item; downstream failure rollback; audit actor and acting-as attribution.
- **Blocks merge / production:** Yes if delegation is required / Yes if advertised or enabled.

#### OPEN-H-106 — Master data is a shadow catalog

- **Severity / type:** High — implementation defect and documentation mismatch.
- **Affected file/line:** `src/components/governance/master-data-workspace.tsx:18-41`; `src/app/actions/governance-actions.ts:139-230`.
- **Objects:** `governed_master_records` versus authoritative org units, cost nodes, vendors, fiscal periods, and related master tables.
- **Failure mode:** The workspace advertises operational master categories but reads/writes only generic governed records. Changes do not govern the records used by operational transactions.
- **Scenario:** A vendor appears approved/disabled in the governance workspace while procurement still uses a different authoritative vendor row.
- **Evidence:** Every master-data action in the cited range targets `governed_master_records`.
- **Recommended correction:** Either bind governance workflows to authoritative tables with staged activation or narrow the UI/documentation to the actual generic catalog.
- **Required regression:** For each advertised type, prove approve/activate/deactivate affects the exact operational lookup and rejects cross-entity or unauthorized changes.
- **Blocks merge / production:** Yes / Yes if the master-data module is in release scope.

#### OPEN-H-107 — Appraisal configuration workflow is incomplete

- **Severity / type:** High — intentionally deferred feature / documentation mismatch.
- **Affected file/line:** table mutation revocation at `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:9`; current appraisal commands at `:1048-1274`; UI in `src/components/performance/performance-workspace.tsx`.
- **Objects:** appraisal templates, criteria, goals, cycles, assignments.
- **Failure mode:** Templates, criteria, and goals are protected from direct writes but have no controlled create/update/publish/retire commands and complete UI.
- **Scenario:** Administrators cannot configure the evaluation model without fixtures/manual privileged SQL, while the module may be represented as complete.
- **Evidence:** Controlled commands cover cycles, assignments, ratings, finalization, acknowledgement, and identity selection, not template/criterion/goal administration.
- **Recommended correction:** Add versioned template/criteria/goals commands, immutable published versions, weight/scale validation, actor separation, audit events, and UI.
- **Required regression:** Draft/edit/publish/retire, weight totals, post-publication immutability, cross-entity denial, assignment binding, and audit history.
- **Blocks merge / production:** Yes / Yes if appraisal is a required module.

### Medium and Low findings

#### OPEN-M-108 — Period checklist configuration is incomplete

- **Severity / type:** Medium — intentionally deferred feature / documentation mismatch.
- **Affected file/line:** mutation revocation at `supabase/migrations/20260807120700_enforce_workflow_authorization_and_integrity.sql:9`; runtime commands at `:1290-1751`; UI `src/components/governance/period-close-workspace.tsx`.
- **Objects:** checklist templates/items and close runtime.
- **Failure mode:** Runtime checklist execution is controlled, but administrators cannot create/version/activate templates and items through controlled commands/UI.
- **Scenario:** A new entity or changed close procedure requires manual privileged SQL, bypassing normal governance evidence.
- **Evidence:** No template/item configuration RPC/action/UI exists after direct mutations were revoked.
- **Recommended correction:** Versioned checklist configuration, activation windows, immutable used versions, audit, and role-separated UI.
- **Required regression:** Version lifecycle, activation uniqueness, used-version immutability, cross-entity denial, and close instance binding.
- **Blocks merge / production:** Yes under the stated required-module definition / Yes if administrators must operate it without SQL.

#### OPEN-M-109 — Payment lifecycle stops at ready-for-payment

- **Severity / type:** Medium — intentionally deferred feature / documentation mismatch.
- **Affected file/line:** `src/components/governance/fulfillment-workspace.tsx:678-805` and corresponding payment RPCs/actions.
- **Objects:** payment requests.
- **Failure mode:** Only create, submit, and approve are implemented; rejected, cancelled, and released states have no command/action/UI.
- **Scenario:** An erroneous request cannot be rejected/cancelled through the governed workflow, and release status cannot be recorded if the module claims the full lifecycle.
- **Evidence:** UI exposes only create/submit/approve and displays `readyForPayment`.
- **Recommended correction:** Define release boundary explicitly; implement reject/cancel, and implement release only if payment execution is in scope.
- **Required regression:** Actor/state/SOD, duplicate decision, cancellation after submission, release idempotency, and audit tests.
- **Blocks merge / production:** No if explicitly scoped to ready-for-payment / Yes if full payment lifecycle is advertised.

#### OPEN-M-110 — Integration tests depend on an external database reset

- **Severity / type:** Medium — test deficiency / environmental instability.
- **Affected file/line:** `vitest.config.ts:11-12` and database-backed integration suites.
- **Objects:** Vitest integration state and local Supabase fixture database.
- **Failure mode:** Suites use fixed records and persist transitions. A second run against the same database can fail even though a clean reset run passes.
- **Scenario:** CI order or developer reruns produce false negatives/positives; tests are not independently repeatable.
- **Evidence:** A clean serialized run passed 25 files/159 tests; rerunning against mutated fixtures failed period assertions until reset.
- **Recommended correction:** Per-suite transaction rollback or unique fixtures with deterministic cleanup; make reset/setup part of the test command itself.
- **Required regression:** Run the same suite twice against one started stack without reset and obtain identical results.
- **Blocks merge / production:** No / No, but blocks a claim of robust test isolation.

#### OPEN-M-111 — Windows E2E server spawning is unstable

- **Severity / type:** Medium — environmental instability.
- **Affected file/line:** `playwright.config.ts:10-21` and the Windows local web-server execution environment.
- **Objects:** local Next.js test server.
- **Failure mode:** An identical clean no-retry run hit Next.js `spawn UNKNOWN`, then four scenarios timed out on sign-in or route navigation and the server emitted `ECONNRESET`/aborted errors. A subsequent clean full run passed.
- **Scenario:** CI fails nondeterministically before or during route generation, obscuring functional regressions and preventing reliable release evidence.
- **Evidence:** First final run: 4 failure artifact directories/traces (`appraisal-lifecycle`, two `bilingual-navigation` cases, and `budget-vs-actual-revenue`) after the server spawn failure. Separate clean retry: 67/67 passed in 529.1 seconds with Playwright retries still zero; teardown still emitted `ECONNRESET`.
- **Recommended correction:** Isolate the Next worker-spawn cause on Windows, cap worker/process creation where supported, use graceful server shutdown, and make the CI execution environment deterministic. Do not suppress errors until their teardown-only origin is proven.
- **Required regression:** At least two consecutive full Windows E2E runs from separate clean database resets with no worker-spawn, navigation, or unexpected server errors.
- **Blocks merge / production:** No by itself / No by itself, but blocks a first-run-stability claim.

#### KNOWN-MOD-112 — Two Moderate npm advisories remain

- **Severity / type:** Medium — documented dependency exception.
- **Affected file/line / package:** `package-lock.json:7148`, `:11707`; `exceljs -> uuid` (`GHSA-w5hq-g745-h8pq`).
- **Failure mode:** `npm audit` reports two Moderate advisories. The proposed automatic path downgrades `exceljs` across a major boundary.
- **Scenario:** Risk depends on whether attacker-controlled values reach the vulnerable UUID behavior; no evidence was found that resolves the advisory.
- **Evidence:** Audit result: 2 Moderate, 0 High, 0 Critical.
- **Recommended correction:** Track upstream remediation and test a deliberate dependency upgrade/downgrade separately; do not claim resolution.
- **Required regression:** Export/import compatibility and malicious workbook tests under the chosen dependency version.
- **Blocks merge / production:** No / Policy decision for production promotion.

## 5. Authenticated grant and RLS matrix

Catalog interpretation: RLS constrains which rows are visible, but it does not replace command-level authorization. Every workflow-owned table below now permits authenticated SELECT only. `I/U/D = No` is the required invariant.

| Table | RLS | FORCE | Policies | SELECT | INSERT | UPDATE | DELETE |
|---|:---:|:---:|---:|:---:|:---:|:---:|:---:|
| appraisal_acknowledgements | Yes | Yes | 2 | Yes | No | No | No |
| appraisal_assignments | Yes | Yes | 2 | Yes | No | No | No |
| appraisal_cycles | Yes | Yes | 2 | Yes | No | No | No |
| appraisal_goals | Yes | Yes | 2 | Yes | No | No | No |
| appraisal_ratings | Yes | Yes | 2 | Yes | No | No | No |
| appraisal_template_criteria | Yes | Yes | 2 | Yes | No | No | No |
| appraisal_templates | Yes | Yes | 2 | Yes | No | No | No |
| approval_delegations | Yes | Yes | 3 | Yes | No | No | No |
| evaluation_criteria | Yes | Yes | 3 | Yes | No | No | No |
| fiscal_period_module_controls | Yes | Yes | 3 | Yes | No | No | No |
| goods_receipt_lines | Yes | Yes | 2 | Yes | No | No | No |
| goods_receipts | Yes | Yes | 3 | Yes | No | No | No |
| governed_master_records | Yes | Yes | 3 | Yes | No | No | No |
| invoice_match_exceptions | Yes | Yes | 1 | Yes | No | No | No |
| invoice_match_results | Yes | Yes | 1 | Yes | No | No | No |
| payment_requests | Yes | Yes | 3 | Yes | No | No | No |
| period_close_checklist_items | Yes | Yes | 2 | Yes | No | No | No |
| period_close_checklist_templates | Yes | Yes | 2 | Yes | No | No | No |
| period_close_instances | Yes | Yes | 2 | Yes | No | No | No |
| period_close_item_results | Yes | Yes | 2 | Yes | No | No | No |
| period_reopen_requests | Yes | Yes | 3 | Yes | No | No | No |
| procurement_contract_lines | Yes | Yes | 2 | Yes | No | No | No |
| procurement_contracts | Yes | Yes | 3 | Yes | No | No | No |
| procurement_policies | Yes | Yes | 4 | Yes | No | No | No |
| purchase_order_lines | Yes | Yes | 3 | Yes | No | No | No |
| purchase_orders | Yes | Yes | 3 | Yes | No | No | No |
| purchase_requisition_lines | Yes | Yes | 3 | Yes | No | No | No |
| purchase_requisitions | Yes | Yes | 3 | Yes | No | No | No |
| rfq_lines | Yes | Yes | 3 | Yes | No | No | No |
| rfq_suppliers | Yes | Yes | 3 | Yes | No | No | No |
| rfqs | Yes | Yes | 3 | Yes | No | No | No |
| service_entries | Yes | Yes | 3 | Yes | No | No | No |
| service_entry_lines | Yes | Yes | 2 | Yes | No | No | No |
| sourcing_award_lines | Yes | Yes | 3 | Yes | No | No | No |
| sourcing_awards | Yes | Yes | 3 | Yes | No | No | No |
| sourcing_evaluation_scores | Yes | Yes | 3 | Yes | No | No | No |
| sourcing_evaluations | Yes | Yes | 3 | Yes | No | No | No |
| supplier_invoice_lines | Yes | Yes | 2 | Yes | No | No | No |
| supplier_invoices | Yes | Yes | 3 | Yes | No | No | No |
| supplier_quotation_lines | Yes | Yes | 3 | Yes | No | No | No |
| supplier_quotations | Yes | Yes | 3 | Yes | No | No | No |

Observed zero-fixture catalog totals after the final migration replay: 104/104 public tables with RLS, 104/104 with FORCE RLS, 205 policies, 9/9 public views using `security_invoker`, and 96/96 public RPCs meeting the definer/path/ACL invariant. All 41 lifecycle-table grant checks passed with no mutation privilege.

## 6. RPC security matrix

The reviewed correction RPCs use SECURITY DEFINER with an empty `search_path`, perform explicit authentication/authorization, revoke execution from `PUBLIC` and `anon`, and grant execution only to `authenticated`. A SECURITY DEFINER label is not accepted as authorization evidence by itself; each exact behavior is covered by command tests.

| Command group | RPCs reviewed | Definer / empty path | Public/anon execute | Authenticated execute | Result |
|---|---|:---:|:---:|:---:|---|
| Delegation | `rpc_approval_act_as_delegate` | Yes | No | Yes | Safe fail-closed; module incomplete |
| Contracts | `rpc_contract_create`, `submit`, `approve`, `reject`, `activate`, `close`, `terminate`, `expire` | Yes | No | Yes | Controlled lifecycle |
| Appraisal | `rpc_appraisal_cycle_create`, `assignment_create`, `self_submit`, `manager_submit`, `reviewer_submit`, `finalize`, `acknowledge`, `peer_identities` | Yes | No | Yes | Rating lifecycle controlled; configuration incomplete |
| Period close | `rpc_period_soft_close`, `checklist_set_result`, `close_evaluate_readiness`, `hard_close_with_checklist`, `hard_close_gated`, `hard_close`, `reopen`, `reopen_request`, `reopen_approve` | Yes | No | Yes | Runtime controlled; configuration incomplete |

Views were separately checked because view-owner execution can bypass table RLS. All 9 public views use `security_invoker`; the delegated inbox is both security-invoker and intentionally non-actionable.

## 7. Workflow and segregation matrix

| Workflow | Initiator | Decision actor | Self-decision prevention | State/lock check | Audit actor | Result |
|---|---|---|---|---|---|---|
| Contract | Authorized procurement user | Authorized approver/administrator by transition | Exact actor/state assertions in `UM-30` | Command expected-state checks | `auth.uid()` profile | Pass |
| Appraisal self | Employee | Same employee, self fields only | Cannot set manager/reviewer/calibrated fields | Stage and exact payload fields | Authenticated employee | Pass |
| Appraisal manager/reviewer | Assigned manager/reviewer | Exact assigned actor | Actor ownership enforced | Stage/completeness checks | Authenticated assigned actor | Pass |
| Appraisal finalization | Authorized independent actor | Finalizer | Cannot finalize incomplete ratings | Locked command and completeness | Authenticated finalizer | Pass |
| Period hard close | Authorized close actor | Server-evaluated gate | Client cannot self-assert readiness | Checklist/module/state validation | Authenticated close actor | Pass |
| Period reopen | Requester | Separate authorized approver | Existing SOD checks plus atomic transition | Transition before request approval | Authenticated approver | Pass |
| Delegated approval | Delegate | None currently | Unsafe path disabled | Always fails closed | No false audit written | Safe containment / module fail |
| Sourcing evaluation/award | Evaluator/requester | Award approver | Approval SOD exists | Pre-approval creation integrity incomplete | Authenticated actor | Fail (`OPEN-H-104`) |

## 8. Financial-control matrix

| Control | Current evidence | Judgment |
|---|---|---|
| Decimal storage | Financial columns use fixed-precision numeric types in reviewed procurement paths | Pass with scenario coverage still required |
| Duplicate PO from award | Partial unique index plus command lock/check; `UM-10` | Pass |
| Receipt/service/invoice parent integrity | Caller relationships not fully bound to authoritative parents | Fail (`OPEN-H-102`) |
| Invoice matching | Whole-PO aggregate and false two-way fallback | Fail (`OPEN-H-101`) |
| Commitment creation | PO issue creates commitment rows | Pass for creation |
| Commitment relief | `invoiced_applied` is never maintained | Fail (`OPEN-H-103`) |
| Commitment reversal/replacement | No proven atomic relief/reapply path | Fail (`OPEN-H-103`) |
| Sourcing evaluation immutability | Awarded RFQs/evaluations remain mutable/resettable | Fail (`OPEN-H-104`) |
| Award-to-quote integrity | Evaluation, quotation line, RFQ, compliance, and price not fully bound | Fail (`OPEN-H-104`) |
| Fiscal-period entity isolation | Same-entity trigger plus exact negative regression | Pass |
| Period close checklist | Materialized, completed, audited evidence required | Pass for execution |
| Period reopen atomicity | Failed transition leaves request and period unchanged | Pass |
| Appraisal score integrity | Actor/field/range/stage/finalizer controls | Pass |

## 9. Migration-safety assessment

- The correction is an additive migration after `20260807120600`; historical migrations were not rewritten.
- It revokes direct mutations before relying on controlled RPCs. This is security-positive but operationally breaking for any undiscovered client that still writes tables directly; all callers must be searched and exercised before release.
- Function replacements use fully qualified objects and an empty `search_path`; helper trigger functions used under FORCE RLS are SECURITY DEFINER.
- Unique-index creation can fail on existing duplicate live POs. A pre-deployment query and deterministic remediation plan are required.
- New fiscal-period relationship triggers can reject existing inconsistent rows or future writes. Preflight data validation is required.
- Function/view replacement and grant changes should be rehearsed against a production-like sanitized database with lock-duration measurement and rollback evidence.
- No non-local migration was applied during this audit.

## 10. Test-evidence assessment

### Database tests

The pre-correction suite passed **83/83** even though direct lifecycle writes, false delegated decisions, missing-checklist hard close, and appraisal score tampering were reproducible. That result is evidence of a former test deficiency, not implementation quality.

Correction development retained these failures:

- First corrected database run: **85 passed / 5 failed** because the new tests exposed harness assumptions (JWT context, parameter typing, actor selection, and audit schema).
- After harness correction: **90/90 passed**.
- After fiscal-period and reopen atomicity additions: **91 passed / 1 failed** because the new trigger helper was not initially SECURITY DEFINER under FORCE RLS.
- After the helper correction: **92/92 passed** on a clean reset and explicit fixture load.
- A second independent replay of the final migration revision also passed **92/92** after another reset and guarded fixture load.

The final zero-fixture migration replay passed on its first invocation. The first custom read-only catalog probe then failed because the audit helper did not forward SQL parameters; the helper invocation was corrected and rerun against the same already-reset database. This was an audit-probe defect, not a migration retry. The corrected probe produced the catalog totals recorded in sections 5 and 6.

Exact new regressions are `UM-29` through `UM-37`, plus `UM-10` for duplicate-PO protection. They test grants, contract actors/audits, delegated failure/no side effects, missing/completed checklist behavior, appraisal field ownership/privacy, cross-entity periods, and reopen failure rollback.

### Application and security tests

| Check | Evidence | Assessment |
|---|---|---|
| `npm ci` | Passed; 699 packages | Reproducible install; advisories remain documented |
| Lint | Passed, 0 errors; 2 pre-existing warnings | Pass |
| Type check | Initial pre-existing E2E label type failure corrected; final pass | Pass, first-run instability retained |
| Unit/integration | Clean serialized run: 25 files / 159 tests | Pass only on reset fixtures; see `OPEN-M-110` |
| Import security | 17/17 | Pass for covered vectors |
| Concurrency | 8/8 | Pass for covered commands |
| Localization | EN 830 / AR 830, parity; one intentional inline locale branch | Pass |
| E2E | First clean run failed 4 scenarios after `spawn UNKNOWN`; separate clean retry passed 67/67 with internal retries zero | Functional scenarios pass on retry; first-run stability fails (`OPEN-M-111`) |
| Build | First attempt passed; 87 static pages; Next 16.3/Turbopack | Pass |
| npm audit | 2 Moderate; 0 High; 0 Critical | Documented exception, unresolved |

### First-run stability

The first clean unit attempt executed all assertions but exited with Windows Vitest fork `spawn UNKNOWN`. Moving the pool to worker threads addressed the OS process issue. A subsequent run against already-mutated fixtures failed two period tests, demonstrating test-state coupling; serial execution and a clean reset produced the passing result. During final verification, the first clean E2E run also hit `spawn UNKNOWN` in the Next server and failed four scenarios; an identical clean retry passed 67/67. These retries are not represented as equivalent to first-run stability.

## 11. CI stability assessment

The single workflow at `.github/workflows/ci.yml` pins its GitHub actions, uses Node 22.18.0 and Supabase CLI 2.111.0, replays migrations without fixtures, runs the migration-safety scan, loads guarded fixtures, runs the required checks, uploads evidence, and always stops Supabase. Pull requests targeting `main` are covered.

Material limitations:

- The current `feat/mega-finish-platform` branch is absent from the workflow's push-branch list. A push alone does not run CI; a pull request to `main` or manual dispatch is required.
- The audited local environment used Node 24.12.0 and Supabase CLI 2.112.0, so the exact CI toolchain was not reproduced locally.
- CI loads fixtures once, then runs unit/integration, database, concurrency, and E2E suites without resetting between those mutation-capable stages. This compounds `OPEN-M-110`; the successful final E2E evidence required an explicit clean reset.
- The identical clean Windows E2E outcomes diverged (four failures, then 67/67), confirming `OPEN-M-111`.
- `npm audit` is not a workflow step. The two Moderate advisories remain a documented exception rather than a CI-enforced policy.
- No remote CI result exists for the uncommitted correction set. A green workflow on a reviewed commit is required before merge.

CI judgment: configuration has good baseline safeguards and evidence upload, but current results do not establish stable cross-platform execution or state-isolated tests.

## 12. Documentation corrections

`docs/ULTRA_MEGA_REQUIRED_MODULES.md` and `docs/FINAL_PLATFORM_CLOSURE.md` were corrected so they no longer claim final closure. They now identify the security correction migration, the intentionally disabled delegated inbox/action, the corrected contract lifecycle, and the remaining required-module blockers. This report is the controlling independent audit artifact for the current checkpoint.

## 13. Remaining scaffold and partial-module inventory

| Area | Implemented | Missing / partial |
|---|---|---|
| Procurement sourcing | RFQ, quotations, evaluations, awards, approval skeleton | Immutable evaluation versions, authoritative award binding, price/compliance integrity |
| Procurement purchasing | Requisitions, PO issue, receipts, service entries, invoices, matching, payment-request skeleton | Cross-document binding, correct line/cumulative matching, commitment relief/reversal |
| Delegation | Delegation records and safe containment | Real assignee model and transactional workflow adapters |
| Master data | Generic governed record workflow | Authoritative operational master integration |
| Period close | Checklist execution, readiness gate, hard close/reopen | Template/item administration and version lifecycle |
| Appraisal | Cycle/assignment/rating/finalize/acknowledge execution | Template/criteria/goal administration and publication lifecycle |
| Payments | Create/submit/approve to ready-for-payment | Reject/cancel; release if in scope |
| Operations | Broad screens and workflows exist | Production controls, runbooks, monitoring, restore rehearsal, and support ownership |

## 14. Prioritized remediation plan

### Priority 0 — accounting and document integrity

1. Replace whole-PO invoice matching with locked line/cumulative matching and policy-driven evidence requirements (`OPEN-H-101`).
2. Enforce authoritative header/line/entity/vendor/PO/contract relationships and ceilings (`OPEN-H-102`).
3. Implement atomic commitment relief, reversal, and reconciliation (`OPEN-H-103`).
4. Freeze/version sourcing evaluations and bind awards to submitted compliant quotations at server-derived prices (`OPEN-H-104`).

### Priority 1 — required-module completion

1. Build an authoritative approval-assignment model and transactional delegated adapters (`OPEN-H-105`).
2. Connect master governance to authoritative operational tables or reduce the advertised scope (`OPEN-H-106`).
3. Add controlled, audited appraisal template/criteria/goal administration (`OPEN-H-107`).
4. Add controlled, versioned period checklist configuration (`OPEN-M-108`).
5. Decide and document the payment lifecycle boundary; implement missing transitions in scope (`OPEN-M-109`).

### Priority 2 — repeatability and operational controls

1. Make database-backed tests repeatable without an external reset (`OPEN-M-110`).
2. Stabilize Windows worker spawning and E2E server shutdown (`OPEN-M-111`).
3. Resolve or formally time-bound the dependency exception (`KNOWN-MOD-112`).
4. Rehearse the additive migration on sanitized production-scale data, including duplicate/inconsistent-row preflight and lock timing.
5. Establish backup/restore, rollback, monitoring, alerting, retention, secrets, incident response, and import size/rate controls.

## 15. Final audit disposition

The working tree contains valuable defensive corrections and exact regressions, but required-module and accounting blockers remain. The correct disposition is a checkpoint: retain the changes for review, do not commit/push them under the requested completion commit, and continue remediation only after findings are reviewed and separately authorized.
