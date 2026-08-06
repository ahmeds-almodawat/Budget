import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { fetchPendingProgressUpdatesAction } from "@/app/actions/project-actions";
import { ProgressApprovalWorkflow } from "@/components/project/progress-approval-workflow";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ProgressApprovalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("milestone", "approve");
  const t = await getTranslations("pages.progressApproval");

  const updates = (await fetchPendingProgressUpdatesAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href={`/${locale}/milestones`} className="text-sm text-primary hover:underline">
          {t("milestones")}
        </Link>
      </div>
      <ProgressApprovalWorkflow updates={updates} />
    </div>
  );
}
