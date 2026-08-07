import { Decimal, money, type MoneyInput } from "@/lib/money";

export interface AppraisalCriterionWeight {
  criterionId: string;
  weight: MoneyInput;
  maxScale: MoneyInput;
}

export interface AppraisalRatingInput {
  criterionId: string;
  /** Prefer calibrated, then manager rating (matches DB compute). */
  calibratedRating?: MoneyInput | null;
  managerRating?: MoneyInput | null;
}

export function assertCriteriaWeightsSumTo100(
  criteria: AppraisalCriterionWeight[],
): { valid: boolean; total: Decimal } {
  const total = criteria.reduce((acc, c) => acc.plus(money(c.weight)), money(0));
  return {
    valid: total.equals(100),
    total,
  };
}

/**
 * Weighted score = Σ (rating / max_scale) * weight, rounded to 4 dp.
 * Uses calibrated_rating, then manager_rating (same precedence as DB).
 */
export function calculateWeightedAppraisalScore(
  criteria: AppraisalCriterionWeight[],
  ratings: AppraisalRatingInput[],
): Decimal {
  const weightCheck = assertCriteriaWeightsSumTo100(criteria);
  if (!weightCheck.valid) {
    throw new Error(
      `Appraisal criteria weights must sum to 100 (found ${weightCheck.total.toFixed(4)})`,
    );
  }

  const byId = new Map(ratings.map((r) => [r.criterionId, r]));
  let score = money(0);

  for (const criterion of criteria) {
    const rating = byId.get(criterion.criterionId);
    const raw =
      rating?.calibratedRating != null && rating.calibratedRating !== ""
        ? money(rating.calibratedRating)
        : rating?.managerRating != null && rating.managerRating !== ""
          ? money(rating.managerRating)
          : money(0);
    const maxScale = money(criterion.maxScale);
    if (maxScale.isZero()) continue;
    score = score.plus(raw.div(maxScale).times(money(criterion.weight)));
  }

  return score.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}
