# Proxy and Session Architecture (P4)

## Entry point

Next.js 16 **proxy** (`src/proxy.ts`) replaces legacy middleware. Matcher: `/`, `/(ar|en)/:path*`, `/auth/callback`.

```
Request → intlMiddleware (next-intl locale prefix)
       → updateSession (Supabase SSR cookie refresh)
       → merge Set-Cookie from session into intl response
       → redirect if session helper returns Location (unauthenticated)
```

## next-intl routing

- Locales: `en`, `ar` (`src/i18n/routing.ts`)
- App routes under `src/app/[locale]/…`
- `generateStaticParams` emits both locales
- Layout sets `lang` and `dir` (`rtl` for Arabic)

## Supabase session refresh

`src/lib/supabase/middleware.ts` (`updateSession`):

1. Build Supabase server client from request cookies
2. Call `getUser()` to refresh JWT / session cookies
3. Protected paths without user → redirect to `/{locale}/auth/sign-in`
4. Return response with updated auth cookies

## Cookie handling

- Uses `@supabase/ssr` cookie adapter (get/set on request/response)
- Session cookies are HttpOnly (Supabase defaults)
- Active legal entity selection stored in separate cookie via `context-actions` (server-set, not client-trusted for authorization)

## Unauthenticated redirect

- Proxy/session layer enforces authentication before page render
- API/server actions use `getActiveSession()` → `UNAUTHENTICATED` public error if missing

## Authorization vs authentication

| Layer | Responsibility |
|-------|----------------|
| Proxy / session | Identity present, session fresh |
| `withActivePermission` | Role + legal entity + resource permission |
| RLS | Row-level tenant isolation in Postgres |
| RPC commands | State machine, SOD, idempotency, audit |

UI visibility is not a security boundary.

## Callback route

`/auth/callback` — Supabase OAuth/code exchange (matcher included). PKCE session established server-side.

## Session expiry

Expired JWT → `getUser()` fails → redirect sign-in. Client shows `auth.sessionExpired` message on return.

## Active tenant selection

`setActiveLegalEntityAction` validates membership server-side before setting cookie. `assertLegalEntityAccess` on every guarded action.

## No service-role in user workflows

Application server actions and RPCs use **authenticated** role + RLS. Service role reserved for migrations, fixtures, CI bootstrap — never for ordinary UI workflows.

## Local vs production

| Setting | Local | Production |
|---------|-------|------------|
| Supabase URL | `127.0.0.1:56001` (CLI) | Project URL env |
| Anon key | `supabase status` / `.env.local` | CI secret |
| Fixtures | `ALLOW_LOCAL_FIXTURES=true` only | **Never** |
| Proxy | Same code path | Edge-compatible proxy export |

## Related files

- `src/proxy.ts` — proxy entry
- `src/lib/supabase/middleware.ts` — session refresh
- `src/lib/auth/session-context.ts` — active session + entity
- `src/lib/auth/action-guard.ts` — `withActivePermission`
- `src/app/actions/context-actions.ts` — tenant cookie
