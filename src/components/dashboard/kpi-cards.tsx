import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { seedExecutiveMetrics } from "@/data/seed/development-seed";

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

export function ExecutiveKpiGrid({ locale }: { locale: string }) {
  const m = seedExecutiveMetrics;
  const variance = (
    Number(m.currentApprovedBudget) - Number(m.estimateAtCompletion)
  ).toFixed(2);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Original Approved Budget"
        value={formatMoney(m.originalApprovedBudget, "SAR", locale === "ar" ? "ar-SA" : "en-SA")}
      />
      <KpiCard
        title="Current Approved Budget"
        value={formatMoney(m.currentApprovedBudget, "SAR", locale === "ar" ? "ar-SA" : "en-SA")}
      />
      <KpiCard
        title="Actual Cost"
        value={formatMoney(m.actualCost, "SAR", locale === "ar" ? "ar-SA" : "en-SA")}
      />
      <KpiCard
        title="Committed Cost"
        value={formatMoney(m.committedCost, "SAR", locale === "ar" ? "ar-SA" : "en-SA")}
      />
      <KpiCard
        title="Estimate at Completion"
        value={formatMoney(m.estimateAtCompletion, "SAR", locale === "ar" ? "ar-SA" : "en-SA")}
      />
      <KpiCard
        title="Forecast Variance"
        value={formatMoney(variance, "SAR", locale === "ar" ? "ar-SA" : "en-SA")}
        variant={Number(variance) < 0 ? "danger" : "default"}
      />
      <KpiCard title="Delayed Milestones" value={String(m.delayedMilestones)} variant="warning" />
      <KpiCard title="Projects at Risk" value={String(m.projectsAtRisk)} variant="danger" />
    </div>
  );
}
