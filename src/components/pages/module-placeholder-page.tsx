import { setRequestLocale, getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";

export type ModuleKey =
  | "budgets"
  | "milestones"
  | "tasks"
  | "cost-control"
  | "commitments"
  | "actuals"
  | "forecasts"
  | "changes"
  | "risks"
  | "reports"
  | "approvals"
  | "imports"
  | "master-data"
  | "administration"
  | "audit";

export default async function ModulePlaceholderPage({
  params,
  moduleKey,
}: {
  params: Promise<{ locale: string }>;
  moduleKey: ModuleKey;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("modules");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(`${moduleKey}.title`)}
        description={t(`${moduleKey}.description`)}
        actions={<Badge variant="accent">{t("inDevelopment")}</Badge>}
      />
      <Card>
        <CardContent className="flex items-start gap-4 p-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-warning-surface text-warning ring-1 ring-amber-100">
            <Construction className="h-6 w-6" aria-hidden />
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">{t("expansionNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
