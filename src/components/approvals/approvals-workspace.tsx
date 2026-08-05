"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchApprovalInboxAction } from "@/app/actions/approval-actions";
import type { ApprovalTab } from "@/data/repositories/approval-repository";

const TABS: { key: ApprovalTab; en: string; ar: string }[] = [
  { key: "awaiting", en: "Awaiting my approval", ar: "بانتظار اعتمادي" },
  { key: "submitted", en: "Submitted by me", ar: "قدمتها أنا" },
  { key: "approved", en: "Approved", ar: "معتمدة" },
  { key: "rejected", en: "Rejected", ar: "مرفوضة" },
  { key: "delegated", en: "Delegated", ar: "مفوضة" },
  { key: "overdue", en: "Overdue", ar: "متأخرة" },
];

const TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  budget: { en: "Budget", ar: "ميزانية" },
  budget_change: { en: "Budget change", ar: "تغيير ميزانية" },
  import_batch: { en: "Import batch", ar: "دفعة استيراد" },
  milestone_progress: { en: "Milestone progress", ar: "تقدم معلم" },
  milestone_completion: { en: "Milestone completion", ar: "اكتمال معلم" },
  schedule_extension: { en: "Schedule extension", ar: "تمديد جدول" },
  variance_explanation: { en: "Variance explanation", ar: "تفسير انحراف" },
  contingency_use: { en: "Contingency use", ar: "استخدام احتياطي" },
};

interface InboxItem {
  entity_id: string;
  item_type: string;
  title_en: string;
  title_ar: string;
  approval_status: string;
  submitted_at: string;
  due_date: string | null;
}

export function ApprovalsWorkspace({
  initialTab,
  initialItems,
  counts,
}: {
  initialTab: ApprovalTab;
  initialItems: InboxItem[];
  counts: Record<ApprovalTab, number>;
}) {
  const locale = useLocale();
  const [tab, setTab] = useState<ApprovalTab>(initialTab);
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();

  function switchTab(next: ApprovalTab) {
    setTab(next);
    startTransition(async () => {
      const result = await fetchApprovalInboxAction(next);
      setItems(result ?? []);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Button
            key={t.key}
            variant={tab === t.key ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => switchTab(t.key)}
          >
            {locale === "ar" ? t.ar : t.en} ({counts[t.key]})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {locale === "ar"
              ? TABS.find((t) => t.key === tab)?.ar
              : TABS.find((t) => t.key === tab)?.en}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={`${item.item_type}-${item.entity_id}`} className="border-b pb-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {locale === "ar" ? item.title_ar : item.title_en}
                  </span>
                  <span className="text-slate-500">{item.approval_status}</span>
                </div>
                <div className="text-slate-600">
                  {locale === "ar"
                    ? TYPE_LABELS[item.item_type]?.ar ?? item.item_type
                    : TYPE_LABELS[item.item_type]?.en ?? item.item_type}
                  {" · "}
                  {new Date(item.submitted_at).toLocaleDateString(locale)}
                  {item.due_date && ` · due ${item.due_date}`}
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-slate-500">
                {locale === "ar" ? "لا توجد عناصر" : "No items in this queue"}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
