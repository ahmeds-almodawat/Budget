import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { fetchPendingProgressUpdatesAction } from "@/app/actions/project-actions";
import { ProgressApprovalWorkflow } from "@/components/project/progress-approval-workflow";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { redirect } from "next/navigation";

export default async function ProgressApprovalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  if (!hasPermission(roleAssignments, "milestone", "approve", LEGAL_ENTITY_MODAWAT)) {
    redirect(`/${locale}/auth/access-denied`);
  }

  const updates = (await fetchPendingProgressUpdatesAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {locale === "ar" ? "اعتماد التقدم" : "Progress approval"}
        </h1>
        <Link href={`/${locale}/milestones`} className="text-sm text-teal-700 hover:underline">
          {locale === "ar" ? "المعالم" : "Milestones"}
        </Link>
      </div>
      <ProgressApprovalWorkflow updates={updates} />
    </div>
  );
}
