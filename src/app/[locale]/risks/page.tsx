import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRisksAction } from "@/app/actions/governance-actions";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { RisksAnalyticsPanel } from "@/components/dashboard/risks-analytics-panel";
import type { RiskPlotPoint } from "@/domain/analytics/types";

function readScale(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

/** True only when 1–5 probability/impact scales exist — not percent/money fields. */
function hasNumericRiskScales(risk: Record<string, unknown>): boolean {
  const probability = readScale(
    risk.probability ?? risk.probability_score ?? risk.probability_scale,
  );
  const impact = readScale(risk.impact ?? risk.impact_score ?? risk.impact_scale);
  return probability != null && impact != null;
}

export default async function RisksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("project", "read");
  const t = await getTranslations("pages.risks");
  const tAnalytics = await getTranslations("analytics");
  const risks = (await fetchRisksAction()) ?? [];

  const openRisks = risks.filter((r) => {
    const status = String(r.status ?? "").toLowerCase();
    return status === "open" || status === "active" || status === "monitoring";
  });
  const scalesAvailable = risks.some((r) => hasNumericRiskScales(r as Record<string, unknown>));

  const matrixRisks: RiskPlotPoint[] = scalesAvailable
    ? risks
        .filter((r) => hasNumericRiskScales(r as Record<string, unknown>))
        .map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: r.id,
            label: pickLocalized(locale, r.title_en, r.title_ar),
            probability: readScale(
              row.probability ?? row.probability_score ?? row.probability_scale,
            )!,
            impact: readScale(row.impact ?? row.impact_score ?? row.impact_scale)!,
            status: r.status,
            owner: r.owner_id ?? null,
          };
        })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex gap-3 text-sm">
          <Link href={`/${locale}/issues`} className="text-primary hover:underline">
            {t("issues")}
          </Link>
          <Link href={`/${locale}/actions`} className="text-primary hover:underline">
            {t("actions")}
          </Link>
          <Link href={`/${locale}/decisions`} className="text-primary hover:underline">
            {t("decisions")}
          </Link>
        </div>
      </div>

      <RisksAnalyticsPanel
        showMatrix={scalesAvailable}
        matrixRisks={matrixRisks}
        openException={{
          id: "open-risks",
          label: t("title"),
          count: openRisks.length,
          tone: openRisks.length > 0 ? "warning" : "neutral",
        }}
        titles={{
          riskMatrix: tAnalytics("sections.riskMatrix"),
          exceptions: tAnalytics("sections.exceptions"),
          empty: tAnalytics("empty.period"),
        }}
      />

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
                <div className="md:col-span-3 text-text-secondary">{r.mitigation_plan}</div>
              )}
            </CardContent>
          </Card>
        ))}
        {risks.length === 0 && (
          <p className="text-muted-foreground">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
