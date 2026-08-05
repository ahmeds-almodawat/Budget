import { setRequestLocale, getTranslations } from "next-intl/server";
import { HospitalBudgetWorkflow } from "@/components/budget/hospital-budget-workflow";

export default async function BudgetsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("budget");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <HospitalBudgetWorkflow />
    </div>
  );
}
