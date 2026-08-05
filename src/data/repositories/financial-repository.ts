import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { calculateOpenCommitment } from "@/domain/financial/calculations";

export async function getActualTransactions(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("actual_transactions")
    .select("*, actual_transaction_allocations(*)")
    .eq("legal_entity_id", legalEntityId)
    .order("transaction_date", { ascending: false })
    .limit(100);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getUnmappedQueue(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("unmapped_transaction_queue")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getImportBatches(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("import_batches")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getDuplicateQueue(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("duplicate_review_queue")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getVendors(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("vendors")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getCommitments(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("commitments")
    .select("*, vendors(code, name_en, name_ar), control_accounts(code, name_en)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []).map((c) => ({
    ...c,
    openCommitment: calculateOpenCommitment({
      totalCommitted: Number(c.original_value) + Number(c.approved_variations),
      invoicedApplied: c.invoiced_applied,
      cancelled: c.cancelled_amount ?? 0,
    }).toFixed(2),
  }));
}

export async function createReversal(
  db: SupabaseClient,
  params: {
    legalEntityId: string;
    originalTransactionId: string;
    actorId: string;
    reason: string;
  },
) {
  const { data: original, error: fetchError } = await db
    .from("actual_transactions")
    .select("*")
    .eq("id", params.originalTransactionId)
    .single();
  if (fetchError || !original) throw new DataAccessError("Transaction not found.", "NOT_FOUND");
  if (original.is_reversal) throw new DataAccessError("Cannot reverse a reversal.", "FORBIDDEN");

  const { data, error } = await db
    .from("actual_transactions")
    .insert({
      legal_entity_id: params.legalEntityId,
      source_system: original.source_system,
      source_transaction_id: `${original.source_transaction_id}-REV-${Date.now()}`,
      transaction_date: new Date().toISOString().slice(0, 10),
      amount_ex_vat: -Number(original.amount_ex_vat),
      vat_amount: -Number(original.vat_amount),
      amount_inc_vat: -Number(original.amount_inc_vat),
      original_description: `Reversal: ${params.reason}`,
      is_reversal: true,
      reverses_transaction_id: original.id,
      is_posted: true,
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  await db.from("audit_events").insert({
    actor_id: params.actorId,
    action: "update",
    entity_type: "actual_transaction",
    entity_id: original.id,
    reason: params.reason,
    new_value: { reversal_id: data.id },
  });

  return data;
}
