import { setRequestLocale } from "next-intl/server";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

const moduleDescriptions: Record<string, { en: string; ar: string; titleEn: string; titleAr: string }> = {
  budgets: {
    titleEn: "Operational Budgets",
    titleAr: "الميزانيات التشغيلية",
    en: "Operational and project budget versions with monthly allocations and driver-based lines.",
    ar: "إصدارات الميزانيات التشغيلية والمشاريع مع التوزيع الشهري وأسطر المحركات.",
  },
  milestones: {
    titleEn: "Milestones",
    titleAr: "المعالم",
    en: "Milestone baselines, forecasts, progress verification, and evidence.",
    ar: "خطوط أساس المعالم والتوقعات والتحقق من التقدم والأدلة.",
  },
  tasks: {
    titleEn: "Tasks",
    titleAr: "المهام",
    en: "Work breakdown tasks with dependencies and responsible teams.",
    ar: "مهام هيكل العمل مع التبعيات والفرق المسؤولة.",
  },
  "cost-control": {
    titleEn: "Cost Control",
    titleAr: "ضبط التكاليف",
    en: "Control accounts linking scope, organization, and cost classification.",
    ar: "حسابات التحكم التي تربط النطاق والمنظمة وتصنيف التكلفة.",
  },
  commitments: {
    titleEn: "Commitments",
    titleAr: "الالتزامات",
    en: "Purchase commitments, contracts, and open commitment tracking.",
    ar: "التزامات الشراء والعقود وتتبع الالتزامات المفتوحة.",
  },
  actuals: {
    titleEn: "Actual Costs",
    titleAr: "التكاليف الفعلية",
    en: "Imported actual transactions, allocations, and unmapped queue.",
    ar: "المعاملات الفعلية المستوردة والتوزيعات وقائمة غير المربوطة.",
  },
  forecasts: {
    titleEn: "Forecasts",
    titleAr: "التوقعات",
    en: "Forecast versions, scenarios, and EAC projections.",
    ar: "إصدارات التوقعات والسيناريوهات وتوقعات EAC.",
  },
  changes: {
    titleEn: "Changes",
    titleAr: "التغييرات",
    en: "Budget and schedule change requests with immutable history.",
    ar: "طلبات تغيير الميزانية والجدول مع سجل غير قابل للتعديل.",
  },
  risks: {
    titleEn: "Risks & Issues",
    titleAr: "المخاطر والقضايا",
    en: "Risk, issue, action, dependency, and decision registers.",
    ar: "سجلات المخاطر والقضايا والإجراءات والتبعيات والقرارات.",
  },
  reports: {
    titleEn: "Reports",
    titleAr: "التقارير",
    en: "Multi-dimensional reports with drill-down and export.",
    ar: "تقارير متعددة الأبعاد مع التفصيل والتصدير.",
  },
  approvals: {
    titleEn: "Approvals",
    titleAr: "الاعتمادات",
    en: "Pending approval requests across budgets, milestones, and imports.",
    ar: "طلبات الاعتماد المعلقة للميزانيات والمعالم والاستيراد.",
  },
  imports: {
    titleEn: "Imports",
    titleAr: "الاستيراد",
    en: "CSV/Excel import batches with validation and reconciliation.",
    ar: "دفعات الاستيراد مع التحقق والمطابقة.",
  },
  "master-data": {
    titleEn: "Master Data",
    titleAr: "البيانات الرئيسية",
    en: "Governed master data for organization, cost, and reference entities.",
    ar: "البيانات الرئيسية المحكومة للمنظمة والتكلفة والمراجع.",
  },
  administration: {
    titleEn: "Administration",
    titleAr: "الإدارة",
    en: "Users, roles, permissions, and system configuration.",
    ar: "المستخدمون والأدوار والصلاحيات وإعدادات النظام.",
  },
  audit: {
    titleEn: "Audit Log",
    titleAr: "سجل التدقيق",
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
  const isAr = locale === "ar";

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAr ? desc.titleAr : desc.titleEn}
        description={isAr ? desc.ar : desc.en}
        actions={<Badge variant="accent">{isAr ? "قيد التطوير" : "In development"}</Badge>}
      />
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <Construction className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            {isAr
              ? "هذه الوحدة قيد التوسع. استخدم القوائم الجانبية للوصول إلى الوحدات المكتملة مثل الميزانيات والمشاريع والاعتمادات."
              : "This module is being expanded. Use the sidebar to access completed areas such as budgets, projects, and approvals."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
