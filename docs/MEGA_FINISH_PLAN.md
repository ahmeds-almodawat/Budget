# Mega Finish Plan

**Branch:** `feat/mega-finish-platform`  
**Base SHA:** `e7d3ed52158e7d926136cd452aa02cf1cf04d8b5` (green P5 exact-head CI)

## Objective

Finish the broad functional platform locally before Codex audit. Single branch, single final PR, no intermediate PRs, no CI waits between phases.

## Current baseline (inventory)

| Dimension | Count | Notes |
|-----------|-------|-------|
| Migrations | 40 | P0–P5 through period close, requisition schema |
| Public RPCs | 43 | Budget, forecast, import, progress, P5 governance |
| RLS policies | 114 | Forced RLS on exposed tables |
| Public tables | 64 | Per `run-db-tests.mjs` |
| App routes | 35+ | 3 use `ModulePlaceholderPage` |
| E2E specs | 4 files / 19 tests | Green at base SHA |
| Unit/integration | 85 tests | Vitest |
| DB tests | 23 | `run-db-tests.mjs` |
| i18n keys | 391 EN/AR | Parity enforced |

## Module classification

| Module | Status | Work |
|--------|--------|------|
| Auth + session | Complete | Maintain |
| Hospital budget | Complete | E2E coverage |
| Forecasts | Partial | Cost-control integration |
| Actuals + import | Complete | Maintain |
| Commitments | Partial | PO tab scaffold only |
| Master data | Scaffold | Full workspace + RPC wiring |
| Delegation | Partial (DB) | Full UI + inbox |
| Requisitions | Partial (DB) | Full UI + budget snapshot |
| RFQ / quotations | Missing | Migrations + UI |
| PO / contracts | Schema only | Commands + UI |
| Receipts / invoices | Schema only | Matching + UI |
| Payment requests | Schema only | Internal control UI |
| Period close | Partial (DB) | Calendar + checklist UI |
| Approval rules | Partial (DB) | Engine + simulation |
| Cost control | Scaffold | EVM-style workspace |
| Projects / milestones | Partial | Timeline + evidence |
| Performance | Partial | Scorecard workspace |
| Administration | Scaffold | Users/roles/periods |
| Reports | Partial | Expand catalog |
| Attachments | Missing | Storage integration |
| Notifications | Partial | In-app expansion |
| Localization | Partial | New namespaces |

## Commit sequence

1. `feat(governance): master-data and delegation workspaces`
2. `feat(procurement): requisition, RFQ, and sourcing`
3. `feat(procurement): PO, receipt, invoice, and matching`
4. `feat(governance): period close and approval rules`
5. `feat(financial): cost control and forecast completion`
6. `feat(admin): administration and evidence storage`
7. `feat(reports): dashboards and export catalog`
8. `test: mega finish coverage matrix`
9. `docs: mega finish evidence and Codex handoff`

## Excluded (intentionally deferred)

- Production SSO / OAuth provider admin
- Banking API payment execution
- Remote Supabase / production deploy
- External email notifications
- Paid malware scanning service

## Definition of done gates

- Zero `ModulePlaceholderPage` on primary nav routes
- All workflows call transactional RPCs via server actions
- EN/AR parity for new strings
- Local full verification suite green once at end
