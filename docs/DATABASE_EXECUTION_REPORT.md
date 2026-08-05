# Database Execution Report

**Date:** 2026-08-05  
**Project:** `enterprise-control-platform`  
**Local Supabase:** running on isolated ports (see LOCAL_SETUP.md)

## Migration execution

| Item | Result |
|------|--------|
| Migrations designed | 9 files (`20260805120000` – `20260805120800`) |
| Migrations applied locally | **9/9 success** |
| Clean `supabase db reset` (run 1) | **Success** |
| Clean `supabase db reset` (run 2) | **Success** |
| Clean `supabase db reset` (run 3) | **Success** (after transient 502 retry) |

## Objects actually created locally (verified via PostgreSQL)

| Object type | Designed | Created locally |
|-------------|----------|-----------------|
| Tables (public) | ~48 | **48** |
| Views | 1 (`v_budget_vs_actual`) | **1** (security invoker) |
| Functions | 8+ | **8** (`user_legal_entity_ids`, `user_has_role`, cycle guards, immutability, allocation validation, etc.) |
| Triggers | 15+ | **15** |
| RLS enabled tables | 20+ | **20** |
| RLS policies | 26 designed in migrations 205+207 | **26** applied |

## Seed records (migration 206 + 208)

- Al Modawat organization, legal entity, org units, control scopes, cost nodes
- FY2027 + 12 deterministic fiscal periods
- 9 roles (expanded set)
- 6 local auth users (`*@modawat.local`, password `Password123!`)
- Memberships and role assignments
- Hospital control account for pharmacy injectables

## Policies tested vs designed

| Policy area | Designed | Executed in DB tests |
|-------------|----------|----------------------|
| Cross-entity isolation | Yes | **Yes** (anonymous user sees 0 entities) |
| Member read | Yes | **Yes** (finance user reads assigned entity) |
| Auditor write deny | Partial (app layer) | **Not fully tested at DB layer** |
| Viewer insert deny | Partial | **Not fully tested at DB layer** |
| Actual immutability | Yes | **Yes** (UPDATE policy false + tests) |
| Budget immutability when locked | Yes | **Yes** (trigger test) |

## Database tests executed

Command: `npm run test:db`

| Result | Count |
|--------|-------|
| Passed | **10** |
| Failed | **0** |
| Skipped | **0** |

Tests cover: org cycle, cost leaf posting, locked budget immutability, allocation reconciliation, duplicate transactions, baseline preservation, progress segregation, RLS isolation/membership.

## Application integration test

Command: `npm run test` (Vitest)

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Unit (financial, permissions, money) | 21 | 0 | 0 |
| Integration (hospital budget workflow) | 1 | 0 | 0 |

## Remaining gaps

- RLS write-deny policies not exhaustively tested for every role/table combination
- `supabase test db` pgTAP placeholder not replaced with full pgTAP suite
- Restaurant branch KPI percentages require mapped actual import data (by design)
- Some module routes remain scaffolds (actuals list UI, approvals UI, etc.)
- Auth UI login flow not yet wired (server actions use seeded actor IDs for local workflow demonstration)

## Repeatability

Three consecutive clean resets succeeded after port isolation. Migration order is stable and idempotent within reset lifecycle.
