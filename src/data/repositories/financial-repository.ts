import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { calculateOpenCommitment } from "@/domain/financial/calculations";
import { reverseActualTransaction } from "@/lib/commands";

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
    .select("*, import_batches!inner(legal_entity_id)")
    .eq("import_batches.legal_entity_id", legalEntityId)
    .eq("status", "open")
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
    .select("*, import_batches!inner(legal_entity_id)")
    .eq("import_batches.legal_entity_id", legalEntityId)
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
    idempotencyKey?: string;
    correlationId?: string;
  },
) {
  const result = await reverseActualTransaction(db, params.originalTransactionId, params.reason, {
    idempotencyKey: params.idempotencyKey,
    correlationId: params.correlationId,
  });

  const reversalId = (result.reversal_id ?? result.entity_id) as string;
  const { data, error } = await db
    .from("actual_transactions")
    .select("id")
    .eq("id", reversalId)
    .single();
  if (error || !data) throw new DataAccessError("Reversal transaction not found.", "NOT_FOUND");
  return data;
}
