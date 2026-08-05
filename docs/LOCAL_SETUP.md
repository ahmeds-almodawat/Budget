# Local Setup

## Prerequisites

- Node.js 20+
- npm 11+
- Docker Desktop
- Supabase CLI 2.x

## Port isolation (important)

The separate `grc-control-center` project uses default Supabase ports **54321–54329**.

This repository uses **`project_id = enterprise-control-platform`** and isolated ports **56000–56009** to avoid conflicts and Windows excluded port ranges:

| Service | Port |
|---------|------|
| DB shadow | 56000 |
| API | 56001 |
| PostgreSQL | 56002 |
| Studio | 56003 |
| Mailpit | 56004 |
| Analytics | 56007 |
| Pooler (disabled) | 56009 |

Do **not** stop or modify the other Supabase project.

## Steps

```bash
npm install
supabase start
node scripts/sync-local-env.cjs   # writes .env.local (git-ignored)
npm run dev
```

Apply/reset database:

```bash
supabase db reset
node scripts/sync-local-env.cjs     # refresh keys if needed
```

Open:

- App (EN): http://localhost:3000/en
- App (AR): http://localhost:3000/ar
- Studio: http://127.0.0.1:56003

## Local test users

**Local development and CI only.** Do not reuse these credentials or seed migrations in production.

Password for all local seeded users: `Password123!` (defined in seed migrations, not in application runtime code)

| Email | Role |
|-------|------|
| budget.owner@modawat.local | budget_owner |
| approver@modawat.local | approver |
| finance@modawat.local | finance_user |
| auditor@modawat.local | auditor |
| viewer@modawat.local | viewer |
| pm@modawat.local | project_manager |
| employee@modawat.local | employee |

## Authentication seed boundary

Known-password `auth.users` rows are inserted **only** in these migrations:

- `20260805120800_workflow_seed_users.sql`
- `20260805121200_project_schedule_progress.sql`

These migrations are intended for **local Supabase** and **GitHub Actions CI** (deterministic test identities). Production deployment procedures must:

1. Apply schema migrations without re-running local-only seed blocks, **or**
2. Use a production-specific seed process with unique credentials and no shared development password.

Passwords must not appear in runtime UI, server logs, CI stdout, or build artifacts. Test fixtures may reference the shared local password in `src/test/fixtures/users.ts` and `e2e/*.spec.ts` only.

## Verification

```bash
npm run lint
npm run typecheck
npm run test          # 26 unit/integration tests
npm run test:db       # 15 database integrity tests
npm run test:e2e      # 17 Playwright tests
npm run build
supabase status
node scripts/count-rls-policies.cjs   # optional: exact RLS count
```

## Security notes

- `.env.local` contains local keys only — never commit it
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (not `NEXT_PUBLIC_`)
- Browser uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` only
- `scripts/sync-local-env.cjs` writes secrets to `.env.local` only; it does not print keys
