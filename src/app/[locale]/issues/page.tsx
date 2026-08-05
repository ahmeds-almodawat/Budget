import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchIssuesAction } from "@/app/actions/governance-actions";

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const issues = (await fetchIssuesAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "القضايا" : "Issues"}</h1>
        <Link href={`/${locale}/risks`} className="text-sm text-teal-700 hover:underline">
          {locale === "ar" ? "المخاطر" : "Risks"}
        </Link>
      </div>
      <div className="grid gap-4">
        {issues.map((issue) => (
          <Card key={issue.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {locale === "ar" ? issue.title_ar : issue.title_en}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between text-sm">
              <span>{issue.severity}</span>
              <span>{issue.status}</span>
            </CardContent>
          </Card>
        ))}
        {issues.length === 0 && (
          <p className="text-slate-500">{locale === "ar" ? "لا توجد قضايا" : "No issues found"}</p>
        )}
      </div>
    </div>
  );
}
