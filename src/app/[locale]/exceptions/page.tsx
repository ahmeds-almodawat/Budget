import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchExceptionsAction } from "@/app/actions/audit-actions";
import { pickLocalized } from "@/lib/i18n/display";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function ExceptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("audit", "read");
  const tPages = await getTranslations("pages.exceptions");
  const tExceptions = await getTranslations("exceptions");
  const tWorkspace = await getTranslations("workspace");

  const exceptions = await fetchExceptionsAction();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tPages("title")}</h1>
        <Link href={`/${locale}/audit`} className="text-sm text-primary hover:underline">
          {tPages("auditLog")}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tExceptions("pendingVariance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(exceptions?.varianceExplanations ?? []).map((v: { id: string; cause: string; variance_amount: string }) => (
              <li key={v.id} className="border-b py-2">{v.cause} — {v.variance_amount}</li>
            ))}
            {(exceptions?.varianceExplanations ?? []).length === 0 && (
              <li className="text-muted-foreground">{tWorkspace("none")}</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tExceptions("unmappedTransactions")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(exceptions?.unmappedTransactions ?? []).map((u: { id: string; source_transaction_id: string; amount: string }) => (
              <li key={u.id} className="border-b py-2">{u.source_transaction_id} — {u.amount}</li>
            ))}
            {(exceptions?.unmappedTransactions ?? []).length === 0 && (
              <li className="text-muted-foreground">{tWorkspace("none")}</li>
            )}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tExceptions("notifications")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {(exceptions?.notifications ?? []).map((n: { id: string; title_en: string; title_ar: string; severity: string }) => (
              <li key={n.id} className="border-b py-2">
                {pickLocalized(locale, n.title_en, n.title_ar)} — {n.severity}
              </li>
            ))}
            {(exceptions?.notifications ?? []).length === 0 && (
              <li className="text-muted-foreground">{tWorkspace("none")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
