import { setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { fetchBudgetLineTransactionsAction } from "@/app/actions/budget-actions";

export default async function BudgetLineTransactionsPage({
  params,
}: {
  params: Promise<{ locale: string; lineId: string }>;
}) {
  const { locale, lineId } = await params;
  setRequestLocale(locale);

  let rows: Awaited<ReturnType<typeof fetchBudgetLineTransactionsAction>> = [];
  let error: string | null = null;
  try {
    rows = await fetchBudgetLineTransactionsAction(lineId);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error loading transactions";
  }

  return (
    <div className="space-y-6">
      <Link href={`/${locale}/dashboard/hospital`} className="text-teal-700 hover:underline">
        ← {locale === "ar" ? "لوحة المستشفى" : "Hospital dashboard"}
      </Link>
      <h1 className="text-2xl font-bold">
        {locale === "ar" ? "تفاصيل المعاملات" : "Transaction details"}
      </h1>
      {error ? <p className="text-red-700">{error}</p> : null}
      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "المعاملات المرتبطة" : "Linked transactions"}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-slate-500">{locale === "ar" ? "لا توجد معاملات" : "No transactions"}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start">
                  <th className="py-2">ID</th>
                  <th className="py-2">{locale === "ar" ? "التاريخ" : "Date"}</th>
                  <th className="py-2">{locale === "ar" ? "المبلغ" : "Amount"}</th>
                  <th className="py-2">{locale === "ar" ? "الوصف" : "Description"}</th>
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
