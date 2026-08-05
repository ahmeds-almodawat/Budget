# Enterprise Project, Budget and Performance Control

Production-oriented bilingual (Arabic/English) enterprise platform for project management, operational and capital budgeting, cost control, commitments, forecasts, earned value, and performance measurement.

## Stack

- Next.js 16 (App Router), TypeScript (strict)
- PostgreSQL via Supabase (Auth, Storage, RLS)
- Tailwind CSS, accessible UI primitives
- next-intl (AR/EN, RTL/LTR)
- Vitest, React Testing Library, Playwright
- Decimal.js for financial precision

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000/en](http://localhost:3000/en) or [http://localhost:3000/ar](http://localhost:3000/ar).

### Local Supabase (optional)

When Docker and Supabase CLI are available:

```bash
supabase start
supabase db reset
```

Copy anon/service keys from `supabase status` into `.env.local`. **Never use production credentials.**

## Verification commands

| Command | Purpose |
|---------|---------|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright E2E |
| `npm run build` | Production build |
| `npm run verify` | lint + typecheck + test + build |

## Documentation

See [`docs/`](docs/) for architecture, domain model, database design, permissions, financial rules, and implementation status.

## Branch

Active development: `feature/enterprise-control-platform`

## License

Private — internal enterprise use.
