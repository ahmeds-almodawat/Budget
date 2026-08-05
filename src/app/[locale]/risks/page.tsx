import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRisksAction } from "@/app/actions/governance-actions";
import { formatMoney } from "@/lib/money";

export default async function RisksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const risks = (await fetchRisksAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "المخاطر" : "Risks"}</h1>
        <div className="flex gap-3 text-sm">
          <Link href={`/${locale}/issues`} className="text-teal-700 hover:underline">
            {locale === "ar" ? "القضايا" : "Issues"}
          </Link>
          <Link href={`/${locale}/actions`} className="text-teal-700 hover:underline">
            {locale === "ar" ? "الإجراءات" : "Actions"}
          </Link>
          <Link href={`/${locale}/decisions`} className="text-teal-700 hover:underline">
            {locale === "ar" ? "القرارات" : "Decisions"}
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {risks.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {locale === "ar" ? r.title_ar : r.title_en}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-3">
              <div>{locale === "ar" ? "الاحتمالية" : "Probability"}: {r.probability_percent}%</div>
              <div>
                {locale === "ar" ? "التأثير المالي" : "Financial impact"}:{" "}
                {formatMoney(r.financial_impact, "SAR")}
              </div>
              <div>
                {locale === "ar" ? "التعرض" : "Exposure"}:{" "}
                {formatMoney(r.computedExposure ?? r.risk_exposure ?? 0, "SAR")}
              </div>
              <div>{locale === "ar" ? "الحالة" : "Status"}: {r.status}</div>
              <div>{locale === "ar" ? "التصعيد" : "Escalation"}: {r.escalation_level ?? "—"}</div>
              {r.mitigation_plan && (
                <div className="md:col-span-3 text-slate-600">{r.mitigation_plan}</div>
              )}
            </CardContent>
          </Card>
        ))}
        {risks.length === 0 && (
          <p className="text-slate-500">{locale === "ar" ? "لا توجد مخاطر" : "No risks found"}</p>
        )}
      </div>
    </div>
  );
}
