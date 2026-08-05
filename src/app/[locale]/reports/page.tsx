import { setRequestLocale } from "next-intl/server";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{locale === "ar" ? "التقارير" : "Reports"}</h1>
      <ReportsWorkspace />
    </div>
  );
}
