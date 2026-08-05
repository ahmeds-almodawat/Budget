# Authentication and Authorization

**Milestone:** `composer-auth-workflows-v1`  
**Date:** 2026-08-05

## Overview

The platform uses **Supabase Auth** with cookie-based sessions (`@supabase/ssr`) in the Next.js App Router. All sensitive server actions derive the actor from the authenticated session — never from browser form input.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| Middleware | Session refresh, redirect unauthenticated users to `/[locale]/auth/sign-in` |
| `src/lib/auth/context.ts` | `getAuthContext()`, `requireAuthContext()`, `requirePermission()`, `assertLegalEntityAccess()` |
| Server actions | Permission checks + RLS-aware Supabase server client |
| RLS (PostgreSQL) | Forced RLS on all public tables; canonical helpers in the non-exposed `private` schema |
| UI | Role-aware button states, auth user bar, bilingual sign-in |

## Service role usage

`createAdminClient()` (`src/lib/supabase/admin.ts`) is **server-only** and retained for future admin/bootstrap tooling. **User workflow paths use the anon server client with JWT** so RLS applies.

## Local test identities

Password for all users: `Password123!`

| Email | Role | UUID (tests only) |
|-------|------|-------------------|
| budget.owner@modawat.local | budget_owner | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1` |
| approver@modawat.local | approver | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2` |
| finance@modawat.local | finance_user | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3` |
| auditor@modawat.local | auditor | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4` |
| viewer@modawat.local | viewer | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5` |
| pm@modawat.local | project_manager | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6` |
| employee@modawat.local | employee | `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7` |

**Legal entity:** `11111111-1111-1111-1111-111111111102` (Al Modawat)  
**Hospital budget scope:** `55555555-5555-5555-5555-555555555501`

### Production boundary

Local users are created only by `supabase/fixtures/local_personas.sql`, through
`npm run db:fixtures:local`. The loader refuses unless `ALLOW_LOCAL_FIXTURES=true`,
`--confirm-local` is present, and `DATABASE_URL` exactly matches the loopback
database reported by the repository's running Supabase stack. Production
migrations contain no known password, development email, Auth insert, identity
insert, profile fixture, membership fixture, or role fixture.

## Routes

| Route | Purpose |
|-------|---------|
| `/[locale]/auth/sign-in` | Bilingual email/password sign-in (EN/AR, RTL) |
| `/[locale]/auth/access-denied` | Authorization failure page |
| `/auth/callback` | OAuth/code exchange callback |

## Segregation of duties

- Budget owner cannot approve own submitted budget (server action reads `submitted_by` from DB)
- Approver cannot approve own change requests
- Auditor and viewer denied write paths (RLS + server actions + disabled UI)
- Employee progress self-verification blocked (DB CHECK + domain rules)

## SECURITY DEFINER functions

| Function | `search_path` | Execute grant |
|----------|---------------|---------------|
| `private.current_user_is_active()` | empty | `authenticated` only; schema not exposed |
| `private.current_user_has_active_membership()` | empty | `authenticated` only; schema not exposed |
| `private.user_can_access_legal_entity(uuid)` | empty | `authenticated` only; schema not exposed |
| `private.user_has_any_role(...)` | empty | `authenticated` only; schema not exposed |
| `private.user_has_role(...)` | empty | `authenticated` only; schema not exposed |

All ten trigger-only functions are also in `private`, use an empty
`search_path`, are invoker functions, and have no client execute grant. No
application or extension function remains in `public`.

## Verification

```bash
npx supabase db reset --no-seed
node scripts/assert-production-migrations-safe.mjs
npm run db:fixtures:local # only with the explicit local guard enabled
npm run verify
npm run test:e2e
```

See also [PERMISSION_MATRIX.md](./PERMISSION_MATRIX.md) and [SECURITY_REVIEW.md](./SECURITY_REVIEW.md).
