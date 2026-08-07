"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  appraisalAcknowledge,
  appraisalAssignmentCreate,
  appraisalCycleActivate,
  appraisalFinalize,
  appraisalManagerSubmit,
  appraisalSelfSubmit,
} from "@/lib/commands";
import {
  createAppraisalCycle,
  getAppraisalAssignment,
  getAssignmentRatings,
  listAllAssignments,
  listAppraisalCycles,
  listAppraisalTemplates,
  listMyAppraisals,
  listTeamAppraisals,
  listTemplateCriteria,
} from "@/data/repositories/appraisal-repository";
import { DataAccessError } from "@/data/repositories/budget-repository";

export async function fetchAppraisalCyclesAction() {
  return withActivePermission("appraisal", "read", async ({ legalEntityId, db }) =>
    listAppraisalCycles(db, legalEntityId),
  );
}

export async function fetchAppraisalTemplatesAction() {
  return withActivePermission("appraisal", "read", async ({ legalEntityId, db }) =>
    listAppraisalTemplates(db, legalEntityId),
  );
}

export async function fetchMyAppraisalsAction() {
  return withActivePermission("appraisal", "read", async ({ ctx, legalEntityId, db }) =>
    listMyAppraisals(db, legalEntityId, ctx.userId),
  );
}

export async function fetchTeamAppraisalsAction() {
  return withActivePermission("appraisal", "read", async ({ ctx, legalEntityId, db }) =>
    listTeamAppraisals(db, legalEntityId, ctx.userId),
  );
}

export async function fetchAllAssignmentsAction() {
  return withActivePermission("appraisal", "create", async ({ legalEntityId, db }) =>
    listAllAssignments(db, legalEntityId),
  );
}

export async function fetchAppraisalDetailAction(assignmentId: string) {
  return withActivePermission("appraisal", "read", async ({ db }) => {
    const assignment = await getAppraisalAssignment(db, assignmentId);
    const ratings = await getAssignmentRatings(db, assignment.id);
    const criteria = await listTemplateCriteria(db, assignment.template_id);
    return { assignment, ratings, criteria };
  });
}

export async function createAppraisalCycleAction(params: {
  nameEn: string;
  nameAr: string;
  periodStart: string;
  periodEnd: string;
  selfAssessmentDeadline?: string;
  managerDeadline?: string;
  reviewDeadline?: string;
}) {
  return withActivePermission("appraisal", "create", async ({ ctx, legalEntityId, db }) =>
    createAppraisalCycle(db, {
      legalEntityId,
      createdBy: ctx.userId,
      ...params,
    }),
  );
}

export async function activateAppraisalCycleAction(cycleId: string) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalCycleActivate(db, cycleId);
    const { data, error } = await db.from("appraisal_cycles").select("*").eq("id", cycleId).single();
    if (error || !data) throw new DataAccessError("Cycle not found.", "NOT_FOUND");
    return data;
  });
}

export async function createAppraisalAssignmentAction(params: {
  cycleId: string;
  templateId: string;
  employeeId: string;
  managerId: string;
  reviewerId?: string;
  organizationUnitId?: string;
}) {
  return withActivePermission("appraisal", "create", async ({ legalEntityId, db }) => {
    const result = await appraisalAssignmentCreate(db, { legalEntityId, ...params });
    return getAppraisalAssignment(db, result.entity_id as string);
  });
}

export async function selfSubmitAppraisalAction(params: {
  assignmentId: string;
  ratings: Array<{ criterion_id: string; self_rating?: number | string; self_comment?: string }>;
}) {
  return withActivePermission("appraisal", "update", async ({ db }) => {
    await appraisalSelfSubmit(db, params);
    return getAppraisalAssignment(db, params.assignmentId);
  });
}

export async function managerSubmitAppraisalAction(params: {
  assignmentId: string;
  ratings: Array<{ criterion_id: string; manager_rating?: number | string; manager_comment?: string }>;
}) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalManagerSubmit(db, params);
    return getAppraisalAssignment(db, params.assignmentId);
  });
}

export async function finalizeAppraisalAction(assignmentId: string) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalFinalize(db, assignmentId);
    return getAppraisalAssignment(db, assignmentId);
  });
}

export async function acknowledgeAppraisalAction(params: {
  assignmentId: string;
  comments?: string;
}) {
  return withActivePermission("appraisal", "update", async ({ db }) => {
    await appraisalAcknowledge(db, params);
    return getAppraisalAssignment(db, params.assignmentId);
  });
}
