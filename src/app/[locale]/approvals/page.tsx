import { setRequestLocale } from "next-intl/server";
import { ApprovalsWorkspace } from "@/components/approvals/approvals-workspace";
import { fetchApprovalCountsAction, fetchApprovalInboxAction } from "@/app/actions/approval-actions";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission, type RoleAssignment } from "@/domain/auth/permissions";
import { LEGAL_ENTITY_MODAWAT } from "@/types/database";
import { redirect } from "next/navigation";

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await getAuthContext();
  const roleAssignments: RoleAssignment[] = ctx?.roleAssignments ?? [];
  if (!hasPermission(roleAssignments, "approval", "read", LEGAL_ENTITY_MODAWAT)) {
    redirect(`/${locale}/auth/access-denied`);
  }

  const [items, counts] = await Promise.all([
    fetchApprovalInboxAction("awaiting"),
    fetchApprovalCountsAction(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {locale === "ar" ? "مساحة الاعتمادات" : "Approvals"}
      </h1>
      <ApprovalsWorkspace
        initialTab="awaiting"
        initialItems={items ?? []}
        counts={counts ?? { awaiting: 0, submitted: 0, approved: 0, rejected: 0, delegated: 0, overdue: 0 }}
      />
    </div>
  );
}
