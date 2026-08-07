export const LEGAL_ENTITY_MODAWAT = "11111111-1111-1111-1111-111111111102";
export const CONTROL_SCOPE_HOSPITAL_BUDGET_2027 = "55555555-5555-5555-5555-555555555501";
export const CONTROL_SCOPE_REST_BUDGET_2027 = "55555555-5555-5555-5555-555555555502";
export const CONTROL_SCOPE_KM_HOSPITAL = "55555555-5555-5555-5555-555555555503";
export const FISCAL_YEAR_2027 = "77777777-7777-7777-7777-777777777701";
export const ORG_UNIT_PHARMACY = "33333333-3333-3333-3333-333333333305";
export const ORG_UNIT_HOSPITAL_MUH = "33333333-3333-3333-3333-333333333303";
export const ORG_UNIT_REST_B1 = "33333333-3333-3333-3333-333333333304";
export const COST_NODE_INJECTABLE = "66666666-6666-6666-6666-666666666603";
export const COST_NODE_REVENUE = "66666666-6666-6666-6666-666666666610";
export const CONTROL_ACCOUNT_PHARM_INJ = "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1";

export type RevenueBudgetBasis = "net_only" | "component_based";

export type ApprovalStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "locked"
  | "posted"
  | "superseded"
  | "cancelled";

export interface ReportFilters {
  legalEntityId?: string;
  controlScopeId?: string;
  organizationUnitId?: string;
  costNodeId?: string;
  fiscalYearId?: string;
  fiscalPeriodId?: string;
  projectId?: string;
  reportDate?: string;
}

export interface BudgetLineInput {
  organizationUnitId: string;
  costNodeId: string;
  controlAccountId?: string;
  plannedQuantity?: string;
  unitOfMeasure?: string;
  plannedUnitRate?: string;
  plannedAmount: string;
  monthlyAmounts: string[];
  assumption?: string;
  notes?: string;
  revenueBudgetBasis?: RevenueBudgetBasis;
  payerId?: string;
  serviceLineId?: string;
  revenueComponentTypeId?: string;
}

export interface ImportRowInput {
  sourceTransactionId: string;
  journalNumber?: string;
  invoiceNumber?: string;
  transactionDate: string;
  amountExVat: string;
  vatAmount?: string;
  description?: string;
  organizationUnitId?: string;
  costNodeId?: string;
  fiscalPeriodNumber?: number;
}
