# Procurement Domain Model (P5)

## Scope

Governed procurement from requisition through payment, tenant-isolated, decimal-safe, audit-authoritative.

## Core aggregates

| Aggregate | Grain | Notes |
|-----------|-------|-------|
| Purchase requisition | `legal_entity + requisition_number` | Budget snapshot preserved at approval |
| RFQ | `legal_entity + rfq_number` | Sealed evaluation optional |
| Supplier quotation | `rfq + vendor` | Immutable after bid opening |
| Purchase order / contract | `legal_entity + po_number` | Commitment created on issue |
| Goods receipt / service entry | `po_line + receipt_reference` | Quantity tolerance enforced |
| Supplier invoice | `legal_entity + vendor + invoice_number` | Duplicate detection |
| Payment request | `invoice balance` | No banking integration in P5 |
| Credit note | `vendor + reference` | Offsets invoice balance |

## Cross-cutting dimensions

- Legal entity (mandatory tenant key)
- Department, cost center, project/control scope, work package
- Leaf cost item (posting only to governed leaf)
- VAT treatment, currency, fiscal period
- Approval rule version applied at submission

## Financial controls

- Budget availability = approved budget − posted actuals − open commitments
- PO approval creates commitment atomically
- Three-way match: PO + receipt + invoice with configurable tolerances
- Period close blocks posting per module (budget, actuals, procurement, forecasts)

## References

- State machines: `PROCUREMENT_STATE_MACHINES.md`
- Permissions: `PROCUREMENT_PERMISSION_MATRIX.md`
- Tests: `PROCUREMENT_TEST_MATRIX.md`
