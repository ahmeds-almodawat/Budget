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

export async function searchAuditEvents(db: SupabaseClient, filters: AuditSearchFilters) {
  let query = db
    .from("audit_events")
    .select("*, profiles(full_name_en, full_name_ar, email)")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.fromDate) query = query.gte("created_at", filters.fromDate);
  if (filters.toDate) query = query.lte("created_at", `${filters.toDate}T23:59:59`);

  const { data, error } = await query;
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
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .eq("status", "pending");
  if (uErr) throw new DataAccessError(uErr.message, "DATABASE");

  return {
    notifications: notifications ?? [],
    varianceExplanations: variances ?? [],
    unmappedTransactions: unmapped ?? [],
  };
}
