import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchRegisterActionsAction } from "@/app/actions/governance-actions";

export default async function ActionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const actions = (await fetchRegisterActionsAction()) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{locale === "ar" ? "الإجراءات" : "Actions"}</h1>
        <Link href={`/${locale}/risks`} className="text-sm text-teal-700 hover:underline">
          {locale === "ar" ? "المخاطر" : "Risks"}
        </Link>
      </div>
      <div className="grid gap-4">
        {actions.map((action) => (
          <Card key={action.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {locale === "ar" ? action.title_ar : action.title_en}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex justify-between text-sm">
              <span>{action.priority}</span>
              <span>{action.due_date ?? "—"}</span>
              <span>{action.status}</span>
            </CardContent>
          </Card>
        ))}
        {actions.length === 0 && (
          <p className="text-slate-500">{locale === "ar" ? "لا توجد إجراءات" : "No actions found"}</p>
        )}
      </div>
    </div>
  );
}
