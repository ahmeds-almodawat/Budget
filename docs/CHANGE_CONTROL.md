# Authorization remediation change control

## Authorized scope

This branch is limited to `COD-C-001`, `COD-C-002`, `COD-C-003`, `COD-H-001`,
`COD-H-002`, `COD-M-001`, and CI evidence for `COD-H-014`. It changes database
authorization, view execution, local fixture separation, role/session scope,
function hardening, regression evidence, and CI determinism.

It does not remediate financial workflow state machines, audit authenticity,
reversals, allocations, import atomicity, EVM/report formulas, spreadsheet
injection, or unfinished product modules. Those findings retain their original
merge/production disposition in `CODEX_AUDIT_REPORT.md`.

## Migration policy

- Existing migration version filenames are retained for compatibility.
- Legacy deterministic personas and user foreign-key seed values were removed
  from fresh replay without rewriting any already-applied shared database.
- `20260805205823_authorization_boundary.sql` is the forward, data-preserving
  authorization migration.
- No migration deletes, disables, rotates, or silently rewrites an existing Auth
  user. Legacy-account quarantine is an explicit operator decision in
  `PRODUCTION_MIGRATION_RUNBOOK.md`.
- Local personas require the explicit guarded fixture.

## Review gates

Merge requires a clean first-attempt CI run at the exact PR head and review of
the generated authorization matrix. Production remains blocked by the
out-of-scope audit findings even if this PR is green.
