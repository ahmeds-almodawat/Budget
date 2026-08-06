import { setRequestLocale, getTranslations } from "next-intl/server";
import { ActualImportWorkflow } from "@/components/imports/actual-import-workflow";

export default async function ImportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.imports");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ActualImportWorkflow />
    </div>
  );
}
