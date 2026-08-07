import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";

export interface AppraisalCycleRow {
  id: string;
  legal_entity_id: string;
  name_en: string;
  name_ar: string;
  period_start: string;
  period_end: string;
  self_assessment_deadline: string | null;
  manager_deadline: string | null;
  review_deadline: string | null;
  cycle_status: string;
  created_by: string;
  activated_at: string | null;
  created_at: string;
}

export interface AppraisalTemplateRow {
  id: string;
  legal_entity_id: string;
  code: string;
  name_en: string;
  name_ar: string;
  rating_scale_max: number;
  is_active: boolean;
}

export interface AppraisalCriterionRow {
  id: string;
  template_id: string;
  sequence_no: number;
  category: string;
  name_en: string;
  name_ar: string;
  weight: number | string;
  max_scale: number;
}

export interface AppraisalAssignmentRow {
  id: string;
  legal_entity_id: string;
  cycle_id: string;
  template_id: string;
  employee_id: string;
  manager_id: string;
  reviewer_id: string | null;
  organization_unit_id: string | null;
  assignment_status: string;
  final_score: number | string | null;
  finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppraisalRatingRow {
  id: string;
  assignment_id: string;
  criterion_id: string;
  self_rating: number | string | null;
  manager_rating: number | string | null;
  calibrated_rating: number | string | null;
  self_comment: string | null;
  manager_comment: string | null;
}

export interface AppraisalPeerIdentityRow {
  id: string;
  full_name_en: string | null;
  full_name_ar: string | null;
}

export async function listAppraisalCycles(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("appraisal_cycles")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("period_start", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as AppraisalCycleRow[];
}

export async function listAppraisalTemplates(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("appraisal_templates")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .eq("is_active", true)
    .order("code");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as AppraisalTemplateRow[];
}

export async function listTemplateCriteria(db: SupabaseClient, templateId: string) {
  const { data, error } = await db
    .from("appraisal_template_criteria")
    .select("*")
    .eq("template_id", templateId)
    .order("sequence_no");
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as AppraisalCriterionRow[];
}

export async function listMyAppraisals(db: SupabaseClient, legalEntityId: string, userId: string) {
  const { data, error } = await db
    .from("appraisal_assignments")
    .select("*, appraisal_cycles(name_en, name_ar)")
    .eq("legal_entity_id", legalEntityId)
    .eq("employee_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as (AppraisalAssignmentRow & {
    appraisal_cycles?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
  })[];
}

export async function listTeamAppraisals(db: SupabaseClient, legalEntityId: string, managerId: string) {
  const { data, error } = await db
    .from("appraisal_assignments")
    .select("*, appraisal_cycles(name_en, name_ar)")
    .eq("legal_entity_id", legalEntityId)
    .eq("manager_id", managerId)
    .order("updated_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as (AppraisalAssignmentRow & {
    appraisal_cycles?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
  })[];
}

export async function listAppraisalPeerIdentities(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db.rpc("rpc_appraisal_peer_identities", {
    p_legal_entity_id: legalEntityId,
  });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as AppraisalPeerIdentityRow[];
}

export async function listAllAssignments(db: SupabaseClient, legalEntityId: string) {
  const { data, error } = await db
    .from("appraisal_assignments")
    .select("*")
    .eq("legal_entity_id", legalEntityId)
    .order("updated_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as AppraisalAssignmentRow[];
}

export async function getAppraisalAssignment(db: SupabaseClient, assignmentId: string) {
  const { data, error } = await db
    .from("appraisal_assignments")
    .select("*")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  if (!data) throw new DataAccessError("Appraisal assignment not found", "NOT_FOUND");
  return data as AppraisalAssignmentRow;
}

export async function getAssignmentRatings(db: SupabaseClient, assignmentId: string) {
  const { data, error } = await db
    .from("appraisal_ratings")
    .select("*")
    .eq("assignment_id", assignmentId);
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return (data ?? []) as AppraisalRatingRow[];
}
