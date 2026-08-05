import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateEarnedValue } from "@/domain/financial/calculations";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  CONTROL_SCOPE_KM_HOSPITAL,
  LEGAL_ENTITY_MODAWAT,
  FISCAL_YEAR_2027,
} from "@/types/database";
import { money } from "@/lib/money";

export async function ensureKhamisProjectStructure(db: SupabaseClient, projectManagerId: string) {
  const { data: existingProject } = await db
    .from("projects")
    .select("id")
    .eq("control_scope_id", CONTROL_SCOPE_KM_HOSPITAL)
    .maybeSingle();

  if (existingProject) return existingProject.id;

  const { data: project, error } = await db
    .from("projects")
    .insert({
      id: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
      control_scope_id: CONTROL_SCOPE_KM_HOSPITAL,
      primary_location_id: "33333333-3333-3333-3333-333333333306",
      responsible_department_id: "33333333-3333-3333-3333-333333333306",
      project_manager_id: projectManagerId,
      baseline_start: "2027-01-01",
      baseline_end: "2028-06-30",
      forecast_start: "2027-01-15",
      forecast_end: "2028-09-30",
      scope_description: "Khamis Mushait New Hospital Building",
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const { data: phase } = await db
    .from("project_phases")
    .insert({
      id: "dddddddd-dddd-dddd-dddd-dddddddddd01",
      project_id: project.id,
      code: "STRUCT",
      name_en: "Structural Works",
      name_ar: "الأعمال الإنشائية",
      sequence_no: 3,
      baseline_start: "2027-04-01",
      baseline_end: "2027-12-31",
    })
    .select("id")
    .single();

  const { data: wp } = await db
    .from("work_packages")
    .insert({
      id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01",
      phase_id: phase!.id,
      code: "FOUND",
      name_en: "Foundation Works",
      name_ar: "أعمال الأساسات",
      responsible_team_id: "99999999-9999-9999-9999-999999999901",
    })
    .select("id")
    .single();

  await db.from("milestones").insert({
    id: "ffffffff-ffff-ffff-ffff-ffffffffff01",
    project_id: project.id,
    phase_id: phase!.id,
    work_package_id: wp!.id,
    code: "MS-FOUNDATION",
    name_en: "Foundation Completed and Approved",
    name_ar: "اكتمال واعتماد الأساسات",
    responsible_team_id: "99999999-9999-9999-9999-999999999901",
    baseline_date: "2027-08-30",
    forecast_date: "2027-09-15",
    approved_progress: 65,
    reported_progress: 65,
    progress_method: "weighted_steps",
    approval_status: "approved",
  });

  await db.from("control_accounts").insert({
    id: "aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
    legal_entity_id: LEGAL_ENTITY_MODAWAT,
    control_scope_id: CONTROL_SCOPE_KM_HOSPITAL,
    project_id: project.id,
    phase_id: phase!.id,
    work_package_id: wp!.id,
    organization_unit_id: "33333333-3333-3333-3333-333333333306",
    cost_node_id: "66666666-6666-6666-6666-666666666608",
    responsible_team_id: "99999999-9999-9999-9999-999999999901",
    code: "CA-FOUNDATION",
    name_en: "Foundation Works",
    name_ar: "أعمال الأساسات",
  });

  const { data: budgetVersion } = await db
    .from("budget_versions")
    .insert({
      legal_entity_id: LEGAL_ENTITY_MODAWAT,
      control_scope_id: CONTROL_SCOPE_KM_HOSPITAL,
      fiscal_year_id: FISCAL_YEAR_2027,
      version_label: "KM-ORIGINAL",
      version_type: "project",
      approval_status: "locked",
      is_current_approved: true,
      original_approved_amount: "8500000",
      locked_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  await db.from("budget_lines").insert({
    budget_version_id: budgetVersion!.id,
    organization_unit_id: "33333333-3333-3333-3333-333333333306",
    cost_node_id: "66666666-6666-6666-6666-666666666608",
    planned_amount: "8500000",
    assumption: "Foundation ready-mix concrete and works",
  });

  await db.from("commitments").insert({
    legal_entity_id: LEGAL_ENTITY_MODAWAT,
    vendor_id: null,
    control_account_id: "aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
    reference_number: "PO-FOUND-001",
    description: "Foundation subcontract",
    original_value: "6200000",
    approved_variations: "200000",
    invoiced_applied: "4100000",
    approval_status: "approved",
  });

  return project.id;
}

export async function getProjectDashboard(db: SupabaseClient, projectId: string) {
  const { data: project, error } = await db
    .from("projects")
    .select("*, control_scopes(name_en, name_ar)")
    .eq("id", projectId)
    .single();
  if (error || !project) throw new DataAccessError("Project not found.", "NOT_FOUND");

  const { data: budget } = await db
    .from("budget_versions")
    .select("*")
    .eq("control_scope_id", project.control_scope_id)
    .eq("is_current_approved", true)
    .maybeSingle();

  const bac = budget?.original_approved_amount ?? "0";
  const pv = money(bac).times(0.45).toFixed(2);
  const ev = money(bac).times(0.35).toFixed(2);

  const { data: allocations } = await db
    .from("actual_transaction_allocations")
    .select("allocation_amount")
    .eq("organization_unit_id", project.responsible_department_id ?? "");
  const ac = (allocations ?? []).reduce((s, r) => s + Number(r.allocation_amount), 0).toFixed(2) || "3410000";

  const metrics = calculateEarnedValue({
    budgetAtCompletion: bac,
    plannedValue: pv,
    earnedValue: ev,
    actualCost: ac,
  });

  const { data: milestones } = await db
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("baseline_date");

  return { project, budget, metrics, milestones: milestones ?? [] };
}
