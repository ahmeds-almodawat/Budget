"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  appraisalAcknowledge,
  appraisalAssignmentCreate,
  appraisalCycleCreate,
  appraisalCycleActivate,
  appraisalFinalize,
  appraisalGoalCreate,
  appraisalGoalEmployeeUpdate,
  appraisalGoalManagerUpdate,
  appraisalManagerSubmit,
  appraisalReviewerSubmit,
  appraisalSelfSubmit,
  appraisalTemplateAddCriterion,
  appraisalTemplateApprove,
  appraisalTemplateCreate,
  appraisalTemplateRetire,
  appraisalTemplateSubmit,
} from "@/lib/commands";
import {
  getAppraisalAssignment,
  getAssignmentGoals,
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
    const goals = await getAssignmentGoals(db, assignment.id);
    return { assignment, ratings, criteria, goals };
  });
}

async function reloadTemplate(db: Parameters<typeof listAppraisalTemplates>[0], templateId: string) {
  const { data, error } = await db.from("appraisal_templates").select("*").eq("id", templateId).single();
  if (error || !data) throw new DataAccessError("Template not found.", "NOT_FOUND");
  return data;
}

export async function createAppraisalTemplateAction(params: {
  code: string;
  nameEn: string;
  nameAr: string;
  instructionsEn?: string;
  instructionsAr?: string;
  ratingScaleMax?: number;
}) {
  return withActivePermission("appraisal", "create", async ({ legalEntityId, db }) => {
    const result = await appraisalTemplateCreate(db, { legalEntityId, ...params });
    return reloadTemplate(db, result.entity_id as string);
  });
}

export async function addAppraisalCriterionAction(params: {
  templateId: string;
  sequenceNo: number;
  category: string;
  nameEn: string;
  nameAr: string;
  weight: string;
  maxScale: number;
}) {
  return withActivePermission("appraisal", "update", async ({ db }) => {
    await appraisalTemplateAddCriterion(db, params);
    return listTemplateCriteria(db, params.templateId);
  });
}

export async function submitAppraisalTemplateAction(templateId: string) {
  return withActivePermission("appraisal", "update", async ({ db }) => {
    await appraisalTemplateSubmit(db, templateId);
    return reloadTemplate(db, templateId);
  });
}

export async function approveAppraisalTemplateAction(templateId: string) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalTemplateApprove(db, templateId);
    return reloadTemplate(db, templateId);
  });
}

export async function retireAppraisalTemplateAction(params: { templateId: string; reason: string }) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalTemplateRetire(db, params);
    return reloadTemplate(db, params.templateId);
  });
}

export async function createAppraisalGoalAction(params: {
  assignmentId: string;
  description: string;
  targetText?: string;
  measureUnit?: string;
  weight: string;
}) {
  return withActivePermission("appraisal", "create", async ({ db }) => {
    await appraisalGoalCreate(db, params);
    return getAssignmentGoals(db, params.assignmentId);
  });
}

export async function updateEmployeeGoalAction(params: { goalId: string; assignmentId: string; employeeComment: string }) {
  return withActivePermission("appraisal", "update", async ({ db }) => {
    await appraisalGoalEmployeeUpdate(db, params);
    return getAssignmentGoals(db, params.assignmentId);
  });
}

export async function updateManagerGoalAction(params: {
  goalId: string;
  assignmentId: string;
  managerRating: string;
  managerComment?: string;
}) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalGoalManagerUpdate(db, params);
    return getAssignmentGoals(db, params.assignmentId);
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
  return withActivePermission("appraisal", "create", async ({ legalEntityId, db }) => {
    const result = await appraisalCycleCreate(db, {
      legalEntityId,
      ...params,
    });
    const { data, error } = await db
      .from("appraisal_cycles")
      .select("*")
      .eq("id", result.entity_id as string)
      .single();
    if (error || !data) throw new DataAccessError("Cycle not found.", "NOT_FOUND");
    return data;
  });
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

export async function reviewerSubmitAppraisalAction(params: {
  assignmentId: string;
  ratings: Array<{ criterion_id: string; calibrated_rating?: number | string }>;
}) {
  return withActivePermission("appraisal", "approve", async ({ db }) => {
    await appraisalReviewerSubmit(db, params);
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
