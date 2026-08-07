import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateAccountableDelay, calculateProgressPercent } from "@/domain/financial/calculations";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  acceptMilestoneCommand,
  scheduleApproveExtension,
  submitProgressCommand,
  verifyProgressCommand,
} from "@/lib/commands";

export interface ProgressSubmissionInput {
  milestoneId: string;
  reportedProgress: number;
  reportedBy: string;
  notes?: string;
  evidenceDescription?: string;
  idempotencyKey?: string;
}

export interface ProgressVerificationInput {
  progressUpdateId: string;
  verifiedProgress: number;
  verifiedBy: string;
  idempotencyKey?: string;
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
    .select(
      "*, work_packages(id, code, name_en, name_ar, tasks(id, code, name_en, name_ar, baseline_start, baseline_end, forecast_start, forecast_end, actual_start, actual_end, progress_percent, status))",
    )
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
  const result = await submitProgressCommand(
    db,
    {
      milestoneId: input.milestoneId,
      reportedProgress: input.reportedProgress,
      notes: input.notes,
      evidenceDescription: input.evidenceDescription,
    },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: result.entity_id as string };
}

export async function verifyProgress(db: SupabaseClient, input: ProgressVerificationInput) {
  const result = await verifyProgressCommand(
    db,
    { progressUpdateId: input.progressUpdateId, verifiedProgress: input.verifiedProgress },
    { idempotencyKey: input.idempotencyKey },
  );
  return { id: result.entity_id as string, milestone_id: result.milestone_id as string };
}

export async function acceptMilestone(db: SupabaseClient, milestoneId: string, approverId: string, idempotencyKey?: string) {
  const result = await acceptMilestoneCommand(db, milestoneId, { idempotencyKey });
  return { id: result.entity_id as string };
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
  idempotencyKey?: string,
) {
  const result = await scheduleApproveExtension(
    db,
    { requestId, approvedDays },
    { idempotencyKey },
  );
  return { id: result.entity_id as string, project_id: result.project_id as string };
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
