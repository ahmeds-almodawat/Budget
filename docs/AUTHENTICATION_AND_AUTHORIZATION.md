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
| RLS (PostgreSQL) | Entity isolation via `user_legal_entity_ids()`, role checks via `user_has_role()` |
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

Local users with known passwords are created in migrations `20260805120800` and `20260805121200` only. These must not be applied to production databases. E2E and integration tests authenticate against the local Supabase Auth instance using fixtures in `src/test/fixtures/users.ts` — never mock sessions in E2E.

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
| `user_legal_entity_ids()` | `public` | `authenticated` only |
| `user_has_role(text, uuid)` | `public` | `authenticated` only |

## Verification

```bash
supabase db reset
npm run verify
npm run test:e2e
```

See also [PERMISSION_MATRIX.md](./PERMISSION_MATRIX.md) and [SECURITY_REVIEW.md](./SECURITY_REVIEW.md).
