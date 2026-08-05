# Local Setup

## Prerequisites

- Node.js 20+ (tested with 24.12.0)
- npm 11+
- Optional: Docker + Supabase CLI for database-backed mode

## Steps

1. Clone and install:
   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```

3. Optional Supabase:
   ```bash
   supabase start
   supabase db reset
   ```
   Update `.env.local` with keys from `supabase status`.

4. Verify:
   ```bash
   npm run verify
   ```

## URLs

- English: http://localhost:3000/en
- Arabic (RTL): http://localhost:3000/ar

## Limitation

Without local Supabase, dashboards display **development seed data** from `src/data/seed/development-seed.ts`. This is intentional for offline development.
