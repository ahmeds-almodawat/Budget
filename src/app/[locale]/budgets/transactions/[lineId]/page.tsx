import { setRequestLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchBudgetLineTransactionsAction } from "@/app/actions/budget-actions";
import { requireRoutePermission } from "@/lib/auth/route-authorization";

export default async function BudgetLineTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string; lineId: string }>;
}) {
  const { locale, lineId } = await params;
  setRequestLocale(locale);
  await requireRoutePermission("budget", "read");
  const t = await getTranslations("transactions");

  let rows: Awaited<ReturnType<typeof fetchBudgetLineTransactionsAction>> = [];
  let error: string | null = null;
  try {
    rows = await fetchBudgetLineTransactionsAction(lineId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error loading transactions";
  }

  return (
    <div className="space-y-6">
      <Link href={`/${locale}/dashboard/hospital`} className="text-primary hover:underline">
        ← {t("hospitalDashboard")}
      </Link>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {error ? <p className="text-danger">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>{t("linkedTransactions")}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground">{t("empty")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="py-2">ID</th>
                  <th className="py-2">{t("date")}</th>
                  <th className="py-2">{t("amount")}</th>
                  <th className="py-2">{t("description")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const txn = row.actual_transactions as {
                    source_transaction_id?: string;
                    transaction_date?: string;
                    original_description?: string;
                  } | null;
                  return (
                    <tr key={row.id} className="border-b">
                      <td className="py-2 font-mono text-xs">{txn?.source_transaction_id}</td>
                      <td className="py-2">{txn?.transaction_date}</td>
                      <td className="py-2">{formatMoney(row.allocation_amount, "SAR")}</td>
                      <td className="py-2">{txn?.original_description}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
