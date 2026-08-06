# Known Limitations

1. **Procurement lifecycle** — Requisition draft and submit are usable, and PO/invoice/payment records are readable. RFQ, quotation, evaluation, PO/contract commands, receipt/service entry, invoice matching, and payment workflow are not implemented.

2. **Master data breadth** — A governed draft/submit/approve lifecycle exists, but the UI does not expose every record type or a hierarchy browser. Database cycle rejection remains enforced.

3. **Delegated approvals** — Delegation records support submit/approve/activate/revoke/cancel. Active delegations are not resolved into approval inbox assignment.

4. **Period close** — Soft close, hard close, and reopen commands exist. Checklist blockers and the complete senior-approver reopen gate remain partial.

5. **Employee performance** — The route is a database-backed team milestone scorecard, not a full appraisal, objective, calibration, and review lifecycle.

6. **Administration** — The route is a read-only membership and role inventory. Production identity-provider administration is excluded.

7. **Attachments and notifications** — Production object storage and expanded in-app notification delivery remain unimplemented.

8. **REST-POS allocation debt** — Exactly six historical REST-POS actuals intentionally remain unallocated. They are excluded from allocation-driven reporting, fail reconciliation, and appear in the UI as explicit incomplete allocation work; they must not be silently repaired by fixtures.

9. **Local identity fixtures** — Known-password personas require an explicit loopback-only fixture command guarded by `ALLOW_LOCAL_FIXTURES=true`. They are not production credentials.

10. **Windows environment** — The local Supabase gateway may need repository-scoped readiness repair after container replacement. Test retries remain disabled, and any first-run failure is recorded separately from a later pass.

11. **Production readiness** — Production IdP/OAuth configuration, deployment observability/runbooks, storage, and the incomplete module capabilities above remain production blockers. No deployment or remote migration was performed by the closure task.
