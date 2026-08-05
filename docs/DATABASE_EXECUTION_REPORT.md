# Database Execution Report

**Date:** 2026-08-05  
**Project:** `enterprise-control-platform`  
**Milestone:** `composer-auth-workflows-v1`

## Migration execution

| Item | Result |
|------|--------|
| Migrations designed | 12 files (`20260805120000` – `20260805121100`) |
| Migrations applied locally | **12/12 success** |
| Clean `supabase db reset` (run 1) | **Success** |
| Clean `supabase db reset` (run 2) | **Success** |

## Objects created locally

| Object type | Count |
|-------------|-------|
| Tables (public) | 48 |
| Views | 1 (`v_budget_vs_actual`, security invoker) |
| RLS policies | **49** |
| Functions (SECURITY DEFINER) | 8+ |
| Triggers | 15+ |

## Role scenarios tested (DB + integration)

| Role | Tested |
|------|--------|
| budget_owner | Integration create/submit; E2E draft/submit |
| approver | Integration approve/lock; E2E approve |
| finance_user | Integration review; E2E imports |
| auditor | DB insert deny; E2E read-only UI |
| viewer | DB insert deny; integration write deny |
| no-membership user | DB cross-entity deny |
| cross-entity isolation | DB anonymous + no-membership |

## Test results

| Suite | Passed | Failed | Skipped |
|-------|--------|--------|---------|
| Vitest unit | 21 | 0 | 0 |
| Vitest integration | 2 | 0 | 0 |
| DB tests (`npm run test:db`) | 14 | 0 | 0 |
| Playwright E2E | 15 | 0 | 0 |
| Build | SUCCESS | — | — |

## Remaining gaps

- RLS not exhaustively tested for every table/role combination
- pgTAP placeholder not replaced
- Some module routes remain scaffolds
