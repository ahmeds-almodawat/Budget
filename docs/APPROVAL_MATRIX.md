# Approval Matrix (Summary)

Workflow states: Draft → Submitted → Under Review → Approved/Rejected → Locked/Posted → Superseded.

| Object | Requester roles | Approver roles | Segregation |
|--------|-----------------|----------------|-------------|
| Budget | Budget Owner, Cost Controller | Approver, Legal Entity Admin | Requester ≠ approver |
| Budget change | Cost Controller | Approver + threshold rules | Immutable history |
| Milestone progress | Milestone Owner, Employee | Approver, PM | Reporter ≠ verifier |
| Actual import | Finance User | Cost Controller, Approver | Batch reconciliation |
| Contingency use | Project Manager | PMO Director, Approver | Linked to risk |

Configurable approval rules table planned for Phase 6 completion.
