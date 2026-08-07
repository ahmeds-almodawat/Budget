"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { AuthError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/context";
import { withActivePermission } from "@/lib/auth/action-guard";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  ensureKhamisProjectStructure,
  getProjectDashboard,
} from "@/data/repositories/project-repository";
import {
  acceptMilestone,
  approveScheduleExtension,
  getMilestoneDetail,
  getMilestones,
  getPendingProgressUpdates,
  getProjectTasks,
  getProjectTimeline,
  requestScheduleExtension,
  submitProgress,
  verifyProgress,
} from "@/data/repositories/project-schedule-repository";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";
import type { AuthorizationScope } from "@/domain/auth/permissions";

async function resolveProjectScope(
  db: SupabaseClient,
  projectScopeId: string,
  userId: string,
) {
  if (projectScopeId === CONTROL_SCOPE_KM_HOSPITAL) {
    return ensureKhamisProjectStructure(db, userId);
  }
  const { data } = await db
    .from("projects")
    .select("id")
    .eq("control_scope_id", projectScopeId)
    .maybeSingle();
  return data?.id ?? null;
}

function projectAuthorizationScope(legalEntityId: string, projectId: string): AuthorizationScope {
  return { legalEntityId, scopeType: "project", scopeId: projectId };
}

async function resolveMilestoneProjectId(db: SupabaseClient, milestoneId: string) {
  const { data } = await db.from("milestones").select("project_id").eq("id", milestoneId).maybeSingle();
  return data?.project_id ?? null;
}

export async function fetchProjectDashboardAction(projectScopeId: string) {
  return withActivePermission("project", "read", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveProjectScope(db, projectScopeId, ctx.userId);
    if (!projectId) return null;
    requirePermission(ctx, "project", "read", projectAuthorizationScope(legalEntityId, projectId));
    return getProjectDashboard(db, projectId);
  });
}

export async function fetchProjectTimelineAction(projectScopeId: string) {
  return withActivePermission("project", "read", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveProjectScope(db, projectScopeId, ctx.userId);
    if (!projectId) return null;
    requirePermission(ctx, "project", "read", projectAuthorizationScope(legalEntityId, projectId));
    return getProjectTimeline(db, projectId);
  });
}

export async function fetchProjectTasksAction(projectScopeId: string) {
  return withActivePermission("project", "read", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveProjectScope(db, projectScopeId, ctx.userId);
    if (!projectId) return [];
    requirePermission(ctx, "task", "read", projectAuthorizationScope(legalEntityId, projectId));
    return getProjectTasks(db, projectId);
  });
}

export async function fetchMilestonesAction(projectScopeId?: string) {
  return withActivePermission("milestone", "read", async ({ ctx, legalEntityId, db }) => {
    let projectId: string | undefined;
    if (projectScopeId) {
      const resolved = await resolveProjectScope(db, projectScopeId, ctx.userId);
      projectId = resolved ?? undefined;
      if (projectId) {
        requirePermission(ctx, "milestone", "read", projectAuthorizationScope(legalEntityId, projectId));
      }
    }
    return getMilestones(db, projectId);
  });
}

export async function fetchMilestoneDetailAction(milestoneId: string) {
  return withActivePermission("milestone", "read", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveMilestoneProjectId(db, milestoneId);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "read", projectAuthorizationScope(legalEntityId, projectId));
    return getMilestoneDetail(db, milestoneId);
  });
}

export async function submitProgressAction(input: {
  milestoneId: string;
  reportedProgress: number;
  notes?: string;
  evidenceDescription?: string;
}) {
  return withActivePermission("milestone", "update", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveMilestoneProjectId(db, input.milestoneId);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "update", projectAuthorizationScope(legalEntityId, projectId));

    return submitProgress(db, {
      ...input,
      reportedBy: ctx.userId,
    });
  });
}

export async function verifyProgressAction(input: {
  progressUpdateId: string;
  verifiedProgress: number;
}) {
  return withActivePermission("milestone", "approve", async ({ ctx, legalEntityId, db }) => {
    const { data: update } = await db
      .from("milestone_progress_updates")
      .select("reported_by, milestone_id")
      .eq("id", input.progressUpdateId)
      .single();

    if (!update) throw new DataAccessError("Progress update not found.", "NOT_FOUND");
    const projectId = await resolveMilestoneProjectId(db, update.milestone_id);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "approve", projectAuthorizationScope(legalEntityId, projectId));

    if (update.reported_by === ctx.userId) {
      throw new AuthError("Reporter cannot verify own progress.", "FORBIDDEN");
    }

    return verifyProgress(db, {
      progressUpdateId: input.progressUpdateId,
      verifiedProgress: input.verifiedProgress,
      verifiedBy: ctx.userId,
    });
  });
}

export async function acceptMilestoneAction(milestoneId: string) {
  return withActivePermission("milestone", "approve", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveMilestoneProjectId(db, milestoneId);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "approve", projectAuthorizationScope(legalEntityId, projectId));
    return acceptMilestone(db, milestoneId, ctx.userId);
  });
}

export async function requestScheduleExtensionAction(input: {
  projectScopeId: string;
  requestedDays: number;
  grossDelayDays: number;
  excusableDelayDays: number;
  reason: string;
  delayReasonClass?: string;
}) {
  return withActivePermission("project", "update", async ({ ctx, legalEntityId, db }) => {
    const projectId = await resolveProjectScope(db, input.projectScopeId, ctx.userId);
    if (!projectId) throw new DataAccessError("Project not found.", "NOT_FOUND");
    requirePermission(ctx, "project", "update", projectAuthorizationScope(legalEntityId, projectId));

    return requestScheduleExtension(db, {
      projectId,
      requestedDays: input.requestedDays,
      grossDelayDays: input.grossDelayDays,
      excusableDelayDays: input.excusableDelayDays,
      reason: input.reason,
      delayReasonClass: input.delayReasonClass,
      requesterId: ctx.userId,
    });
  });
}

export async function approveScheduleExtensionAction(requestId: string, approvedDays: number) {
  return withActivePermission("project", "approve", async ({ ctx, legalEntityId, db }) => {
    const { data: request } = await db
      .from("schedule_change_requests")
      .select("project_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!request) throw new DataAccessError("Schedule request not found.", "NOT_FOUND");
    requirePermission(ctx, "project", "approve", projectAuthorizationScope(legalEntityId, request.project_id));
    return approveScheduleExtension(db, requestId, ctx.userId, approvedDays);
  });
}

export async function fetchPendingProgressUpdatesAction() {
  return withActivePermission("milestone", "approve", async ({ db }) => getPendingProgressUpdates(db));
}
