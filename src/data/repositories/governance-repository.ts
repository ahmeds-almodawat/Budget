import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateRiskExposure } from "@/domain/financial/calculations";
import { DataAccessError } from "@/data/repositories/budget-repository";

export async function getRisks(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("risks")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []).map((r) => ({
    ...r,
    computedExposure: calculateRiskExposure({
      probabilityPercent: r.probability_percent,
      financialImpact: r.financial_impact,
    }).toFixed(2),
  }));
}

export async function getIssues(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("issues")
    .select("*, risks(title_en, title_ar)")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getRegisterActions(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("register_actions")
    .select("*, issues(title_en, title_ar), risks(title_en, title_ar)")
    .eq("legal_entity_id", legalEntityId)
    .order("due_date");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getDecisions(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("decisions")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("decision_date", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getRegisterDependencies(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("register_dependencies")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function createRisk(
  db: SupabaseClient,
  input: {
    legalEntityId: string;
    controlScopeId?: string;
    titleEn: string;
    titleAr: string;
    probabilityPercent: number;
    financialImpact: string;
    scheduleImpactDays?: number;
    ownerId?: string;
    mitigationPlan?: string;
    contingencyPlan?: string;
    milestoneId?: string;
    contingencyBudget?: string;
  },
) {
  const { data, error } = await db
    .from("risks")
    .insert({
      legal_entity_id: input.legalEntityId,
      control_scope_id: input.controlScopeId,
      title_en: input.titleEn,
      title_ar: input.titleAr,
      probability_percent: input.probabilityPercent,
      financial_impact: input.financialImpact,
      schedule_impact_days: input.scheduleImpactDays ?? 0,
      owner_id: input.ownerId,
      mitigation_plan: input.mitigationPlan,
      contingency_plan: input.contingencyPlan,
      milestone_id: input.milestoneId,
      contingency_budget: input.contingencyBudget ?? "0",
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data;
}
