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
  original_assignee_id?: string | null;
  effective_assignee_id?: string | null;
  delegation_id?: string | null;
  requester_id?: string | null;
}

export function ApprovalsWorkspace({
  initialTab,
  initialItems,
  counts,
  currentUserId,
}: {
  initialTab: ApprovalTab;
  initialItems: InboxItem[];
  counts: Record<ApprovalTab, number>;
  currentUserId: string;
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
    "delegation",
    "purchase_requisition",
    "approval_rule",
    "purchase_order",
    "payment_request",
    "period_reopen",
    "appraisal",
  ] as const;

  function isApprovalType(value: string): value is (typeof APPROVAL_TYPE_KEYS)[number] {
    return (APPROVAL_TYPE_KEYS as readonly string[]).includes(value);
  }

  function isDelegated(item: InboxItem) {
    return Boolean(item.delegation_id) && item.effective_assignee_id === currentUserId;
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
            {items.map((item) => {
              const delegated = isDelegated(item);
              return (
                <li key={`${item.item_type}-${item.entity_id}`} className="border-b border-border pb-3 text-sm">
                  <div className="flex justify-between gap-2">
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
                  {delegated ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      {t("actingFor", {
                        original: item.original_assignee_id?.slice(0, 8) ?? "—",
                      })}
                    </p>
                  ) : item.original_assignee_id &&
                    item.effective_assignee_id &&
                    item.original_assignee_id !== item.effective_assignee_id ? (
                    <p className="mt-1 text-xs text-text-secondary">
                      {t("originalVsEffective", {
                        original: item.original_assignee_id.slice(0, 8),
                        effective: item.effective_assignee_id.slice(0, 8),
                      })}
                    </p>
                  ) : null}
                  {delegated && (tab === "awaiting" || tab === "delegated" || tab === "overdue") ? (
                    <p className="mt-2 text-xs text-warning">{t("delegatedReadOnly")}</p>
                  ) : null}
                </li>
              );
            })}
            {items.length === 0 && (
              <li className="text-muted-foreground">{t("noItems")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
