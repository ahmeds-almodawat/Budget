# P5 Remediation Evidence

## Scope delivered

- Governed master data (`governed_master_records`) with draft → submit → approve RPCs
- Delegated approvals (`approval_delegations`) with full state machine and SOD checks
- Fiscal period module controls with soft close, hard close, and reopen
- Purchase requisition lifecycle through budget check and approval gates
- Procurement schema for PO, supplier invoice, and payment request
- Approval rule versioning with single active approved version per workflow
- RLS policies, grants, and inbox extensions for P5 item types

## Public RPC inventory (43 total)

| Domain | RPCs |
|--------|------|
| P4 baseline | 23 |
| Master data | `rpc_master_record_create_draft`, `rpc_master_record_submit`, `rpc_master_record_approve` |
| Delegation | `rpc_delegation_create_draft`, `rpc_delegation_submit`, `rpc_delegation_approve`, `rpc_delegation_activate`, `rpc_delegation_revoke`, `rpc_delegation_cancel` |
| Period close | `rpc_period_soft_close`, `rpc_period_hard_close`, `rpc_period_reopen` |
| Requisition | `rpc_requisition_create_draft`, `rpc_requisition_submit`, `rpc_requisition_department_approve`, `rpc_requisition_budget_check`, `rpc_requisition_approve` |
| Approval rules | `rpc_approval_rule_create_draft`, `rpc_approval_rule_submit`, `rpc_approval_rule_approve` |

## Policy count

114 RLS policies (87 P4 baseline + 27 P5 table policies).

## Tests

- `src/domain/integration/p5-governance.integration.test.ts` — master data, requisition submit, period close guard, self-delegation rejection
- `scripts/run-db-tests.mjs` — updated RPC/policy counts and exposed table matrix

## Stacked PR

Targets `fix/audit-p4-localization-forecast-rpc` at commit `d56032f7c933a3815b950a015e0bd463ae1e8236`.

## Non-goals (deferred)

- Full bilingual procurement UI workspaces
- Banking payment release integration
- Production deployment
