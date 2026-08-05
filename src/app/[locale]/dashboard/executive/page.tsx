import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchHospitalDashboardAction } from "@/app/actions/budget-actions";
import { createClient } from "@/lib/supabase/server";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { calculateEstimateAtCompletion, calculateOpenCommitment } from "@/domain/financial/calculations";

export default async function ExecutiveDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.executive");

  const db = await createClient();
  const hospital = await fetchHospitalDashboardAction().catch(() => null);

  const { data: commitments } = await db
    .from("commitments")
    .select("original_value, approved_variations, invoiced_applied, cancelled_amount")
    .eq("legal_entity_id", LEGAL_ENTITY_MODAWAT);

  const committedTotal = (commitments ?? []).reduce((sum, c) => {
    return sum + Number(
      calculateOpenCommitment({
        totalCommitted: moneyString(c.original_value, c.approved_variations),
        invoicedApplied: c.invoiced_applied,
        cancelled: c.cancelled_amount,
      }),
    );
  }, 0);

  const currentBudget = hospital?.currentApproved ?? "0";
  const actualCost = hospital?.ytdActual ?? "0";
  const eac = calculateEstimateAtCompletion({
    actualCost,
    openCommitments: String(committedTotal),
    forecastUncommitted: "0",
  }).toFixed(2);
  const variance = (Number(currentBudget) - Number(eac)).toFixed(2);

  const { count: delayedMilestones } = await db
    .from("milestones")
    .select("*", { count: "exact", head: true })
    .lt("forecast_date", new Date().toISOString().slice(0, 10))
    .is("actual_date", null);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("currentBudget")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(currentBudget, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("actualCost")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(actualCost, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("committedCost")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(String(committedTotal), "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("eac")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(eac, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("variance")}</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${Number(variance) < 0 ? "text-red-700" : ""}`}>
            {formatMoney(variance, "SAR")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("delayedMilestones")}</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{delayedMilestones ?? 0}</CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("hospitalPerformance")}</CardTitle></CardHeader>
          <CardContent>
            <Link href={`/${locale}/dashboard/hospital`} className="text-teal-700 hover:underline">
              {locale === "ar" ? "عرض لوحة المستشفى" : "Open hospital dashboard"}
            </Link>
            {hospital ? (
              <div className="mt-2 text-sm text-slate-600">
                MTD {formatMoney(hospital.mtdActual, "SAR")} / {formatMoney(hospital.mtdBudget, "SAR")}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{locale === "ar" ? "المشاريع" : "Projects"}</CardTitle></CardHeader>
          <CardContent>
            <Link href={`/${locale}/projects/cs-khamis-hospital`} className="text-teal-700 hover:underline">
              Khamis Mushait New Hospital
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function moneyString(base: string, variation: string) {
  return (Number(base) + Number(variation)).toFixed(4);
}
