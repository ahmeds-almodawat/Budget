/**
 * Documentation of procurement lifecycle statuses (mirrors DB enums / RPCs).
 * Not enforced in the app layer — RPCs own transition validation.
 */

export const REQUISITION_STATUSES = [
  "draft",
  "submitted",
  "department_approved",
  "budget_checked",
  "procurement_review",
  "approved",
  "sourcing",
  "ordered",
  "closed",
  "rejected",
  "returned_for_revision",
  "cancelled",
] as const;

export const RFQ_STATUSES = [
  "draft",
  "issued",
  "responses_open",
  "responses_closed",
  "evaluation",
  "awarded",
  "closed",
  "cancelled",
] as const;

export const QUOTATION_STATUSES = [
  "received",
  "validated",
  "withdrawn",
  "disqualified",
  "accepted_for_evaluation",
] as const;

export const AWARD_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "cancelled",
] as const;

export const PO_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "issued",
  "partially_received",
  "closed",
  "cancelled",
  "rejected",
] as const;

export const CONTRACT_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "active",
  "closed",
  "rejected",
  "terminated",
  "expired",
] as const;

export const GOODS_RECEIPT_STATUSES = [
  "draft",
  "submitted",
  "inspected",
  "accepted",
  "rejected",
  "cancelled",
] as const;

export const SERVICE_ENTRY_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "rejected",
  "reversed",
] as const;

export const INVOICE_STATUSES = [
  "draft",
  "submitted",
  "matched",
  "approved",
  "exception",
] as const;

export const PAYMENT_REQUEST_STATUSES = [
  "draft",
  "submitted",
  "approved",
  "released",
  "cancelled",
  "rejected",
] as const;

/** approved on payment_request = ready_for_payment (not bank-paid). */
export const PAYMENT_APPROVED_MEANS_READY_FOR_PAYMENT = true;
