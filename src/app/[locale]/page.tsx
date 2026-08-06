import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, BarChart3, Building2, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { fetchHospitalDashboardAction } from "@/app/actions/budget-actions";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");
  const isAr = locale === "ar";

  const db = await createClient();
  const { data: entity } = await db
    .from("legal_entities")
    .select("name_en, name_ar")
    .eq("code", "MODAWAT")
    .single();

  const hospital = await fetchHospitalDashboardAction().catch(() => null);

  const quickLinks = [
    {
      title: t("executiveDashboard"),
      href: `/${locale}/dashboard/executive`,
      description: isAr ? "مؤشرات الأداء على مستوى المجموعة" : "Group-level performance indicators",
      icon: BarChart3,
    },
    {
      title: t("operationalBudgets"),
      href: `/${locale}/budgets`,
      description: isAr ? "إعداد واعتماد الميزانيات" : "Prepare and approve budgets",
      icon: Wallet,
    },
    {
      title: isAr ? "لوحة المستشفى" : "Hospital dashboard",
      href: `/${locale}/dashboard/hospital`,
      description: isAr ? "الأداء التشغيلي للمستشفى" : "Hospital operational performance",
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("home")}
        description={isAr ? entity?.name_ar : entity?.name_en}
      />

      {hospital ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={isAr ? "YTD الفعلي" : "YTD Actual"}
            value={formatMoney(hospital.ytdActual, "SAR")}
            icon={BarChart3}
          />
          <StatCard
            label={isAr ? "YTD الميزانية" : "YTD Budget"}
            value={formatMoney(hospital.ytdBudget, "SAR")}
            icon={Wallet}
          />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {quickLinks.map((link) => (
          <Link key={link.href} href={link.href} className="group block">
            <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
              <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-teal-100">
                  <link.icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">{link.title}</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">{link.description}</p>
                </div>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                  aria-hidden
                />
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
