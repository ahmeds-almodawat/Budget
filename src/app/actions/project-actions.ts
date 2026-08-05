"use server";

import { AuthError, isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
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
import { CONTROL_SCOPE_KM_HOSPITAL, LEGAL_ENTITY_MODAWAT } from "@/types/database";
import type { AuthorizationScope } from "@/domain/auth/permissions";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

async function resolveProjectId(db: Awaited<ReturnType<typeof getAuthenticatedDb>>["db"], projectScopeId: string, userId: string) {
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

function projectAuthorizationScope(projectId: string): AuthorizationScope {
  return { legalEntityId: LEGAL_ENTITY_MODAWAT, scopeType: "project", scopeId: projectId };
}

async function resolveMilestoneProjectId(
  db: Awaited<ReturnType<typeof getAuthenticatedDb>>["db"],
  milestoneId: string,
) {
  const { data } = await db.from("milestones").select("project_id").eq("id", milestoneId).maybeSingle();
  return data?.project_id ?? null;
}

export async function fetchProjectDashboardAction(projectScopeId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveProjectId(db, projectScopeId, ctx.userId);
    if (!projectId) return null;
    requirePermission(ctx, "project", "read", projectAuthorizationScope(projectId));
    return getProjectDashboard(db, projectId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchProjectTimelineAction(projectScopeId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveProjectId(db, projectScopeId, ctx.userId);
    if (!projectId) return null;
    requirePermission(ctx, "project", "read", projectAuthorizationScope(projectId));
    return getProjectTimeline(db, projectId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchProjectTasksAction(projectScopeId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveProjectId(db, projectScopeId, ctx.userId);
    if (!projectId) return [];
    requirePermission(ctx, "task", "read", projectAuthorizationScope(projectId));
    return getProjectTasks(db, projectId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchMilestonesAction(projectScopeId?: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    let projectId: string | undefined;
    if (projectScopeId) {
      const resolved = await resolveProjectId(db, projectScopeId, ctx.userId);
      projectId = resolved ?? undefined;
      if (projectId) {
        requirePermission(ctx, "milestone", "read", projectAuthorizationScope(projectId));
      }
    } else {
      requirePermission(ctx, "milestone", "read", LEGAL_ENTITY_MODAWAT);
    }
    return getMilestones(db, projectId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchMilestoneDetailAction(milestoneId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveMilestoneProjectId(db, milestoneId);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "read", projectAuthorizationScope(projectId));
    return getMilestoneDetail(db, milestoneId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function submitProgressAction(input: {
  milestoneId: string;
  reportedProgress: number;
  notes?: string;
  evidenceDescription?: string;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveMilestoneProjectId(db, input.milestoneId);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "update", projectAuthorizationScope(projectId));

    return submitProgress(db, {
      ...input,
      reportedBy: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function verifyProgressAction(input: {
  progressUpdateId: string;
  verifiedProgress: number;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const { data: update } = await db
      .from("milestone_progress_updates")
      .select("reported_by, milestone_id")
      .eq("id", input.progressUpdateId)
      .single();

    if (!update) throw new DataAccessError("Progress update not found.", "NOT_FOUND");
    const projectId = await resolveMilestoneProjectId(db, update.milestone_id);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "approve", projectAuthorizationScope(projectId));

    if (update?.reported_by === ctx.userId) {
      throw new AuthError("Reporter cannot verify own progress.", "FORBIDDEN");
    }

    return verifyProgress(db, {
      progressUpdateId: input.progressUpdateId,
      verifiedProgress: input.verifiedProgress,
      verifiedBy: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function acceptMilestoneAction(milestoneId: string) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveMilestoneProjectId(db, milestoneId);
    if (!projectId) throw new DataAccessError("Milestone not found.", "NOT_FOUND");
    requirePermission(ctx, "milestone", "approve", projectAuthorizationScope(projectId));
    return acceptMilestone(db, milestoneId, ctx.userId);
  } catch (error) {
    mapActionError(error);
  }
}

export async function requestScheduleExtensionAction(input: {
  projectScopeId: string;
  requestedDays: number;
  grossDelayDays: number;
  excusableDelayDays: number;
  reason: string;
  delayReasonClass?: string;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const projectId = await resolveProjectId(db, input.projectScopeId, ctx.userId);
    if (!projectId) throw new DataAccessError("Project not found.", "NOT_FOUND");
    requirePermission(ctx, "project", "update", projectAuthorizationScope(projectId));

    return requestScheduleExtension(db, {
      projectId,
      requestedDays: input.requestedDays,
      grossDelayDays: input.grossDelayDays,
      excusableDelayDays: input.excusableDelayDays,
      reason: input.reason,
      delayReasonClass: input.delayReasonClass,
      requesterId: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}

export async function approveScheduleExtensionAction(requestId: string, approvedDays: number) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    const { data: request } = await db
      .from("schedule_change_requests")
      .select("project_id")
      .eq("id", requestId)
      .maybeSingle();
    if (!request) throw new DataAccessError("Schedule request not found.", "NOT_FOUND");
    requirePermission(ctx, "project", "approve", projectAuthorizationScope(request.project_id));
    return approveScheduleExtension(db, requestId, ctx.userId, approvedDays);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchPendingProgressUpdatesAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "milestone", "approve", LEGAL_ENTITY_MODAWAT);
    return getPendingProgressUpdates(db);
  } catch (error) {
    mapActionError(error);
  }
}
