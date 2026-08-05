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

Password for all: `Password123!`

| Email | Role |
|-------|------|
| budget.owner@modawat.local | budget_owner |
| approver@modawat.local | approver |
| finance@modawat.local | finance_user |
| auditor@modawat.local | auditor |
| viewer@modawat.local | viewer |
| pm@modawat.local | project_manager |

## Verification

```bash
npm run lint
npm run typecheck
npm run test          # 22 unit/integration tests
npm run test:db       # 10 database integrity tests
npm run test:e2e      # 5 Playwright tests
npm run build
supabase status
```

## Security notes

- `.env.local` contains local keys only — never commit it
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (not `NEXT_PUBLIC_`)
- Browser uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` only
