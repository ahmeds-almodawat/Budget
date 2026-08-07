# Pull request consolidation

- Branch: `fix/audit-p0-authorization`
- Target: `feature/enterprise-control-platform`
- Title: `fix: rebuild database authorization and migration safety`
- Merge, deployment, and production migration are explicitly excluded.

The PR preserves these coherent implementation commits:

- `c159ae316582d442f58a8223ecc79eb357c153c2` — migration/fixture separation.
- `9e7fa663ff1f4eff9c89321e8ea06aea6a948fc1` — authorization boundary and tests.
- `089421438faff45bc2335aa056f562090d56c161` — CI and documentation evidence.

The PR description must link the required exact-head CI run. A green
authorization PR does not supersede the remaining financial and operational
blockers in the independent audit.
