import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMilestonesAction } from "@/app/actions/project-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { CONTROL_SCOPE_KM_HOSPITAL, LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { pickLocalized } from "@/lib/i18n/display";

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.milestones");
  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  const canApprove = hasPermission(roleAssignments, "milestone", "approve", LEGAL_ENTITY_MODAWAT);

  const milestones = (await fetchMilestonesAction(CONTROL_SCOPE_KM_HOSPITAL)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {canApprove && (
          <Link
            href={`/${locale}/milestones/progress-approval`}
            className="text-sm text-teal-700 hover:underline"
          >
            {t("progressApproval")}
          </Link>
        )}
      </div>

      <div className="grid gap-4">
        {milestones.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={`/${locale}/milestones/${m.id}`} className="hover:text-teal-700">
                  {pickLocalized(locale, m.name_en, m.name_ar)}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between text-sm text-slate-600">
              <span>{m.code}</span>
              <span>
                {m.approved_progress}% — {m.approval_status}
              </span>
              <span>{m.baseline_date ?? "—"}</span>
            </CardContent>
          </Card>
        ))}
        {milestones.length === 0 && (
          <p className="text-slate-500">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
