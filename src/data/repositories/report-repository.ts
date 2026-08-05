import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";

export type ReportType =
  | "budget_vs_actual"
  | "budget_actual_commitments"
  | "milestone_performance"
  | "restaurant_operational"
  | "unmapped_actuals";

export async function getBudgetVsActualReport(db: SupabaseClient) {
  const { data, error } = await db.from("v_budget_vs_actual").select("*");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getMilestonePerformanceReport(db: SupabaseClient) {
  const { data, error } = await db
    .from("milestones")
    .select("code, name_en, name_ar, baseline_date, forecast_date, approved_progress, reported_progress, approval_status, projects(control_scopes(name_en))")
    .order("baseline_date");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getRestaurantReport(db: SupabaseClient) {
  const { data, error } = await db.from("v_restaurant_branch_performance").select("*");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getUnmappedActualsReport(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("unmapped_transaction_queue")
    .select("*")
    .eq("legal_entity_id", legalEntityId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          const str = val == null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}
