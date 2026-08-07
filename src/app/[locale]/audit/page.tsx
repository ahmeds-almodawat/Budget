import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuditSearchWorkspace } from "@/components/audit/audit-search-workspace";
import { fetchAuditEventsAction } from "@/app/actions/audit-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("audit", "read");
  const t = await getTranslations("pages.audit");

  const events = (await fetchAuditEventsAction({ limit: 50 })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href={`/${locale}/exceptions`} className="text-sm text-primary hover:underline">
          {t("exceptions")}
        </Link>
      </div>
      <AuditSearchWorkspace initialEvents={events} />
    </div>
  );
}
