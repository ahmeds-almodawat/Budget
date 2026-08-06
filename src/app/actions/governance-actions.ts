"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  createRisk,
  getDecisions,
  getIssues,
  getRegisterActions,
  getRegisterDependencies,
  getRisks,
} from "@/data/repositories/governance-repository";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";

export async function fetchRisksAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getRisks(db, legalEntityId),
  );
}

export async function fetchIssuesAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getIssues(db, legalEntityId),
  );
}

export async function fetchRegisterActionsAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getRegisterActions(db, legalEntityId),
  );
}

export async function fetchDecisionsAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getDecisions(db, legalEntityId),
  );
}

export async function fetchRegisterDependenciesAction() {
  return withActivePermission("project", "read", async ({ legalEntityId, db }) =>
    getRegisterDependencies(db, legalEntityId),
  );
}

export async function createRiskAction(input: {
  titleEn: string;
  titleAr: string;
  probabilityPercent: number;
  financialImpact: string;
  mitigationPlan?: string;
}) {
  return withActivePermission("project", "update", async ({ ctx, legalEntityId, db }) =>
    createRisk(db, {
      legalEntityId,
      controlScopeId: CONTROL_SCOPE_KM_HOSPITAL,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      probabilityPercent: input.probabilityPercent,
      financialImpact: input.financialImpact,
      mitigationPlan: input.mitigationPlan,
      ownerId: ctx.userId,
    }),
  );
}
