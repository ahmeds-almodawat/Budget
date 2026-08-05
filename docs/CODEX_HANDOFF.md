# Codex Handoff

## Repository

- **Path:** `enterprise-control-platform`
- **Branch:** `feature/enterprise-control-platform`
- **Stack:** Next.js 16, TypeScript, Supabase (migrations only until local stack running), next-intl, Vitest, Playwright

## What works today

1. Bilingual app shell (AR RTL / EN LTR) with full primary navigation
2. Seed-backed dashboards: executive, hospital, restaurant, project EV, employee performance
3. Domain services: financial formulas, permissions, money utilities — **21 unit tests passing**
4. PostgreSQL migrations (6 files) with RLS foundation
5. Production build passing

## Priority takeover tasks

### P0 — Database live

1. `supabase start` + `supabase db reset`
2. Add seed migration (`20260805120600_seed_data.sql`) with Al Modawat sample data
3. Replace `development-seed.ts` dashboard queries with Supabase server queries + RLS tests

### P1 — Core workflows

1. Budget version CRUD + approval workflow UI
2. Actual import (CSV) with batch reconciliation UI
3. Auth login page wired to Supabase Auth
4. Complete RLS policies for all tables in migrations

### P2 — Acceptance scenarios

Implement end-to-end flows for hospital budget, restaurant branch comparison, building project EV, security negative tests, financial integrity, bilingual navigation (partially covered by Playwright).

## Key files

| Area | Path |
|------|------|
| Financial domain | `src/domain/financial/calculations.ts` |
| Permissions | `src/domain/auth/permissions.ts` |
| Branding config | `src/config/product.ts` |
| Migrations | `supabase/migrations/` |
| i18n | `messages/en.json`, `messages/ar.json` |
| Seed ( interim ) | `src/data/seed/development-seed.ts` |

## Commands

```bash
npm run verify    # lint + typecheck + test + build
npm run test:e2e  # requires dev server
```

## Do not

- Deploy to Vercel or connect production Supabase
- Force-push or apply destructive migrations without review
- Commit secrets

See [COMPOSER_COMPLETION_REPORT.md](./COMPOSER_COMPLETION_REPORT.md) for exact test/build results.
