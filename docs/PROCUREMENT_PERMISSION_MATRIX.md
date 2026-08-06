# Procurement Permission Matrix (P5)

| Action | budget_owner | finance_user | procurement_user | approver | auditor | viewer |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Read requisitions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create requisition | ✓ | | ✓ | | ✓ | |
| Submit requisition | ✓ | | ✓ | | | |
| Department approve | | | ✓ | ✓ | | |
| Budget check | | ✓ | | | | |
| Issue RFQ | | | ✓ | | | |
| Evaluate quotation | | ✓ | ✓ | | | |
| Issue PO | | | ✓ | ✓ | | |
| Record receipt | | | ✓ | | | |
| Post invoice | | ✓ | | | | |
| Approve payment | | ✓ | | ✓ | | |
| Period close | | ✓ | | ✓ | ✓ | |
| Master data approve | | ✓ | | ✓ | | |

Enforced via `private.user_has_any_role` in RPC commands and RLS — not UI-only.
