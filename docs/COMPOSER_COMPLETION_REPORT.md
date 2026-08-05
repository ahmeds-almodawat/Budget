# Composer Completion Report (Database Workflows Run)

**Date:** 2026-08-05  
**Branch:** `feature/enterprise-control-platform`  
**Foundation checkpoint:** `7d754c8` / tag `composer-foundation-v1`

---

## 1. Local Supabase conflict isolation

- **Problem:** Default ports 54321–54322 used by `grc-control-center`; Windows excluded range 55268–55367 blocked first alternate range.
- **Solution:** Assigned dedicated ports **56000–56009** in `supabase/config.toml` with `project_id = enterprise-control-platform`.
- **Other project:** Not stopped or modified.

## 2. Selected identity and ports

See [LOCAL_SETUP.md](./LOCAL_SETUP.md). API `56001`, PostgreSQL `56002`, Studio `56003`.

## 3. Migration reset results

- **9 migrations** applied successfully
- **3 clean resets** succeeded (one transient 502 recovered on retry)

## 4. Database objects created

48 tables, 1 view, 8 functions, 15 triggers, 26 RLS policies (verified via `psql`).

## 5. RLS tests executed

10 database tests including cross-entity deny and member allow (see [DATABASE_EXECUTION_REPORT.md](./DATABASE_EXECUTION_REPORT.md)).

## 6. Operational-budget workflow

**Implemented (database-backed):** draft → submit → finance review → approve → lock; budget change request/approve; hospital dashboard MTD/YTD; variance explanation trigger; drill-down to transactions.

**UI:** `/[locale]/budgets`, `/[locale]/dashboard/hospital`, `/[locale]/budgets/transactions/[lineId]`

## 7. Actual-import workflow

**Implemented:** CSV/Excel parse, validation, batch totals, duplicate queue, unmapped queue, transactional post, template download.

**UI:** `/[locale]/imports`

## 8. Project-control workflow

**Implemented:** Khamis Mushait project structure bootstrap, milestones, control account, budget baseline, commitment, EV metrics (PV/EV/AC/CPI/SPI/EAC/VAC), baseline preservation.

**UI:** `/[locale]/projects/[id]`

## 9. Pages changed

Home, executive/hospital/restaurant dashboards, projects list/detail, budgets, imports, performance, budget transaction drill-down — now query Supabase via repository layer (admin server client for workflows).

## 10. Seed-data changes

- SQL seed expanded in migrations 207–208 (users, memberships, fiscal periods, project cost hierarchy)
- `development-seed.ts` retained for unit tests only; **removed from application page data paths**

## 11. Tests added

| Type | Count |
|------|-------|
| Database (`npm run test:db`) | 10 |
| Integration (Vitest) | 1 |
| E2E (Playwright) | 5 |

## 12. Exact test results

```
Vitest:     22 passed, 0 failed, 0 skipped
DB tests:   10 passed, 0 failed
Playwright:  5 passed, 0 failed
Build:      SUCCESS (47 static + dynamic routes)
```

## 13. E2E results

All 5 tests passed (EN/AR navigation, budgets, imports, hospital, executive dashboards).

## 14. Build result

**SUCCESS** — Next.js 16.3.0 production build with `.env.local`.

## 15. Remaining mocked / scaffold modules

| Module | Status |
|--------|--------|
| actuals, approvals, audit, changes, commitments, cost-control, forecasts, master-data, milestones, reports, risks, tasks, administration | **Visual scaffold** (no fake success data) |
| Restaurant KPI percentages | **Partial** — branches from DB; percentages need mapped actuals |
| Auth login UI | **Not wired** — workflows use seeded actor IDs via server actions |
| `kpi-cards.tsx` / `development-seed.ts` | **Test/fixture only** |

## 16. Security risks

- Server actions use admin client with hardcoded local actor IDs (acceptable for local demo; replace with session auth before production)
- RLS write policies incomplete on some tables
- Service role must never be exposed to browser (currently server-only)

## 17. Financial-control risks

- Allocation trigger validates on defer; posting path must always commit/rollback as a unit (implemented in import post)
- Restaurant/hospital food-cost KPIs not fully automated yet
- Full approval matrix UI not implemented

## 18. Codex audit priorities

1. Wire Supabase Auth session to server actions (remove hardcoded actor IDs)
2. Complete RLS policies + negative tests for all roles
3. Restaurant operational KPI pipeline (revenue + food/labor %)
4. Replace remaining scaffold module pages with real workflows
5. pgTAP suite via `supabase test db`

---

*Generated after database-backed workflow implementation.*
