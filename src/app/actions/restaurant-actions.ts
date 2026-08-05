"use server";

import { isAuthError } from "@/lib/auth/errors";
import {
  assertLegalEntityAccess,
  getAuthenticatedDb,
  requirePermission,
} from "@/lib/auth/context";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { getRestaurantBranchPerformance } from "@/data/repositories/restaurant-repository";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";

function mapActionError(error: unknown): never {
  if (isAuthError(error)) {
    throw new DataAccessError(error.message, "FORBIDDEN");
  }
  throw error;
}

export async function fetchRestaurantPerformanceAction() {
  try {
    const { ctx, db } = await getAuthenticatedDb();
    assertLegalEntityAccess(ctx, LEGAL_ENTITY_MODAWAT);
    requirePermission(ctx, "report", "read", LEGAL_ENTITY_MODAWAT);
    return getRestaurantBranchPerformance(db);
  } catch (error) {
    mapActionError(error);
  }
}
