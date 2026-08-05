import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  seedProject,
  seedProjectEv,
  seedMilestones,
} from "@/data/seed/development-seed";

export default async function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.project");
  const ev = seedProjectEv;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-slate-600">
        {locale === "ar" ? seedProject.nameAr : seedProject.nameEn}
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("pv")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(ev.plannedValue, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ev")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(ev.earnedValue, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("ac")}</CardTitle></CardHeader>
          <CardContent>{formatMoney(ev.actualCost, "SAR")}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("cpi")}</CardTitle></CardHeader>
          <CardContent>
            {ev.costPerformanceIndex?.toFixed(2) ?? "N/A"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("spi")}</CardTitle></CardHeader>
          <CardContent>
            {ev.schedulePerformanceIndex?.toFixed(2) ?? "N/A"}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>{locale === "ar" ? "المعالم" : "Milestones"}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {seedMilestones.map((m) => (
              <li key={m.code} className="flex justify-between border-b py-2">
                <span>{locale === "ar" ? m.nameAr : m.nameEn}</span>
                <span className={m.status === "delayed" ? "text-red-700" : ""}>
                  {m.status} {m.delayDays > 0 ? `(+${m.delayDays}d)` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
