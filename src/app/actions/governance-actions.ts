"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import {
  createRisk,
  getDecisions,
  getIssues,
  getRegisterActions,
  getRegisterDependencies,
  getRisks,
} from "@/data/repositories/governance-repository";
import { CONTROL_SCOPE_KM_HOSPITAL, LEGAL_ENTITY_MODAWAT } from "@/types/database";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

export async function fetchRisksAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "read", LEGAL_ENTITY_MODAWAT);
    return getRisks(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchIssuesAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "read", LEGAL_ENTITY_MODAWAT);
    return getIssues(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchRegisterActionsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "read", LEGAL_ENTITY_MODAWAT);
    return getRegisterActions(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchDecisionsAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "read", LEGAL_ENTITY_MODAWAT);
    return getDecisions(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function fetchRegisterDependenciesAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "read", LEGAL_ENTITY_MODAWAT);
    return getRegisterDependencies(db, LEGAL_ENTITY_MODAWAT);
  } catch (error) {
    mapActionError(error);
  }
}

export async function createRiskAction(input: {
  titleEn: string;
  titleAr: string;
  probabilityPercent: number;
  financialImpact: string;
  mitigationPlan?: string;
}) {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "project", "update", LEGAL_ENTITY_MODAWAT);
    return createRisk(db, {
      legalEntityId: LEGAL_ENTITY_MODAWAT,
      controlScopeId: CONTROL_SCOPE_KM_HOSPITAL,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      probabilityPercent: input.probabilityPercent,
      financialImpact: input.financialImpact,
      mitigationPlan: input.mitigationPlan,
      ownerId: ctx.userId,
    });
  } catch (error) {
    mapActionError(error);
  }
}
