import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDecisionsAction } from "@/app/actions/governance-actions";

export default async function DecisionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const decisions = (await fetchDecisionsAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "القرارات" : "Decisions"}</h1>
        <Link href={`/${locale}/risks`} className="text-sm text-teal-700 hover:underline">
          {locale === "ar" ? "المخاطر" : "Risks"}
        </Link>
      </div>
      <div className="grid gap-4">
        {decisions.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {locale === "ar" ? d.title_ar : d.title_en}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between text-sm">
              <span>{d.decision_date}</span>
              <span>{d.status}</span>
            </CardContent>
          </Card>
        ))}
        {decisions.length === 0 && (
          <p className="text-slate-500">{locale === "ar" ? "لا توجد قرارات" : "No decisions found"}</p>
        )}
      </div>
    </div>
  );
}
