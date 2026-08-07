import { getTranslations } from "next-intl/server";
import { AccessDeniedCard } from "@/components/auth/access-denied-card";

export default async function AccessDeniedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });

  return <AccessDeniedCard locale={locale} title={t("accessDeniedTitle")} message={t("accessDeniedMessage")} returnHome={t("returnHome")} standalone />;
}
