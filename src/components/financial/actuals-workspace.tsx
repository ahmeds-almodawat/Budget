"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

type Tab = "transactions" | "unmapped" | "batches" | "duplicates" | "reversals";

const TAB_KEYS: Tab[] = ["transactions", "unmapped", "batches", "duplicates", "reversals"];

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
  const t = useTranslations("actuals");
  const tWorkspace = useTranslations("workspace");
  const [tab, setTab] = useState<Tab>("transactions");

  const reversals = transactions.filter((tx) => tx.is_reversal);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === key ? "bg-teal-800 text-white" : "bg-slate-100"}`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t(tab)}</CardTitle>
        </CardHeader>
        <CardContent>
          {tab === "transactions" && (
            <ul className="space-y-2 text-sm">
              {transactions.filter((tx) => !tx.is_reversal).map((tx) => (
                <li key={tx.id} className="flex justify-between border-b py-2">
                  <span>{tx.source_transaction_id}</span>
                  <span>{tx.transaction_date}</span>
                  <span>{formatMoney(tx.amount_ex_vat, "SAR")}</span>
                  <span className="text-slate-500">{tx.is_posted ? "posted" : "draft"}</span>
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
              {reversals.map((tx) => (
                <li key={tx.id} className="flex justify-between border-b py-2">
                  <span>{tx.source_transaction_id}</span>
                  <span>{formatMoney(tx.amount_ex_vat, "SAR")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">{tWorkspace("postedActualsNote")}</p>
    </div>
  );
}
