"use server";

import { withActivePermission } from "@/lib/auth/action-guard";
import { getRestaurantBranchPerformance } from "@/data/repositories/restaurant-repository";

export async function fetchRestaurantPerformanceAction() {
  return withActivePermission("report", "read", async ({ db }) => getRestaurantBranchPerformance(db));
}
