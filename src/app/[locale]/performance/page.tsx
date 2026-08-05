import { setRequestLocale, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { seedEmployeePerformance } from "@/data/seed/development-seed";

export default async function EmployeePerformancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard.employee");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {seedEmployeePerformance.map((team) => (
          <Card key={team.nameEn}>
            <CardHeader>
              <CardTitle>{locale === "ar" ? team.nameAr : team.nameEn}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div>{t("onTimeCompletion")}: {team.onTimePercent}%</div>
              <div>{t("accountableDelay")}: {team.accountableDelay}d</div>
              <div>CPI: {team.cpi}</div>
              <div>SPI: {team.spi}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
