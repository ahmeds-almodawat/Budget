import { setRequestLocale, getTranslations } from "next-intl/server";
import { ApprovalsWorkspace } from "@/components/approvals/approvals-workspace";
import { fetchApprovalCountsAction, fetchApprovalInboxAction } from "@/app/actions/approval-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ApprovalsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("approval", "read");
  const t = await getTranslations("pages.approvals");

  const [items, counts] = await Promise.all([
    fetchApprovalInboxAction("awaiting"),
    fetchApprovalCountsAction(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <ApprovalsWorkspace
        initialTab="awaiting"
        initialItems={items ?? []}
        counts={counts ?? { awaiting: 0, submitted: 0, approved: 0, rejected: 0, delegated: 0, overdue: 0 }}
      />
    </div>
  );
}
