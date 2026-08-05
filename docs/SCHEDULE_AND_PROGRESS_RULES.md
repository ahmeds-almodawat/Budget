# Schedule and Progress Rules

- Original baseline dates are never overwritten; revisions stored separately.
- Progress methods: 0/100, 50/50, weighted steps, quantity completed, milestone weighted, manual verified.
- Earned value uses **approved/verified** progress only.
- Reporter cannot approve own progress (DB check + domain rule).
- Schedule extensions require approved days, reason, approver, and optional evidence link.

Implemented in `src/domain/financial/calculations.ts` (`calculateProgressPercent`).
