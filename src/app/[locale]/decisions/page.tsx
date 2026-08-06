import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDecisionsAction } from "@/app/actions/governance-actions";
import { pickLocalized } from "@/lib/i18n/display";

export default async function DecisionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pages.decisions");
  const decisions = (await fetchDecisionsAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Link href={`/${locale}/risks`} className="text-sm text-primary hover:underline">
          {t("risks")}
        </Link>
      </div>
      <div className="grid gap-4">
        {decisions.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {pickLocalized(locale, d.title_en, d.title_ar)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between text-sm">
              <span>{d.decision_date}</span>
              <span>{d.status}</span>
            </CardContent>
          </Card>
        ))}
        {decisions.length === 0 && (
          <p className="text-muted-foreground">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
