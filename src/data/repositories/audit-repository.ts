import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";

export interface AuditSearchFilters {
  entityType?: string;
  action?: string;
  actorId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export async function searchAuditEvents(
  db: SupabaseClient,
  legalEntityId: string,
  filters: AuditSearchFilters,
) {
  const { data, error } = await db.rpc("rpc_search_audit_events", {
    p_legal_entity_id: legalEntityId,
    p_entity_type: filters.entityType ?? null,
    p_action: filters.action ?? null,
    p_actor_id: filters.actorId ?? null,
    p_from_date: filters.fromDate ?? null,
    p_to_date: filters.toDate ?? null,
    p_limit: filters.limit ?? 100,
  });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getOpenExceptions(db: SupabaseClient, legalEntityId: string) {
  const { data: notifications, error: nErr } = await db
    .from("notifications")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (nErr) throw new DataAccessError(nErr.message, "DATABASE");

  const { data: variances, error: vErr } = await db
    .from("variance_explanations")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .eq("approval_status", "submitted");
  if (vErr) throw new DataAccessError(vErr.message, "DATABASE");

  const { data: unmapped, error: uErr } = await db
    .from("unmapped_transaction_queue")
    .select("*, import_batches!inner(legal_entity_id)")
    .eq("import_batches.legal_entity_id", legalEntityId)
    .eq("status", "open");
  if (uErr) throw new DataAccessError(uErr.message, "DATABASE");

  return {
    notifications: notifications ?? [],
    varianceExplanations: variances ?? [],
    unmappedTransactions: unmapped ?? [],
  };
}
