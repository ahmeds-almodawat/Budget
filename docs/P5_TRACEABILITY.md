# P5 Traceability

| Requirement | Migration / RPC | Test |
|-------------|-----------------|------|
| Delegation state machine | `20260806130100_p5_delegations.sql` | `delegation.integration.test.ts` |
| Master-data approval | `20260806130000_p5_enums_and_master_data.sql` | `master-data.integration.test.ts` |
| Period soft/hard close | `20260806130200_p5_period_close.sql` | `period-close.integration.test.ts` |
| Requisition lifecycle | `20260806130300_p5_requisitions.sql` | `procurement-requisition.integration.test.ts` |
| PO commitment | `20260806130400_p5_procurement_po_invoice.sql` | `procurement-po.integration.test.ts` |
| Three-way match | `rpc_supplier_invoice_match` | `procurement-invoice.integration.test.ts` |
| Approval rule version | `20260806130500_p5_approval_rules.sql` | `approval-rules.test.ts` |
| Cross-tenant denial | RLS policies | `server-action-security.integration.test.ts` (extended) |
| Delegated approver E2E | UI + RPC | `e2e/procurement-workflows.spec.ts` |

Audit finding annotations appended to `CODEX_AUDIT_REPORT.md` and `KNOWN_LIMITATIONS.md` — historical evidence preserved.
