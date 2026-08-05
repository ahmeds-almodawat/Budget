"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

type Tab = "transactions" | "unmapped" | "batches" | "duplicates" | "reversals";

interface ActualsWorkspaceProps {
  transactions: {
    id: string;
    source_transaction_id: string;
    transaction_date: string;
    amount_ex_vat: string;
    is_reversal: boolean;
    is_posted: boolean;
    original_description: string | null;
    actual_transaction_allocations: { allocation_amount: string }[];
  }[];
  unmapped: { id: string; source_transaction_id: string; amount: string; status: string }[];
  batches: { id: string; file_name: string | null; row_count: number; approval_status: string; is_posted: boolean }[];
  duplicates: { id: string; source_transaction_id: string; status: string }[];
}

export function ActualsWorkspace({ transactions, unmapped, batches, duplicates }: ActualsWorkspaceProps) {
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("transactions");

  const tabs: { key: Tab; en: string; ar: string }[] = [
    { key: "transactions", en: "Transactions", ar: "المعاملات" },
    { key: "unmapped", en: "Unmapped", ar: "غير مربوطة" },
    { key: "batches", en: "Import batches", ar: "دفعات الاستيراد" },
    { key: "duplicates", en: "Duplicate queue", ar: "قائمة التكرار" },
    { key: "reversals", en: "Reversals", ar: "العكسيات" },
  ];

  const reversals = transactions.filter((t) => t.is_reversal);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === t.key ? "bg-teal-800 text-white" : "bg-slate-100"}`}
          >
            {locale === "ar" ? t.ar : t.en}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? tabs.find((t) => t.key === tab)?.ar : tabs.find((t) => t.key === tab)?.en}</CardTitle>
        </CardHeader>
        <CardContent>
          {tab === "transactions" && (
            <ul className="space-y-2 text-sm">
              {transactions.filter((t) => !t.is_reversal).map((t) => (
                <li key={t.id} className="flex justify-between border-b py-2">
                  <span>{t.source_transaction_id}</span>
                  <span>{t.transaction_date}</span>
                  <span>{formatMoney(t.amount_ex_vat, "SAR")}</span>
                  <span className="text-slate-500">{t.is_posted ? "posted" : "draft"}</span>
                </li>
              ))}
            </ul>
          )}
          {tab === "unmapped" && (
            <ul className="space-y-2 text-sm">
              {unmapped.map((u) => (
                <li key={u.id} className="flex justify-between border-b py-2">
                  <span>{u.source_transaction_id}</span>
                  <span>{formatMoney(u.amount, "SAR")}</span>
                  <span>{u.status}</span>
                </li>
              ))}
            </ul>
          )}
          {tab === "batches" && (
            <ul className="space-y-2 text-sm">
              {batches.map((b) => (
                <li key={b.id} className="flex justify-between border-b py-2">
                  <span>{b.file_name ?? b.id.slice(0, 8)}</span>
                  <span>{b.row_count} rows</span>
                  <span>{b.approval_status}</span>
                </li>
              ))}
            </ul>
          )}
          {tab === "duplicates" && (
            <ul className="space-y-2 text-sm">
              {duplicates.map((d) => (
                <li key={d.id} className="flex justify-between border-b py-2">
                  <span>{d.source_transaction_id}</span>
                  <span>{d.status}</span>
                </li>
              ))}
            </ul>
          )}
          {tab === "reversals" && (
            <ul className="space-y-2 text-sm">
              {reversals.map((t) => (
                <li key={t.id} className="flex justify-between border-b py-2">
                  <span>{t.source_transaction_id}</span>
                  <span>{formatMoney(t.amount_ex_vat, "SAR")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        {locale === "ar"
          ? "لا يمكن تعديل المعاملات المرحّلة مباشرة — استخدم العكسيات فقط."
          : "Posted actuals cannot be edited directly — reversals only."}
      </p>
    </div>
  );
}
