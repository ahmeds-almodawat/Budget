import { setRequestLocale, getTranslations } from "next-intl/server";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.reports");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ReportsWorkspace />
    </div>
  );
}
