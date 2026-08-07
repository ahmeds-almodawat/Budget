import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchIssuesAction } from "@/app/actions/governance-actions";
import { pickLocalized } from "@/lib/i18n/display";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("project", "read");
  const t = await getTranslations("pages.issues");
  const issues = (await fetchIssuesAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href={`/${locale}/risks`} className="text-sm text-primary hover:underline">
          {t("risks")}
        </Link>
      </div>
      <div className="grid gap-4">
        {issues.map((issue) => (
          <Card key={issue.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {pickLocalized(locale, issue.title_en, issue.title_ar)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between text-sm">
              <span>{issue.severity}</span>
              <span>{issue.status}</span>
            </CardContent>
          </Card>
        ))}
        {issues.length === 0 && (
          <p className="text-muted-foreground">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
