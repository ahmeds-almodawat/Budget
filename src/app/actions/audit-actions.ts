"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import {
  getOpenExceptions,
  searchAuditEvents,
  type AuditSearchFilters,
} from "@/data/repositories/audit-repository";

export async function fetchAuditEventsAction(filters: AuditSearchFilters = {}) {
  return withActivePermission("audit", "read", async ({ legalEntityId, db }) =>
    searchAuditEvents(db, legalEntityId, filters),
  );
}

export async function fetchExceptionsAction() {
  return withActivePermission("audit", "read", async ({ legalEntityId, db }) =>
    getOpenExceptions(db, legalEntityId),
  );
}
