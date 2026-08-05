# Concurrency-control disposition

This remediation adds no claim that financial or approval workflows are
transactionally complete. The authorization helpers are stable read predicates;
fixture loading uses one transaction and an advisory lock; CI runs each suite
once with no Playwright retry.

The independent audit's concurrency findings for budget approval, imports,
actual posting, milestone verification, schedule changes, and duplicate
submissions remain unresolved and production-blocking. They require separately
authorized transactional RPC/state-machine work and concurrency regression
tests.
