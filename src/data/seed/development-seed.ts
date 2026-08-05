/**
 * Development seed data used when Supabase is not configured locally.
 * Mirrors the documented seed scenario for dashboards and acceptance tests.
 */
import { calculateEarnedValue, calculateCurrentApprovedBudget } from "@/domain/financial/calculations";

export const seedLegalEntity = {
  id: "le-modawat",
  code: "MODAWAT",
  nameEn: "Al Modawat Specialized Medical Company",
  nameAr: "شركة المداوات الطبية المتخصصة",
};

export const seedControlScopes = [
  {
    id: "cs-hospital-budget-2027",
    code: "HOSP-BUD-2027",
    nameEn: "2027 Main Hospital Operating Budget",
    nameAr: "ميزانية تشغيل المستشفى الرئيسي 2027",
    scopeType: "operational_budget",
  },
  {
    id: "cs-restaurant-budget-2027",
    code: "REST-BUD-2027",
    nameEn: "2027 Restaurant Operating Budget",
    nameAr: "ميزانية تشغيل المطاعم 2027",
    scopeType: "operational_budget",
  },
  {
    id: "cs-khamis-hospital",
    code: "PROJ-KM-HOSP",
    nameEn: "Khamis Mushait New Hospital Project",
    nameAr: "مشروع مستشفى خميس مشيط الجديد",
    scopeType: "project",
  },
];

export const seedExecutiveMetrics = {
  originalApprovedBudget: "125000000.00",
  currentApprovedBudget: calculateCurrentApprovedBudget({
    originalApproved: "125000000.00",
    increases: "8500000.00",
    reductions: "1200000.00",
  }).toFixed(2),
  actualCost: "48250000.00",
  committedCost: "18600000.00",
  forecastUncommitted: "9200000.00",
  estimateAtCompletion: "76050000.00",
  delayedMilestones: 7,
  projectsAtRisk: 3,
};

export const seedHospitalBudget = {
  mtdBudget: "4200000.00",
  mtdActual: "4587500.00",
  ytdBudget: "25200000.00",
  ytdActual: "26140000.00",
  fullYearForecast: "50500000.00",
  unmappedActuals: 12,
  departments: [
    { nameEn: "Pharmacy", nameAr: "الصيدلية", budget: "8500000", actual: "9120000" },
    { nameEn: "Medical Operations", nameAr: "العمليات الطبية", budget: "12000000", actual: "11850000" },
    { nameEn: "Utilities", nameAr: "المرافق", budget: "3200000", actual: "3450000" },
  ],
};

export const seedRestaurantBudget = {
  branches: [
    {
      nameEn: "Restaurant Branch 1",
      nameAr: "فرع المطعم 1",
      revenueBudget: "2400000",
      revenueActual: "2285000",
      foodCostPercent: 32.4,
      laborCostPercent: 28.1,
    },
    {
      nameEn: "Restaurant Branch 2",
      nameAr: "فرع المطعم 2",
      revenueBudget: "2100000",
      revenueActual: "2198000",
      foodCostPercent: 35.8,
      laborCostPercent: 27.5,
    },
  ],
  foodCostThreshold: 34,
  laborCostThreshold: 30,
};

export const seedProject = {
  id: "proj-khamis-hospital",
  code: "KM-HOSP-BLD",
  nameEn: "Khamis Mushait New Hospital Building",
  nameAr: "مبنى مستشفى خميس مشيط الجديد",
  phases: [
    "Design",
    "Procurement",
    "Structural Works",
    "MEP",
    "Testing & Commissioning",
    "Handover",
  ],
  budgetAtCompletion: "85000000.00",
  plannedValue: "38250000.00",
  earnedValue: "29750000.00",
  actualCost: "34100000.00",
};

export const seedProjectEv = calculateEarnedValue({
  budgetAtCompletion: seedProject.budgetAtCompletion,
  plannedValue: seedProject.plannedValue,
  earnedValue: seedProject.earnedValue,
  actualCost: seedProject.actualCost,
});

export const seedMilestones = [
  {
    code: "MS-FOUNDATION",
    nameEn: "Foundation Completed and Approved",
    nameAr: "اكتمال واعتماد الأساسات",
    status: "completed",
    delayDays: 0,
  },
  {
    code: "MS-STRUCTURAL",
    nameEn: "Structural Frame Topped Out",
    nameAr: "اكتمال الهيكل الإنشائي",
    status: "delayed",
    delayDays: 14,
  },
  {
    code: "MS-MEP",
    nameEn: "MEP Rough-In Complete",
    nameAr: "اكتمال التمديدات MEP",
    status: "at_risk",
    delayDays: 5,
  },
];

export const seedEmployeePerformance = [
  {
    nameEn: "Construction Project Team",
    nameAr: "فريق مشروع الإنشاء",
    onTimePercent: 72,
    accountableDelay: 7,
    cpi: 0.87,
    spi: 0.78,
  },
  {
    nameEn: "Engineering Department",
    nameAr: "قسم الهندسة",
    onTimePercent: 85,
    accountableDelay: 3,
    cpi: 0.94,
    spi: 0.91,
  },
];
