# Permission Matrix (Summary)

Roles defined in `src/domain/auth/permissions.ts`:

| Role | Typical scope | Write | Approve |
|------|---------------|-------|---------|
| System Administrator | Group | All | All |
| Auditor | Entity | Read only | No |
| Viewer | Entity | Read only | No |
| Budget Owner | Budget | Budget draft | No (segregation) |
| Approver | Entity/Scope | Read | Yes |
| Finance User | Entity | Import/allocate actuals | No |
| Project Manager | Project | Project/WBS | No budget approval |
| Employee | Task | Own tasks | Cannot approve own progress |

Database RLS enforces active membership, legal-entity isolation, effective role
dates, and group/entity/subordinate scope through canonical helpers in the
non-exposed `private` schema. `npm run test:db` generates the exact object and
policy matrix.

See [PERMISSION_MATRIX.md](./PERMISSION_MATRIX.md) for full matrix.
