"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

type Tab = "commitments" | "pos";

const TAB_LABEL_KEYS = {
  commitments: "commitments",
  pos: "purchaseOrders",
} as const satisfies Record<Tab, string>;

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
  const t = useTranslations("commitments");
  const tWorkspace = useTranslations("workspace");
  const [tab, setTab] = useState<Tab>("commitments");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL_KEYS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === key ? "bg-primary text-primary-foreground" : "bg-surface-muted text-foreground"}`}
          >
            {t(TAB_LABEL_KEYS[key])}
          </button>
        ))}
      </div>

      {tab === "commitments" && (
        <Card>
          <CardHeader><CardTitle>{t("commitments")}</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {commitments.map((c) => (
                <li key={c.id} className="border-b py-2">
                  <div className="flex justify-between font-medium">
                    <span>{c.reference_number}</span>
                    <span>{c.approval_status}</span>
                  </div>
                  <div className="text-text-secondary">{c.description}</div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{formatMoney(c.original_value, "SAR")}</span>
                    <span>{tWorkspace("open")}: {formatMoney(c.openCommitment, "SAR")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {tab === "pos" && (
        <Card>
          <CardContent className="p-4 text-sm text-text-secondary">
            {commitments.filter((c) => c.reference_number.startsWith("PO-")).map((c) => (
              <div key={c.id} className="border-b py-2">{c.reference_number} — {formatMoney(c.original_value, "SAR")}</div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>{tWorkspace("vendors")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {vendors.map((v) => (
              <li key={v.id}>{v.code} — {pickLocalized(locale, v.name_en, v.name_ar)}</li>
            ))}
            {vendors.length === 0 && <li className="text-muted-foreground">{tWorkspace("none")}</li>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
