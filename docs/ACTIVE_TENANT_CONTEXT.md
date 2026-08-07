# Active Tenant Context (COD-M-004)

## Model

Each authenticated request resolves:

1. **User** — from Supabase session
2. **Active legal entity** — from membership allow-list + httpOnly cookie
3. **Permitted scopes** — from role assignments for the active entity
4. **Financial year** — from route/report selection or entity default

## Cookie

- Name: `ecp_active_legal_entity_id`
- httpOnly, validated server-side
- Must match an active membership-derived legal entity ID

## Resolution rules

| Condition | Behavior |
|-----------|----------|
| One membership | Auto-resolve without selector |
| Multiple memberships, valid cookie | Use cookie value |
| Multiple memberships, no/invalid cookie | `Active legal entity must be selected` |
| Cookie for unauthorized entity | `Access denied for this legal entity` |

## Server enforcement

- `requireActiveLegalEntity()` in `src/lib/auth/active-context.ts`
- `withActivePermission()` in `src/lib/auth/action-guard.ts`
- Each action loads and authorizes the concrete resource; no global tenant constant

## UI

- `ActiveEntitySelector` in application header
- `setActiveLegalEntityAction` / `getActiveContextAction`

## Error handling

Database errors map to stable public messages with server-side correlation IDs (`src/lib/errors/safe-error.ts`). No table names, constraint names, SQLSTATE, or stack traces in client responses.

## Hardcoded IDs

Fixed UUIDs remain only in:

- `supabase/migrations/*_seed_data.sql`
- `src/test/fixtures/*`
- Documented development examples

They must not appear in general server-action or repository runtime paths.
