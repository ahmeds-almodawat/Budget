# Pull request consolidation

- Branch: `fix/audit-p0-authorization`
- Target: `feature/enterprise-control-platform`
- Title: `fix: rebuild database authorization and migration safety`
- Merge, deployment, and production migration are explicitly excluded.

The PR should preserve coherent commits for migration/fixture separation,
authorization implementation and tests, and documentation/evidence. The final
PR description must link the exact implementation commits and the required CI
run. A green authorization PR does not supersede the remaining financial and
operational blockers in the independent audit.
