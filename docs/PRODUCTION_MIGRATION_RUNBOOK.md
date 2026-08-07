# Production migration safety runbook

This document is a review artifact, not authorization to access or change a
production system.

## Pre-deployment gates

1. Take and verify a recoverable backup in the target environment.
2. Rehearse the exact migration set against a production-like restored copy.
3. Run `supabase db reset --no-seed` on a fresh isolated database and run
   `node scripts/assert-production-migrations-safe.mjs`; it must report zero Auth
   users.
4. Review the generated 54-table/3-view privilege matrix and all 84 policies.
5. Confirm the fixture file and `ALLOW_LOCAL_FIXTURES` are absent from the
   deployment command path.
6. Obtain separate approval for remaining audit blockers; this remediation alone
   is not a production go-live authorization.

## Forward migration behavior

The authorization migration preserves business and Auth rows. It moves
relocatable extension objects and application functions out of `public`, rebuilds
views, replaces policies/grants, classifies every public object, and adds policy
lookup indexes. It does not create, delete, disable, rotate, or rewrite users.

## Legacy deterministic-account quarantine

For a shared database that previously applied the legacy migrations, an operator
must inventory `auth.users` and `public.profiles` for the development domain and
the documented deterministic UUIDs. Security and system owners must then choose,
approve, and audit one of: disable/quarantine through the Auth Admin API, force
credential rotation and revoke sessions, or delete confirmed test-only accounts
after checking every foreign-key reference. Do not place that decision in an
automatic migration. Record actor, approval, affected IDs, timestamp, backup,
and validation results.

## Post-migration checks

Verify RLS/forced-RLS counts, policy roles, view invoker options, function ACLs,
all role privilege rows, tenant A/B denial probes, application sign-in, and
required workflow smoke tests. Roll back under the approved operational plan if
any boundary differs from the reviewed matrix.
