import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { contractRemainingCeiling, invoiceUnpaidBalance } from "@/domain/procurement/calculations";

function throwDb(error: { message: string }): never {
  throw new DataAccessError(error.message, "DATABASE");
}

export async function listRfqs(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("rfqs")
    .select("*, rfq_lines(*), purchase_requisitions(requisition_number, title_en, title_ar)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function getRfq(db: SupabaseClient, rfqId: string) {
  const { data, error } = await db
    .from("rfqs")
    .select(
      "*, rfq_lines(*), rfq_suppliers(*, vendors(id, name_en, name_ar, status)), purchase_requisitions(id, requisition_number)",
    )
    .eq("id", rfqId)
    .single();
  if (error) throwDb(error);
  return data;
}

export async function listQuotations(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("supplier_quotations")
    .select("*, vendors(name_en, name_ar), rfqs(rfq_number, title_en, title_ar)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listAwards(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("sourcing_awards")
    .select(
      "*, vendors(name_en, name_ar), rfqs(rfq_number), supplier_quotations(supplier_quote_reference), sourcing_award_lines(*)",
    )
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listPurchaseOrders(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("purchase_orders")
    .select("*, vendors(name_en, name_ar), purchase_order_lines(*)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listReceipts(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("goods_receipts")
    .select("*, purchase_orders(po_number), vendors(name_en, name_ar), goods_receipt_lines(*)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listServiceEntries(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("service_entries")
    .select(
      "*, vendors(name_en, name_ar), purchase_orders(po_number), procurement_contracts(contract_number), service_entry_lines(*)",
    )
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listInvoices(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("supplier_invoices")
    .select(
      "*, purchase_orders(po_number), vendors(name_en, name_ar), supplier_invoice_lines(*), invoice_match_results(match_status, match_mode)",
    )
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listPaymentRequests(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("payment_requests")
    .select("*, supplier_invoices(invoice_number, gross_amount)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listContracts(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("procurement_contracts")
    .select("*, vendors(name_en, name_ar)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);

  const contracts = data ?? [];
  if (contracts.length === 0) return [];

  const contractIds = contracts.map((c) => c.id as string);
  const { data: pos } = await db
    .from("purchase_orders")
    .select("id, contract_id, total_amount, po_status")
    .in("contract_id", contractIds)
    .neq("po_status", "cancelled");

  const consumedByContract = new Map<string, number>();
  for (const po of pos ?? []) {
    if (!po.contract_id) continue;
    const prev = consumedByContract.get(po.contract_id) ?? 0;
    consumedByContract.set(po.contract_id, prev + Number(po.total_amount ?? 0));
  }

  return contracts.map((c) => {
    const consumed = consumedByContract.get(c.id as string) ?? 0;
    return {
      ...c,
      consumed_value: consumed.toFixed(4),
      remaining_ceiling: contractRemainingCeiling(c.ceiling_value ?? 0, consumed).toFixed(4),
    };
  });
}

export async function listVendorsEnriched(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("vendors")
    .select(
      "id, name_en, name_ar, status, tax_registration_number, commercial_registration_number, country, currency_code, contact_email, contact_phone, payment_terms_days, supplier_category, legal_name, effective_from, effective_to",
    )
    .eq("legal_entity_id", legalEntityId)
    .order("name_en");
  if (error) throwDb(error);
  return data ?? [];
}

export async function listRequisitionsWithLines(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("purchase_requisitions")
    .select("*, purchase_requisition_lines(*)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listSourcingEvaluations(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("sourcing_evaluations")
    .select(
      "*, rfqs(rfq_number, title_en, title_ar), supplier_quotations(supplier_quote_reference, vendors(name_en, name_ar)), sourcing_evaluation_scores(*)",
    )
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throwDb(error);
  return data ?? [];
}

export async function listEvaluationCriteria(db: SupabaseClient, rfqId: string) {
  const { data, error } = await db
    .from("evaluation_criteria")
    .select("*")
    .eq("rfq_id", rfqId)
    .order("sequence_no");
  if (error) throwDb(error);
  return data ?? [];
}

export function unpaidBalanceForInvoice(
  grossAmount: string | number,
  paymentRequests: { amount: string | number; request_status: string }[],
) {
  const active = paymentRequests
    .filter((p) => !["cancelled", "rejected"].includes(p.request_status))
    .map((p) => p.amount);
  return invoiceUnpaidBalance(grossAmount, active).toFixed(4);
}
