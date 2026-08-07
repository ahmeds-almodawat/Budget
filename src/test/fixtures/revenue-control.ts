import { ORG_UNIT_REST_B1 } from "@/types/database";

/** March period number in FY2027 seed data. */
export const FISCAL_PERIOD_MAR_NUMBER = 3;

export const PAYER_GOV_GENERIC = "88888888-8888-8888-8888-888888888801";
export const PAYER_INS_GENERIC = "88888888-8888-8888-8888-888888888802";
export const SL_DINE_IN = "99999999-9999-9999-9999-999999999904";
export const ORG_UNIT_REST_B2 = "33333333-3333-3333-3333-333333333307";

/** Seeded restaurant March actuals after local_personas revenue fixture updates. */
export const REVENUE_FIXTURE = {
  organizationUnitRestB1: ORG_UNIT_REST_B1,
  organizationUnitRestB2: ORG_UNIT_REST_B2,
  fiscalPeriodMarNumber: FISCAL_PERIOD_MAR_NUMBER,
  payerGov: PAYER_GOV_GENERIC,
  payerInsurance: PAYER_INS_GENERIC,
  serviceLineDineIn: SL_DINE_IN,
  restB1ExternalNetMar: 85_000,
  restB2ExternalNetMar: 72_000,
  internalRevenueMar: 5_000,
} as const;
