import { setRequestLocale } from "next-intl/server";

const moduleDescriptions: Record<string, { en: string; ar: string }> = {
  budgets: {
    en: "Operational and project budget versions with monthly allocations and driver-based lines.",
    ar: "إصدارات الميزانيات التشغيلية والمشاريع مع التوزيع الشهري وأسطر المحركات.",
  },
  milestones: {
    en: "Milestone baselines, forecasts, progress verification, and evidence.",
    ar: "خطوط أساس المعالم والتوقعات والتحقق من التقدم والأدلة.",
  },
  tasks: {
    en: "Work breakdown tasks with dependencies and responsible teams.",
    ar: "مهام هيكل العمل مع التبعيات والفرق المسؤولة.",
  },
  "cost-control": {
    en: "Control accounts linking scope, organization, and cost classification.",
    ar: "حسابات التحكم التي تربط النطاق والمنظمة وتصنيف التكلفة.",
  },
  commitments: {
    en: "Purchase commitments, contracts, and open commitment tracking.",
    ar: "التزامات الشراء والعقود وتتبع الالتزامات المفتوحة.",
  },
  actuals: {
    en: "Imported actual transactions, allocations, and unmapped queue.",
    ar: "المعاملات الفعلية المستوردة والتوزيعات وقائمة غير المربوطة.",
  },
  forecasts: {
    en: "Forecast versions, scenarios, and EAC projections.",
    ar: "إصدارات التوقعات والسيناريوهات وتوقعات EAC.",
  },
  changes: {
    en: "Budget and schedule change requests with immutable history.",
    ar: "طلبات تغيير الميزانية والجدول مع سجل غير قابل للتعديل.",
  },
  risks: {
    en: "Risk, issue, action, dependency, and decision registers.",
    ar: "سجلات المخاطر والقضايا والإجراءات والتبعيات والقرارات.",
  },
  reports: {
    en: "Multi-dimensional reports with drill-down and export.",
    ar: "تقارير متعددة الأبعاد مع التفصيل والتصدير.",
  },
  approvals: {
    en: "Pending approval requests across budgets, milestones, and imports.",
    ar: "طلبات الاعتماد المعلقة للميزانيات والمعالم والاستيراد.",
  },
  imports: {
    en: "CSV/Excel import batches with validation and reconciliation.",
    ar: "دفعات الاستيراد مع التحقق والمطابقة.",
  },
  "master-data": {
    en: "Governed master data for organization, cost, and reference entities.",
    ar: "البيانات الرئيسية المحكومة للمنظمة والتكلفة والمراجع.",
  },
  administration: {
    en: "Users, roles, permissions, and system configuration.",
    ar: "المستخدمون والأدوار والصلاحيات وإعدادات النظام.",
  },
  audit: {
    en: "Append-only audit trail for sensitive changes.",
    ar: "سجل تدقيق تراكمي للتغييرات الحساسة.",
  },
};

export type ModuleKey = keyof typeof moduleDescriptions;

export default async function ModulePlaceholderPage({
  params,
  moduleKey,
}: {
  params: Promise<{ locale: string }>;
  moduleKey: ModuleKey;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const desc = moduleDescriptions[moduleKey];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold capitalize">{moduleKey.replace("-", " ")}</h1>
      <p className="text-slate-600">{locale === "ar" ? desc.ar : desc.en}</p>
      <p className="text-sm text-slate-500">
        {locale === "ar"
          ? "وحدة قيد التطوير — البيانات المعروضة في لوحات المعلومات مستمدة من بيانات التطوير."
          : "Module scaffold — dashboard views use development seed data until Supabase is connected."}
      </p>
    </div>
  );
}
