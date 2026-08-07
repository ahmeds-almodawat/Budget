import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExecutiveAnalyticsDashboard } from "@/components/dashboard/executive-analytics-dashboard";
import { calculateOpenCommitment } from "@/domain/financial/calculations";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { loadBudgetVsActualWorkspaceData } from "@/data/repositories/revenue-repository";
import { buildExecutiveAnalyticsModel } from "@/lib/analytics/executive-view-model";
import { FISCAL_YEAR_2027 } from "@/types/database";

export default async function ExecutiveDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("budget", "read");
  const t = await getTranslations("dashboard.executive");
  const tAnalytics = await getTranslations("analytics");
  const tLabels = await getTranslations("dashboardLabels");
  const db = session.db;
  const localePrefix = `/${locale}`;
  const arabicCurrency = locale.startsWith("ar");

  const workspace = await loadBudgetVsActualWorkspaceData(db, session.legalEntityId, FISCAL_YEAR_2027).catch(
    () => null,
  );

  const { data: commitments } = await db
    .from("commitments")
    .select("original_value, approved_variations, invoiced_applied, cancelled_amount")
    .eq("legal_entity_id", session.legalEntityId);

  const openCommitments = (commitments ?? []).reduce((sum, c) => {
    return (
      sum +
      Number(
        calculateOpenCommitment({
          totalCommitted: (Number(c.original_value) + Number(c.approved_variations)).toFixed(4),
          invoicedApplied: c.invoiced_applied,
          cancelled: c.cancelled_amount,
        }),
      )
    );
  }, 0);

  const { count: delayedMilestones } = await db
    .from("milestones")
    .select("*", { count: "exact", head: true })
    .lt("forecast_date", new Date().toISOString().slice(0, 10))
    .is("actual_date", null);

  const { count: matchExceptions } = await db
    .from("invoice_match_exceptions")
    .select("id, supplier_invoices!inner(legal_entity_id)", { count: "exact", head: true })
    .eq("supplier_invoices.legal_entity_id", session.legalEntityId)
    .eq("is_resolved", false);

  const { count: unmappedActuals } = await db
    .from("unmapped_transaction_queue")
    .select("id, import_batches!inner(legal_entity_id)", { count: "exact", head: true })
    .eq("import_batches.legal_entity_id", session.legalEntityId);

  const { data: blockingResults } = await db
    .from("period_close_item_results")
    .select("id, item_status, period_close_checklist_items!inner(is_blocking), period_close_instances!inner(legal_entity_id)")
    .eq("period_close_instances.legal_entity_id", session.legalEntityId)
    .eq("period_close_checklist_items.is_blocking", true)
    .in("item_status", ["pending", "failed", "in_progress"]);
  const periodBlockers = blockingResults?.length ?? 0;

  const model = workspace
    ? buildExecutiveAnalyticsModel({
        locale,
        localePrefix,
        arabicCurrency,
        revenueRows: workspace.revenueRows,
        expenseRows: workspace.expenseRows,
        profitabilityRows: workspace.profitabilityRows,
        openCommitments,
        delayedMilestones: delayedMilestones ?? 0,
        matchExceptions: matchExceptions ?? 0,
        unmappedActuals: unmappedActuals ?? 0,
        periodBlockers,
        labels: {
          revenue: tAnalytics("kpi.revenue"),
          revenueVsBudget: tAnalytics("kpi.revenueVsBudget"),
          grossProfit: tAnalytics("kpi.grossProfit"),
          grossMargin: tAnalytics("kpi.grossMargin"),
          operatingContribution: tAnalytics("kpi.operatingContribution"),
          actualOperatingCost: tAnalytics("kpi.actualOperatingCost"),
          openCommitments: tAnalytics("kpi.openCommitments"),
          capex: tAnalytics("kpi.capex"),
          budget: tAnalytics("series.budget"),
          actual: tAnalytics("series.actual"),
          commitment: tAnalytics("series.commitment"),
          remaining: tAnalytics("series.remaining"),
          netRevenue: tAnalytics("series.netRevenue"),
          grossProfitSeries: tAnalytics("series.grossProfit"),
          operatingContributionSeries: tAnalytics("series.operatingContribution"),
          costOfRevenue: tAnalytics("bridge.costOfRevenue"),
          payroll: tAnalytics("bridge.payroll"),
          opex: tAnalytics("bridge.operatingExpenses"),
          gross: tAnalytics("bridge.gross"),
          rejections: tAnalytics("bridge.rejections"),
          discounts: tAnalytics("bridge.discounts"),
          refunds: tAnalytics("bridge.refunds"),
          creditNotes: tAnalytics("bridge.creditNotes"),
          otherDeductions: tAnalytics("bridge.otherDeductions"),
          adjustments: tAnalytics("bridge.adjustments"),
          net: tAnalytics("bridge.net"),
          classification: {
            cost_of_revenue: tAnalytics("classification.costOfRevenue"),
            payroll: tAnalytics("classification.payroll"),
            operating_expenses: tAnalytics("classification.operatingExpenses"),
            capex: tAnalytics("classification.capex"),
          },
          exceptions: {
            delayedMilestones: t("delayedMilestones"),
            matchExceptions: tAnalytics("exceptions.matchExceptions"),
            unmapped: tAnalytics("exceptions.unmapped"),
            periodBlockers: tAnalytics("exceptions.periodBlockers"),
          },
        },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href={`${localePrefix}/dashboard/hospital`} className="text-primary hover:underline">
            {tLabels("openHospitalDashboard")}
          </Link>
          <Link href={`${localePrefix}/dashboard/restaurant`} className="text-primary hover:underline">
            {t("restaurantPerformance")}
          </Link>
          <Link href={`${localePrefix}/projects`} className="text-primary hover:underline">
            {tLabels("projects")}
          </Link>
        </div>
      </div>

      {model ? (
        <ExecutiveAnalyticsDashboard
          model={model}
          locale={locale}
          titles={{
            kpis: tAnalytics("sections.kpis"),
            revenueTrend: tAnalytics("sections.revenueTrend"),
            utilization: tAnalytics("sections.utilization"),
            profitability: tAnalytics("sections.profitabilityTrend"),
            grossToNet: tAnalytics("sections.grossToNet"),
            profitabilityBridge: tAnalytics("sections.profitabilityBridge"),
            exceptions: tAnalytics("sections.exceptions"),
            insights: tAnalytics("sections.insights"),
            empty: tAnalytics("empty.period"),
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{tAnalytics("empty.period")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-text-secondary">{tAnalytics("empty.errorHint")}</CardContent>
        </Card>
      )}
    </div>
  );
}
