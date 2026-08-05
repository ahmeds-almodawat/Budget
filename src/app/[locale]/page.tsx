import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const db = createAdminClient();
  const { data: entity } = await db
    .from("legal_entities")
    .select("name_en, name_ar")
    .eq("code", "MODAWAT")
    .single();

  const hospital = await fetchHospitalDashboardAction().catch(() => null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("home")}</h1>
        <p className="mt-1 text-slate-600">
          {locale === "ar" ? entity?.name_ar : entity?.name_en}
        </p>
      </div>

      {hospital ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">{locale === "ar" ? "YTD الفعلي" : "YTD Actual"}</CardTitle></CardHeader>
            <CardContent>{formatMoney(hospital.ytdActual, "SAR")}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm">{locale === "ar" ? "YTD الميزانية" : "YTD Budget"}</CardTitle></CardHeader>
            <CardContent>{formatMoney(hospital.ytdBudget, "SAR")}</CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("executiveDashboard")}</CardTitle></CardHeader>
          <CardContent>
            <Link href={`/${locale}/dashboard/executive`} className="text-teal-700 hover:underline">
              {locale === "ar" ? "عرض لوحة الإدارة التنفيذية" : "View executive dashboard"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("operationalBudgets")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Link href={`/${locale}/budgets`} className="block text-teal-700 hover:underline">
              {locale === "ar" ? "إدارة الميزانيات" : "Manage budgets"}
            </Link>
            <Link href={`/${locale}/dashboard/hospital`} className="block text-teal-700 hover:underline">
              {locale === "ar" ? "لوحة المستشفى" : "Hospital dashboard"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
