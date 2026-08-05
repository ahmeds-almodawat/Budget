import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { seedControlScopes } from "@/data/seed/development-seed";

export default async function ProjectsListPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("project");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <div className="grid gap-4">
        {seedControlScopes.map((scope) => (
          <Card key={scope.id}>
            <CardHeader>
              <CardTitle>{locale === "ar" ? scope.nameAr : scope.nameEn}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between text-sm">
              <span>{scope.scopeType}</span>
              {scope.scopeType === "project" ? (
                <Link href={`/${locale}/projects/${scope.id}`} className="text-teal-700 hover:underline">
                  {locale === "ar" ? "عرض" : "View"}
                </Link>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
