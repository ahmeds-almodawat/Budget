# Local Setup

## Prerequisites

- Node.js 22+ (see `.nvmrc`)
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
npx supabase db reset --no-seed
npm run db:wait-local
node scripts/assert-production-migrations-safe.mjs
node scripts/sync-local-env.cjs     # refresh keys if needed
$env:ALLOW_LOCAL_FIXTURES='true'     # PowerShell; use export on POSIX
npm run db:fixtures:local
```

Open:

- App (EN): http://localhost:3000/en
- App (AR): http://localhost:3000/ar
- Studio: http://127.0.0.1:56003

## Local test users

**Local development and CI only.** Do not reuse these credentials or seed migrations in production.

Password for all explicitly loaded local users: `Password123!` (defined only in
the guarded local fixture, never in production migrations)

| Email | Role |
|-------|------|
| budget.owner@modawat.local | budget_owner |
| approver@modawat.local | approver |
| finance@modawat.local | finance_user |
| auditor@modawat.local | auditor |
| viewer@modawat.local | viewer |
| pm@modawat.local | project_manager |
| employee@modawat.local | employee |

## Authentication fixture boundary

`supabase db reset --no-seed` replays the production-safe migration chain and
must leave `auth.users` empty on a fresh database. Local and CI personas are
loaded afterward from `supabase/fixtures/local_personas.sql`. The fixture loader
requires an explicit environment flag and verifies the exact loopback database;
it cannot be pointed at a remote database.

Passwords must not appear in runtime UI, server logs, CI stdout, or build artifacts. Test fixtures may reference the shared local password in `src/test/fixtures/users.ts` and `e2e/*.spec.ts` only.

## Verification

```bash
npm run lint
npm run typecheck
npm run test          # 29 unit/integration tests
npm run test:db       # 22 database/integrity/authorization tests
npm run test:e2e      # 17 Playwright tests
npm run build
supabase status
node scripts/assert-production-migrations-safe.mjs
```

## Security notes

- `.env.local` contains local keys only — never commit it
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (not `NEXT_PUBLIC_`)
- Browser uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` only
- `scripts/sync-local-env.cjs` writes secrets to `.env.local` only; it does not print keys
