import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAccountableDelay, calculateProgressPercent } from "@/domain/financial/calculations";
import { DataAccessError } from "@/data/repositories/budget-repository";

export interface ProgressSubmissionInput {
  milestoneId: string;
  reportedProgress: number;
  reportedBy: string;
  notes?: string;
  evidenceDescription?: string;
}

export interface ProgressVerificationInput {
  progressUpdateId: string;
  verifiedProgress: number;
  verifiedBy: string;
}

export interface ScheduleExtensionInput {
  projectId: string;
  requestedDays: number;
  grossDelayDays: number;
  excusableDelayDays: number;
  reason: string;
  delayReasonClass?: string;
  requesterId: string;
}

export async function getProjectTimeline(db: SupabaseClient, projectId: string) {
  const { data: project, error } = await db
    .from("projects")
    .select("*, control_scopes(name_en, name_ar)")
    .eq("id", projectId)
    .single();
  if (error || !project) throw new DataAccessError("Project not found.", "NOT_FOUND");

  const { data: phases } = await db
    .from("project_phases")
    .select("*")
    .eq("project_id", projectId)
    .order("sequence_no");

  const { data: milestones } = await db
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("baseline_date");

  const { data: scheduleChanges } = await db
    .from("schedule_change_requests")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return { project, phases: phases ?? [], milestones: milestones ?? [], scheduleChanges: scheduleChanges ?? [] };
}

export async function getProjectTasks(db: SupabaseClient, projectId: string) {
  const { data: phases } = await db
    .from("project_phases")
    .select("id, code, name_en, name_ar, work_packages(id, code, name_en, name_ar, tasks(*))")
    .eq("project_id", projectId)
    .order("sequence_no");

  return phases ?? [];
}

export async function getMilestones(db: SupabaseClient, projectId?: string) {
  let query = db
    .from("milestones")
    .select("*, projects(id, control_scope_id, control_scopes(name_en, name_ar))")
    .order("baseline_date");
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}

export async function getMilestoneDetail(db: SupabaseClient, milestoneId: string) {
  const { data: milestone, error } = await db
    .from("milestones")
    .select("*, projects(id, control_scope_id, control_scopes(name_en, name_ar))")
    .eq("id", milestoneId)
    .single();
  if (error || !milestone) throw new DataAccessError("Milestone not found.", "NOT_FOUND");

  const { data: steps } = await db
    .from("milestone_steps")
    .select("*")
    .eq("milestone_id", milestoneId)
    .order("sequence_no");

  const { data: updates } = await db
    .from("milestone_progress_updates")
    .select("*, progress_evidence(*)")
    .eq("milestone_id", milestoneId)
    .order("created_at", { ascending: false });

  const weightedProgress = calculateProgressPercent("weighted_steps", {
    completedSteps: (steps ?? []).map((s) => ({
      weight: Number(s.weight_percent),
      completed: s.completed,
    })),
  });

  return { milestone, steps: steps ?? [], updates: updates ?? [], weightedProgress };
}

export async function submitProgress(db: SupabaseClient, input: ProgressSubmissionInput) {
  const { data: update, error } = await db
    .from("milestone_progress_updates")
    .insert({
      milestone_id: input.milestoneId,
      reported_by: input.reportedBy,
      reported_progress: input.reportedProgress,
      approval_status: "submitted",
      notes: input.notes,
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  await db
    .from("milestones")
    .update({ reported_progress: input.reportedProgress })
    .eq("id", input.milestoneId);

  if (input.evidenceDescription) {
    await db.from("progress_evidence").insert({
      progress_update_id: update.id,
      file_name: "field-report.txt",
      description: input.evidenceDescription,
      uploaded_by: input.reportedBy,
    });
  }

  return update;
}

export async function verifyProgress(db: SupabaseClient, input: ProgressVerificationInput) {
  const { data: existing, error: fetchError } = await db
    .from("milestone_progress_updates")
    .select("milestone_id, reported_by")
    .eq("id", input.progressUpdateId)
    .single();
  if (fetchError || !existing) throw new DataAccessError("Progress update not found.", "NOT_FOUND");

  if (existing.reported_by === input.verifiedBy) {
    throw new DataAccessError("Reporter cannot verify own progress.", "FORBIDDEN");
  }

  const { data: update, error } = await db
    .from("milestone_progress_updates")
    .update({
      verified_by: input.verifiedBy,
      verified_progress: input.verifiedProgress,
      approval_status: "approved",
    })
    .eq("id", input.progressUpdateId)
    .select("id, milestone_id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  await db
    .from("milestones")
    .update({
      approved_progress: input.verifiedProgress,
      reported_progress: input.verifiedProgress,
      approval_status: "approved",
    })
    .eq("id", update.milestone_id);

  return update;
}

export async function acceptMilestone(db: SupabaseClient, milestoneId: string, approverId: string) {
  const { data: milestone, error } = await db
    .from("milestones")
    .update({
      approval_status: "approved",
      actual_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", milestoneId)
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  await db.from("audit_events").insert({
    actor_id: approverId,
    action: "approve",
    entity_type: "milestone",
    entity_id: milestoneId,
    new_value: { status: "accepted" },
  });

  return milestone;
}

export async function requestScheduleExtension(db: SupabaseClient, input: ScheduleExtensionInput) {
  const netDelay = calculateAccountableDelay({
    grossDelayDays: input.grossDelayDays,
    approvedNonControllableDays: input.excusableDelayDays,
  });

  const { data, error } = await db
    .from("schedule_change_requests")
    .insert({
      project_id: input.projectId,
      requested_days: input.requestedDays,
      gross_delay_days: input.grossDelayDays,
      excusable_delay_days: input.excusableDelayDays,
      net_delay_days: netDelay,
      reason: input.reason,
      delay_reason_class: input.delayReasonClass,
      requester_id: input.requesterId,
      approval_status: "submitted",
    })
    .select("id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data;
}

export async function approveScheduleExtension(
  db: SupabaseClient,
  requestId: string,
  approverId: string,
  approvedDays: number,
) {
  const { data: request, error: fetchError } = await db
    .from("schedule_change_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) throw new DataAccessError("Schedule change not found.", "NOT_FOUND");

  if (request.requester_id === approverId) {
    throw new DataAccessError("Requester cannot approve own schedule extension.", "FORBIDDEN");
  }

  const { data, error } = await db
    .from("schedule_change_requests")
    .update({
      approved_days: approvedDays,
      approver_id: approverId,
      approval_status: "approved",
      approval_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", requestId)
    .select("id, project_id")
    .single();
  if (error) throw new DataAccessError(error.message, "DATABASE");

  const { data: project } = await db
    .from("projects")
    .select("forecast_end, approved_revised_end")
    .eq("id", request.project_id)
    .single();

  if (project?.forecast_end) {
    const end = new Date(project.forecast_end);
    end.setDate(end.getDate() + approvedDays);
    const newEnd = end.toISOString().slice(0, 10);
    await db
      .from("projects")
      .update({
        forecast_end: newEnd,
        approved_revised_end: newEnd,
        gross_delay_days: request.gross_delay_days ?? 0,
        excusable_delay_days: request.excusable_delay_days ?? 0,
        net_delay_days: request.net_delay_days ?? 0,
        delay_reason_class: request.delay_reason_class,
      })
      .eq("id", request.project_id);
  }

  return data;
}

export async function getPendingProgressUpdates(db: SupabaseClient) {
  const { data, error } = await db
    .from("milestone_progress_updates")
    .select("*, milestones(id, code, name_en, name_ar, project_id)")
    .eq("approval_status", "submitted")
    .is("verified_by", null)
    .order("created_at", { ascending: false });
  if (error) throw new DataAccessError(error.message, "DATABASE");
  return data ?? [];
}
