"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchApprovalInboxAction } from "@/app/actions/approval-actions";
import type { ApprovalTab } from "@/data/repositories/approval-repository";
import { pickLocalized } from "@/lib/i18n/display";

const TAB_KEYS: ApprovalTab[] = ["awaiting", "submitted", "approved", "rejected", "delegated", "overdue"];

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
  const t = useTranslations("approvals");
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

const APPROVAL_TYPE_KEYS = [
  "budget",
  "budget_change",
  "import_batch",
  "milestone_progress",
  "milestone_completion",
  "schedule_extension",
  "variance_explanation",
  "contingency_use",
] as const;

function isApprovalType(value: string): value is (typeof APPROVAL_TYPE_KEYS)[number] {
  return (APPROVAL_TYPE_KEYS as readonly string[]).includes(value);
}

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TAB_KEYS.map((key) => (
          <Button
            key={key}
            variant={tab === key ? "default" : "outline"}
            size="sm"
            disabled={pending}
            onClick={() => switchTab(key)}
          >
            {t(key)} ({counts[key]})
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t(tab)}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={`${item.item_type}-${item.entity_id}`} className="border-b pb-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {pickLocalized(locale, item.title_en, item.title_ar)}
                  </span>
                  <span className="text-muted-foreground">{item.approval_status}</span>
                </div>
                <div className="text-text-secondary">
                  {isApprovalType(item.item_type)
                    ? t(`types.${item.item_type}` as Parameters<typeof t>[0])
                    : item.item_type}
                  {" · "}
                  {new Date(item.submitted_at).toLocaleDateString(locale)}
                  {item.due_date && ` · due ${item.due_date}`}
                </div>
              </li>
            ))}
            {items.length === 0 && (
              <li className="text-muted-foreground">{t("noItems")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
