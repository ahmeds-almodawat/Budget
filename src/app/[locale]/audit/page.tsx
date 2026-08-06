import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuditSearchWorkspace } from "@/components/audit/audit-search-workspace";
import { fetchAuditEventsAction } from "@/app/actions/audit-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { redirect } from "next/navigation";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.audit");

  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  if (!hasPermission(roleAssignments, "audit", "read", LEGAL_ENTITY_MODAWAT)) {
    redirect(`/${locale}/auth/access-denied`);
  }

  const events = (await fetchAuditEventsAction({ limit: 50 })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href={`/${locale}/exceptions`} className="text-sm text-teal-700 hover:underline">
          {t("exceptions")}
        </Link>
      </div>
      <AuditSearchWorkspace initialEvents={events} />
    </div>
  );
}
