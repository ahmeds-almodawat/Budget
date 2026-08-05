"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

type Tab = "commitments" | "pos" | "contracts" | "invoices" | "payments" | "creditNotes";

export function CommitmentsWorkspace({
  commitments,
  vendors,
}: {
  commitments: {
    id: string;
    reference_number: string;
    description: string | null;
    original_value: string;
    approved_variations: string;
    invoiced_applied: string;
    openCommitment: string;
    approval_status: string;
    vendors: { code: string; name_en: string } | null;
  }[];
  vendors: { id: string; code: string; name_en: string; name_ar: string; status: string }[];
}) {
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("commitments");

  const tabs: { key: Tab; en: string; ar: string }[] = [
    { key: "commitments", en: "Commitments", ar: "الالتزامات" },
    { key: "pos", en: "Purchase orders", ar: "أوامر الشراء" },
    { key: "contracts", en: "Contracts", ar: "العقود" },
    { key: "invoices", en: "Invoices", ar: "الفواتير" },
    { key: "payments", en: "Payments", ar: "المدفوعات" },
    { key: "creditNotes", en: "Credit notes", ar: "إشعارات دائنة" },
  ];

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

      {tab === "commitments" && (
        <Card>
          <CardHeader><CardTitle>{locale === "ar" ? "الالتزامات" : "Commitments"}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {commitments.map((c) => (
                <li key={c.id} className="border-b py-2">
                  <div className="flex justify-between font-medium">
                    <span>{c.reference_number}</span>
                    <span>{c.approval_status}</span>
                  </div>
                  <div className="text-slate-600">{c.description}</div>
                  <div className="flex justify-between text-slate-500">
                    <span>{formatMoney(c.original_value, "SAR")}</span>
                    <span>{locale === "ar" ? "مفتوح" : "Open"}: {formatMoney(c.openCommitment, "SAR")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {tab === "pos" && (
        <Card>
          <CardContent className="p-4 text-sm text-slate-600">
            {commitments.filter((c) => c.reference_number.startsWith("PO-")).map((c) => (
              <div key={c.id} className="border-b py-2">{c.reference_number} — {formatMoney(c.original_value, "SAR")}</div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab !== "commitments" && tab !== "pos" && (
        <Card>
          <CardContent className="p-4 text-sm text-slate-500">
            {locale === "ar"
              ? "لا توجد سجلات في هذه الفئة بعد — الالتزامات والموردون متاحون."
              : "No records in this category yet — commitments and vendors are available."}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{locale === "ar" ? "الموردون" : "Vendors"}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {vendors.map((v) => (
              <li key={v.id}>{v.code} — {locale === "ar" ? v.name_ar : v.name_en}</li>
            ))}
            {vendors.length === 0 && <li className="text-slate-500">{locale === "ar" ? "لا يوجد" : "None"}</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
