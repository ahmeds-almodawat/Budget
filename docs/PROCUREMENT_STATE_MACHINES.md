# Procurement State Machines (P5)

## Purchase requisition

```
draft → submitted → department_approved → budget_checked → procurement_review → approved → sourcing → ordered → closed
```

Terminal / side states: `rejected`, `cancelled`, `returned_for_revision`

## RFQ

```
draft → issued → responses_open → evaluation → awarded → closed
```

Side: `cancelled`, `reopened` (controlled)

## Purchase order / contract

```
draft → submitted → reviewed → approved → issued → acknowledged → active → completed → closed
```

Side: `rejected`, `cancelled`, `terminated`, `suspended`

## Goods receipt

```
draft → submitted → inspected → accepted → posted
```

Side: `rejected`, `returned_to_vendor`, `cancelled`

## Supplier invoice

```
draft → submitted → matched → exception → approved → posted
```

Side: `rejected`, `cancelled`

## Payment request

```
draft → submitted → reviewed → approved → scheduled → paid → closed
```

Side: `rejected`, `cancelled`

All transitions via private transactional commands with `p_expected_status`, row locks, idempotency keys, and audit in the same transaction.
