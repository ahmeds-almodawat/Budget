import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExecutiveKpiGrid } from "@/components/dashboard/kpi-cards";
import {
  seedControlScopes,
  seedLegalEntity,
} from "@/data/seed/development-seed";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("home")}</h1>
        <p className="mt-1 text-slate-600">
          {locale === "ar" ? seedLegalEntity.nameAr : seedLegalEntity.nameEn}
        </p>
      </div>

      <ExecutiveKpiGrid locale={locale} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("executiveDashboard")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/${locale}/dashboard/executive`} className="text-teal-700 hover:underline">
              {locale === "ar" ? "عرض لوحة الإدارة التنفيذية" : "View executive dashboard"}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("projects")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {seedControlScopes
              .filter((s) => s.scopeType === "project")
              .map((scope) => (
                <Link
                  key={scope.id}
                  href={`/${locale}/projects/${scope.id}`}
                  className="block text-teal-700 hover:underline"
                >
                  {locale === "ar" ? scope.nameAr : scope.nameEn}
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
