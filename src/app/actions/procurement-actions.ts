"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  getRfq,
  listAwards,
  listContracts,
  listInvoices,
  listPaymentRequests,
  listPurchaseOrders,
  listQuotations,
  listReceipts,
  listRequisitionsWithLines,
  listRfqs,
  listServiceEntries,
  listSourcingEvaluations,
  listVendorsEnriched,
} from "@/data/repositories/procurement-repository";
import {
  awardApprove,
  awardCreateAndSubmit,
  contractActivate,
  contractApprove,
  contractClose,
  contractCreate,
  contractExpire,
  contractReject,
  contractSubmit,
  contractTerminate,
  evaluationSubmit,
  goodsReceiptAccept,
  goodsReceiptCreate,
  invoiceMatchOverride,
  paymentRequestApprove,
  paymentRequestCancel,
  paymentRequestCreate,
  paymentRequestReject,
  paymentRequestSubmit,
  poApprove,
  poCancel,
  poCreateFromAward,
  poIssue,
  poSubmit,
  quotationCreate,
  requisitionApprove,
  requisitionBudgetCheck,
  requisitionCreateDraft,
  requisitionDepartmentApprove,
  requisitionSubmit,
  requisitionUpsertLine,
  rfqCloseResponses,
  rfqCreateFromRequisition,
  rfqInviteSupplier,
  rfqIssue,
  serviceEntryAccept,
  serviceEntryCreate,
  supplierInvoiceApprove,
  supplierInvoiceCreate,
  supplierInvoiceMatch,
  supplierInvoiceReverseAndReplace,
} from "@/lib/commands";
import { withActivePermission } from "@/lib/auth/action-guard";

async function reloadRequisition(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("purchase_requisitions")
    .select("*, purchase_requisition_lines(*)")
    .eq("id", id)
    .single();
  if (error || !data) throw new DataAccessError("Requisition not found.", "NOT_FOUND");
  return data;
}

async function reloadPo(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("purchase_orders")
    .select("*, vendors(name_en, name_ar), purchase_order_lines(*)")
    .eq("id", id)
    .single();
  if (error || !data) throw new DataAccessError("Purchase order not found.", "NOT_FOUND");
  return data;
}

async function reloadContract(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("procurement_contracts")
    .select("*, vendors(name_en, name_ar)")
    .eq("id", id)
    .single();
  if (error || !data) throw new DataAccessError("Contract not found.", "NOT_FOUND");
  return data;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function fetchRequisitionsWithLinesAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listRequisitionsWithLines(db, legalEntityId),
  );
}

export async function fetchRfqsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listRfqs(db, legalEntityId),
  );
}

export async function fetchRfqDetailAction(rfqId: string) {
  return withActivePermission("commitment", "read", async ({ db }) => getRfq(db, rfqId));
}

export async function fetchQuotationsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listQuotations(db, legalEntityId),
  );
}

export async function fetchAwardsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listAwards(db, legalEntityId),
  );
}

export async function fetchEvaluationsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listSourcingEvaluations(db, legalEntityId),
  );
}

export async function fetchPurchaseOrdersWithLinesAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listPurchaseOrders(db, legalEntityId),
  );
}

export async function fetchReceiptsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listReceipts(db, legalEntityId),
  );
}

export async function fetchServiceEntriesAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listServiceEntries(db, legalEntityId),
  );
}

export async function fetchInvoicesAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listInvoices(db, legalEntityId),
  );
}

export async function fetchPaymentRequestsListAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listPaymentRequests(db, legalEntityId),
  );
}

export async function fetchContractsAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listContracts(db, legalEntityId),
  );
}

export async function fetchVendorsEnrichedAction() {
  return withActivePermission("commitment", "read", async ({ legalEntityId, db }) =>
    listVendorsEnriched(db, legalEntityId),
  );
}

// ── Requisitions ───────────────────────────────────────────────────────────

export async function createRequisitionDraftAction(params: {
  requisitionNumber: string;
  titleEn: string;
  titleAr: string;
  fiscalPeriodId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ legalEntityId, db }) => {
    const result = await requisitionCreateDraft(db, { legalEntityId, ...params });
    return reloadRequisition(db, result.entity_id as string);
  });
}

export async function upsertRequisitionLineAction(params: {
  requisitionId: string;
  lineNumber: number;
  description: string;
  quantity: string;
  unitPrice: string;
  uom?: string;
  lineId?: string;
  requiredBy?: string;
}) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await requisitionUpsertLine(db, params);
    return reloadRequisition(db, params.requisitionId);
  });
}

export async function submitRequisitionAction(requisitionId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await requisitionSubmit(db, requisitionId);
    return reloadRequisition(db, requisitionId);
  });
}

export async function departmentApproveRequisitionAction(requisitionId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await requisitionDepartmentApprove(db, requisitionId);
    return reloadRequisition(db, requisitionId);
  });
}

export async function budgetCheckRequisitionAction(requisitionId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await requisitionBudgetCheck(db, requisitionId);
    return reloadRequisition(db, requisitionId);
  });
}

export async function sendRequisitionToProcurementReviewAction(requisitionId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    const { requisitionProcurementReview } = await import("@/lib/commands");
    await requisitionProcurementReview(db, requisitionId);
    return reloadRequisition(db, requisitionId);
  });
}

export async function approveRequisitionAction(requisitionId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await requisitionApprove(db, requisitionId);
    return reloadRequisition(db, requisitionId);
  });
}

// ── RFQ ────────────────────────────────────────────────────────────────────

export async function createRfqFromRequisitionAction(params: {
  requisitionId: string;
  rfqNumber: string;
  titleEn?: string;
  titleAr?: string;
  responseDeadline?: string;
}) {
  return withActivePermission("commitment", "create", async ({ db }) => {
    const result = await rfqCreateFromRequisition(db, params);
    return getRfq(db, result.entity_id as string);
  });
}

export async function inviteRfqSupplierAction(params: { rfqId: string; vendorId: string }) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await rfqInviteSupplier(db, params);
    return getRfq(db, params.rfqId);
  });
}

export async function issueRfqAction(params: {
  rfqId: string;
  issueDate?: string;
  responseDeadline?: string;
}) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await rfqIssue(db, params);
    return getRfq(db, params.rfqId);
  });
}

export async function closeRfqResponsesAction(rfqId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await rfqCloseResponses(db, rfqId);
    return getRfq(db, rfqId);
  });
}

// ── Quotations / evaluation / award ────────────────────────────────────────

export async function createQuotationAction(params: {
  rfqId: string;
  vendorId: string;
  supplierQuoteReference: string;
  lines: unknown[];
  vatAmount?: string;
  notes?: string;
  validUntil?: string;
}) {
  return withActivePermission("commitment", "create", async ({ db }) => {
    const result = await quotationCreate(db, params);
    const { data, error } = await db
      .from("supplier_quotations")
      .select("*, vendors(name_en, name_ar), rfqs(rfq_number)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Quotation not found.", "NOT_FOUND");
    return data;
  });
}

export async function submitEvaluationAction(params: {
  rfqId: string;
  quotationId: string;
  scores: unknown[];
  criteria?: unknown[];
  recommendation?: string;
  comments?: string;
}) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    const result = await evaluationSubmit(db, params);
    const { data, error } = await db
      .from("sourcing_evaluations")
      .select("*")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Evaluation not found.", "NOT_FOUND");
    return data;
  });
}

export async function createAndSubmitAwardAction(params: {
  rfqId: string;
  quotationId: string;
  lines: unknown[];
  justification?: string;
  evaluationId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ db }) => {
    const result = await awardCreateAndSubmit(db, params);
    const { data, error } = await db
      .from("sourcing_awards")
      .select("*, vendors(name_en, name_ar), sourcing_award_lines(*)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Award not found.", "NOT_FOUND");
    return data;
  });
}

export async function approveAwardAction(awardId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await awardApprove(db, awardId);
    const { data, error } = await db
      .from("sourcing_awards")
      .select("*, vendors(name_en, name_ar), sourcing_award_lines(*)")
      .eq("id", awardId)
      .single();
    if (error || !data) throw new DataAccessError("Award not found.", "NOT_FOUND");
    return data;
  });
}

// ── Purchase orders ────────────────────────────────────────────────────────

export async function createPoFromAwardAction(params: {
  awardId: string;
  fiscalPeriodId?: string;
  description?: string;
}) {
  return withActivePermission("commitment", "create", async ({ db }) => {
    const result = await poCreateFromAward(db, params);
    return reloadPo(db, result.entity_id as string);
  });
}

export async function submitPoAction(poId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await poSubmit(db, poId);
    return reloadPo(db, poId);
  });
}

export async function approvePoAction(poId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await poApprove(db, poId);
    return reloadPo(db, poId);
  });
}

export async function issuePoAction(poId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await poIssue(db, poId);
    return reloadPo(db, poId);
  });
}

export async function cancelPoAction(params: { poId: string; reason?: string }) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await poCancel(db, params);
    return reloadPo(db, params.poId);
  });
}

// ── Contracts ──────────────────────────────────────────────────────────────

export async function createContractAction(params: {
  vendorId: string;
  contractNumber: string;
  titleEn: string;
  titleAr: string;
  startDate: string;
  endDate: string;
  ceilingValue?: string;
  awardId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ legalEntityId, db }) => {
    const result = await contractCreate(db, { legalEntityId, ...params });
    return reloadContract(db, result.entity_id as string);
  });
}

export async function submitContractAction(contractId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await contractSubmit(db, contractId);
    return reloadContract(db, contractId);
  });
}

export async function approveContractAction(contractId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await contractApprove(db, contractId);
    return reloadContract(db, contractId);
  });
}

export async function activateContractAction(contractId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await contractActivate(db, contractId);
    return reloadContract(db, contractId);
  });
}

export async function rejectContractAction(contractId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await contractReject(db, contractId);
    return reloadContract(db, contractId);
  });
}

export async function closeContractAction(contractId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await contractClose(db, contractId);
    return reloadContract(db, contractId);
  });
}

export async function terminateContractAction(contractId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await contractTerminate(db, contractId);
    return reloadContract(db, contractId);
  });
}

export async function expireContractAction(contractId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await contractExpire(db, contractId);
    return reloadContract(db, contractId);
  });
}

// ── Receipts / service entries ─────────────────────────────────────────────

export async function createGoodsReceiptAction(params: {
  purchaseOrderId: string;
  receiptNumber: string;
  receiptDate?: string;
  deliveryNote?: string;
  lines?: unknown[];
  fiscalPeriodId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ db }) => {
    const result = await goodsReceiptCreate(db, params);
    const { data, error } = await db
      .from("goods_receipts")
      .select("*, purchase_orders(po_number), goods_receipt_lines(*)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Goods receipt not found.", "NOT_FOUND");
    return data;
  });
}

export async function acceptGoodsReceiptAction(goodsReceiptId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await goodsReceiptAccept(db, goodsReceiptId);
    const { data, error } = await db
      .from("goods_receipts")
      .select("*, purchase_orders(po_number), goods_receipt_lines(*)")
      .eq("id", goodsReceiptId)
      .single();
    if (error || !data) throw new DataAccessError("Goods receipt not found.", "NOT_FOUND");
    return data;
  });
}

export async function createServiceEntryAction(params: {
  vendorId: string;
  entryNumber: string;
  description: string;
  purchaseOrderId?: string;
  contractId?: string;
  lines?: unknown[];
  fiscalPeriodId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ legalEntityId, db }) => {
    const result = await serviceEntryCreate(db, { legalEntityId, ...params });
    const { data, error } = await db
      .from("service_entries")
      .select("*, vendors(name_en, name_ar), service_entry_lines(*)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Service entry not found.", "NOT_FOUND");
    return data;
  });
}

export async function acceptServiceEntryAction(serviceEntryId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await serviceEntryAccept(db, serviceEntryId);
    const { data, error } = await db
      .from("service_entries")
      .select("*, vendors(name_en, name_ar), service_entry_lines(*)")
      .eq("id", serviceEntryId)
      .single();
    if (error || !data) throw new DataAccessError("Service entry not found.", "NOT_FOUND");
    return data;
  });
}

// ── Invoices / payments ────────────────────────────────────────────────────

export async function createSupplierInvoiceAction(params: {
  purchaseOrderId: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  grossAmount: string;
  subtotalExVat?: string;
  vatAmount?: string;
  dueDate?: string;
  lines?: unknown[];
  fiscalPeriodId?: string;
}) {
  return withActivePermission("commitment", "create", async ({ legalEntityId, db }) => {
    const result = await supplierInvoiceCreate(db, { legalEntityId, ...params });
    const { data, error } = await db
      .from("supplier_invoices")
      .select("*, purchase_orders(po_number), vendors(name_en, name_ar)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Invoice not found.", "NOT_FOUND");
    return data;
  });
}

export async function matchSupplierInvoiceAction(supplierInvoiceId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await supplierInvoiceMatch(db, supplierInvoiceId);
    const { data, error } = await db
      .from("supplier_invoices")
      .select("*, purchase_orders(po_number), vendors(name_en, name_ar)")
      .eq("id", supplierInvoiceId)
      .single();
    if (error || !data) throw new DataAccessError("Invoice not found.", "NOT_FOUND");
    return data;
  });
}

export async function overrideInvoiceMatchAction(params: {
  supplierInvoiceId: string;
  reason: string;
}) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await invoiceMatchOverride(db, params);
    const { data, error } = await db
      .from("supplier_invoices")
      .select("*, purchase_orders(po_number), vendors(name_en, name_ar)")
      .eq("id", params.supplierInvoiceId)
      .single();
    if (error || !data) throw new DataAccessError("Invoice not found.", "NOT_FOUND");
    return data;
  });
}

export async function approveSupplierInvoiceAction(supplierInvoiceId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await supplierInvoiceApprove(db, supplierInvoiceId);
    const { data, error } = await db
      .from("supplier_invoices")
      .select("*, purchase_orders(po_number), vendors(name_en, name_ar)")
      .eq("id", supplierInvoiceId)
      .single();
    if (error || !data) throw new DataAccessError("Invoice not found.", "NOT_FOUND");
    return data;
  });
}

export async function reverseSupplierInvoiceAction(params: {
  supplierInvoiceId: string;
  reason: string;
  replacementInvoiceNumber?: string;
  replacementInvoiceDate?: string;
}) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    const result = await supplierInvoiceReverseAndReplace(db, params);
    const ids = [params.supplierInvoiceId];
    if (result.replacement_invoice_id) ids.push(result.replacement_invoice_id as string);
    const { data, error } = await db
      .from("supplier_invoices")
      .select("*, purchase_orders(po_number), vendors(name_en, name_ar)")
      .in("id", ids);
    if (error || !data?.length) throw new DataAccessError("Invoice not found.", "NOT_FOUND");
    return data;
  });
}

export async function createPaymentRequestAction(params: {
  supplierInvoiceId: string;
  amount: string;
  dueDate?: string;
  reason?: string;
}) {
  return withActivePermission("commitment", "create", async ({ legalEntityId, db }) => {
    const result = await paymentRequestCreate(db, { legalEntityId, ...params });
    const { data, error } = await db
      .from("payment_requests")
      .select("*, supplier_invoices(invoice_number)")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Payment request not found.", "NOT_FOUND");
    return data;
  });
}

export async function submitPaymentRequestAction(paymentRequestId: string) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await paymentRequestSubmit(db, paymentRequestId);
    const { data, error } = await db
      .from("payment_requests")
      .select("*, supplier_invoices(invoice_number)")
      .eq("id", paymentRequestId)
      .single();
    if (error || !data) throw new DataAccessError("Payment request not found.", "NOT_FOUND");
    return data;
  });
}

export async function approvePaymentRequestAction(paymentRequestId: string) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await paymentRequestApprove(db, paymentRequestId);
    const { data, error } = await db
      .from("payment_requests")
      .select("*, supplier_invoices(invoice_number)")
      .eq("id", paymentRequestId)
      .single();
    if (error || !data) throw new DataAccessError("Payment request not found.", "NOT_FOUND");
    return data;
  });
}

export async function rejectPaymentRequestAction(params: { paymentRequestId: string; reason: string }) {
  return withActivePermission("commitment", "approve", async ({ db }) => {
    await paymentRequestReject(db, params);
    const { data, error } = await db
      .from("payment_requests")
      .select("*, supplier_invoices(invoice_number)")
      .eq("id", params.paymentRequestId)
      .single();
    if (error || !data) throw new DataAccessError("Payment request not found.", "NOT_FOUND");
    return data;
  });
}

export async function cancelPaymentRequestAction(params: {
  paymentRequestId: string;
  reason: string;
  expectedStatus: "draft" | "submitted" | "approved";
}) {
  return withActivePermission("commitment", "update", async ({ db }) => {
    await paymentRequestCancel(db, params);
    const { data, error } = await db
      .from("payment_requests")
      .select("*, supplier_invoices(invoice_number)")
      .eq("id", params.paymentRequestId)
      .single();
    if (error || !data) throw new DataAccessError("Payment request not found.", "NOT_FOUND");
    return data;
  });
}
