import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMilestonesAction } from "@/app/actions/project-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { CONTROL_SCOPE_KM_HOSPITAL, LEGAL_ENTITY_MODAWAT } from "@/types/database";

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  const canApprove = hasPermission(roleAssignments, "milestone", "approve", LEGAL_ENTITY_MODAWAT);

  const milestones = (await fetchMilestonesAction(CONTROL_SCOPE_KM_HOSPITAL)) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {locale === "ar" ? "المعالم" : "Milestones"}
        </h1>
        {canApprove && (
          <Link
            href={`/${locale}/milestones/progress-approval`}
            className="text-sm text-teal-700 hover:underline"
          >
            {locale === "ar" ? "اعتماد التقدم" : "Progress approval"}
          </Link>
        )}
      </div>

      <div className="grid gap-4">
        {milestones.map((m) => (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle className="text-base">
                <Link href={`/${locale}/milestones/${m.id}`} className="hover:text-teal-700">
                  {locale === "ar" ? m.name_ar : m.name_en}
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
          <p className="text-slate-500">
            {locale === "ar" ? "لا توجد معالم" : "No milestones found"}
          </p>
        )}
      </div>
    </div>
  );
}
