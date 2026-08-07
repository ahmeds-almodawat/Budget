import type { SupabaseClient } from "@supabase/supabase-js";
import { DataAccessError } from "@/data/repositories/budget-repository";
import { safeDivide } from "@/lib/money";

export interface BranchPerformance {
  branch_id: string;
  branch_code: string;
  name_en: string;
  name_ar: string;
  food_cost: number;
  labor_cost: number;
  revenue: number;
  cover_transactions: number;
  foodCostPercent: number | null;
  laborCostPercent: number | null;
}

export async function getRestaurantBranchPerformance(db: SupabaseClient) {
  const { data, error } = await db.from("v_restaurant_branch_performance").select("*");
  if (error) throw new DataAccessError(error.message, "DATABASE");

  return (data ?? []).map((row) => {
    const revenue = Number(row.revenue);
    const foodCost = Number(row.food_cost);
    const laborCost = Number(row.labor_cost);
    return {
      ...row,
      food_cost: foodCost,
      labor_cost: laborCost,
      revenue,
      cover_transactions: Number(row.cover_transactions),
      foodCostPercent: revenue > 0 ? safeDivide(foodCost, revenue)?.times(100).toNumber() ?? null : null,
      laborCostPercent: revenue > 0 ? safeDivide(laborCost, revenue)?.times(100).toNumber() ?? null : null,
    } as BranchPerformance;
  });
}
