import { setRequestLocale, getTranslations } from "next-intl/server";
import { ReportsWorkspace } from "@/components/reports/reports-workspace";
import { requireRoutePermission } from "@/lib/auth/route-authorization";
import { hasPermission } from "@/domain/auth/permissions";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await requireRoutePermission("report", "read");
  const t = await getTranslations("pages.reports");
  const scope = session.legalEntityId;
  const assignments = session.ctx.roleAssignments;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ReportsWorkspace
        canExport={hasPermission(assignments, "report", "export", scope)}
        canViewAudit={hasPermission(assignments, "audit", "read", scope)}
      />
    </div>
  );
}
