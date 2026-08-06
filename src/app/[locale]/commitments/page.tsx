import { setRequestLocale, getTranslations } from "next-intl/server";
import { CommitmentsWorkspace } from "@/components/financial/commitments-workspace";
import { fetchCommitmentsAction, fetchVendorsAction } from "@/app/actions/financial-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function CommitmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("commitment", "read");
  const t = await getTranslations("pages.commitments");

  const [commitments, vendors] = await Promise.all([
    fetchCommitmentsAction(),
    fetchVendorsAction(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <CommitmentsWorkspace commitments={commitments ?? []} vendors={vendors ?? []} />
    </div>
  );
}
