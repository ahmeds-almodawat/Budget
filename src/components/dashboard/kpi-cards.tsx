import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { seedExecutiveMetrics } from "@/data/seed/development-seed";
import { numberLocale } from "@/lib/i18n/display";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  variant?: "default" | "warning" | "danger";
}

export function KpiCard({ title, value, subtitle, variant = "default" }: KpiCardProps) {
  const color =
    variant === "danger"
      ? "text-red-700"
      : variant === "warning"
        ? "text-amber-700"
        : "text-slate-900";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
      </CardContent>
    </Card>
  );
}

export async function ExecutiveKpiGrid({ locale }: { locale: string }) {
  const t = await getTranslations("dashboard.executive");
  const m = seedExecutiveMetrics;
  const variance = (
    Number(m.currentApprovedBudget) - Number(m.estimateAtCompletion)
  ).toFixed(2);
  const fmtLocale = numberLocale(locale);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title={t("originalBudget")}
        value={formatMoney(m.originalApprovedBudget, "SAR", fmtLocale)}
      />
      <KpiCard
        title={t("currentBudget")}
        value={formatMoney(m.currentApprovedBudget, "SAR", fmtLocale)}
      />
      <KpiCard
        title={t("actualCost")}
        value={formatMoney(m.actualCost, "SAR", fmtLocale)}
      />
      <KpiCard
        title={t("committedCost")}
        value={formatMoney(m.committedCost, "SAR", fmtLocale)}
      />
      <KpiCard
        title={t("eac")}
        value={formatMoney(m.estimateAtCompletion, "SAR", fmtLocale)}
      />
      <KpiCard
        title={t("variance")}
        value={formatMoney(variance, "SAR", fmtLocale)}
        variant={Number(variance) < 0 ? "danger" : "default"}
      />
      <KpiCard title={t("delayedMilestones")} value={String(m.delayedMilestones)} variant="warning" />
      <KpiCard title={t("projectsAtRisk")} value={String(m.projectsAtRisk)} variant="danger" />
    </div>
  );
}
