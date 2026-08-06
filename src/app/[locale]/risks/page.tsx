import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRisksAction } from "@/app/actions/governance-actions";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

export default async function RisksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.risks");
  const risks = (await fetchRisksAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-3 text-sm">
          <Link href={`/${locale}/issues`} className="text-teal-700 hover:underline">
            {t("issues")}
          </Link>
          <Link href={`/${locale}/actions`} className="text-teal-700 hover:underline">
            {t("actions")}
          </Link>
          <Link href={`/${locale}/decisions`} className="text-teal-700 hover:underline">
            {t("decisions")}
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {risks.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {pickLocalized(locale, r.title_en, r.title_ar)}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-3">
              <div>{t("probability")}: {r.probability_percent}%</div>
              <div>
                {t("financialImpact")}:{" "}
                {formatMoney(r.financial_impact, "SAR")}
              </div>
              <div>
                {t("exposure")}:{" "}
                {formatMoney(r.computedExposure ?? r.risk_exposure ?? 0, "SAR")}
              </div>
              <div>{t("status")}: {r.status}</div>
              <div>{t("escalation")}: {r.escalation_level ?? "—"}</div>
              {r.mitigation_plan && (
                <div className="md:col-span-3 text-slate-600">{r.mitigation_plan}</div>
              )}
            </CardContent>
          </Card>
        ))}
        {risks.length === 0 && (
          <p className="text-slate-500">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
