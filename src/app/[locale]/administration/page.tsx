import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { AdministrationWorkspace } from "@/components/admin/administration-workspace";
import { WorkspaceError } from "@/components/governance/workspace-state";
import { fetchAdministrationDataAction } from "@/app/actions/governance-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function AdministrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("organization", "read");
  const t = await getTranslations("administration");
  let data: Awaited<ReturnType<typeof fetchAdministrationDataAction>> | null = null;
  let errorMessage: string | null = null;
  try {
    data = await fetchAdministrationDataAction();
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : t("loadError");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {errorMessage || !data ? (
        <WorkspaceError message={errorMessage ?? t("loadError")} />
      ) : (
        <AdministrationWorkspace
          profiles={data.profiles}
          roles={data.roles}
          legalEntityName={data.legalEntityName}
        />
      )}
    </div>
  );
}
