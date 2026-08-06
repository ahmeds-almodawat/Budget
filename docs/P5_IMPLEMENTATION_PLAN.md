# P5 Implementation Plan

## Phase 1 — Foundation (this PR)
1. Domain documentation and traceability matrices
2. Enums, master-data governance tables and RPCs
3. Delegated approvals state machine and inbox labels
4. Fiscal period module controls and close/reopen commands
5. Purchase requisition lifecycle through budget check
6. RFQ, quotation, PO, receipt, invoice, payment request schemas and core RPCs
7. Approval rule versioning
8. RLS, grants, CI gates, integration/concurrency/E2E tests

## Phase 2 — UI (stacked follow-ups if needed)
- Bilingual workspaces for delegation, master data, requisitions, period calendar
- Procurement dashboards wired to database views

## Commit plan
1. `docs: add P5 domain and control models`
2. `feat(master-data): add governed master record workflows`
3. `feat(delegation): add delegated approval state machine`
4. `feat(period-close): add module close and reopen controls`
5. `feat(procurement): add requisition through payment RPCs`
6. `feat(approvals): add threshold rule versioning`
7. `test: add procurement, delegation, and period-close coverage`
8. `docs: record P5 remediation evidence`

## Non-goals (P5)
- Real banking integration
- Production deployment
- Service-role application workflows
