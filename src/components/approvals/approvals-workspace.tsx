"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { actAsDelegateAction, fetchApprovalInboxAction } from "@/app/actions/approval-actions";
import type { ApprovalTab } from "@/data/repositories/approval-repository";
import { pickLocalized } from "@/lib/i18n/display";
import { ChartCard, ExceptionSummary } from "@/components/analytics";
import { approvalAgeBuckets } from "@/domain/analytics/timeline";

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
  const tAnalytics = useTranslations("analytics");
  const [tab, setTab] = useState<ApprovalTab>(initialTab);
  const [items, setItems] = useState(initialItems);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ageBuckets = useMemo(
    () =>
      approvalAgeBuckets(
        items.map((item) => ({ createdAt: item.submitted_at ?? null })),
      ),
    [items],
  );

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
    "sourcing_award",
    "period_reopen",
    "appraisal",
  ] as const;

  function isApprovalType(value: string): value is (typeof APPROVAL_TYPE_KEYS)[number] {
    return (APPROVAL_TYPE_KEYS as readonly string[]).includes(value);
  }

  function isDelegated(item: InboxItem) {
    return Boolean(item.delegation_id) && item.effective_assignee_id === currentUserId;
  }

  function decideAsDelegate(item: InboxItem, decision: "approve" | "reject") {
    if (!item.original_assignee_id || !item.delegation_id) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        await actAsDelegateAction({
          itemType: item.item_type,
          entityId: item.entity_id,
          decision,
          originalAssigneeId: item.original_assignee_id as string,
          delegationId: item.delegation_id as string,
          comments: comments[item.entity_id] || undefined,
        });
        setItems((current) => current.filter((candidate) => candidate.entity_id !== item.entity_id));
        setMessage(t(decision === "approve" ? "delegatedApproved" : "delegatedRejected"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <ChartCard
        title={tAnalytics("sections.approvalAge")}
        empty={items.length === 0}
        emptyTitle={tAnalytics("empty.period")}
      >
        <ExceptionSummary
          items={ageBuckets.map((bucket) => ({
            id: bucket.id,
            label: tAnalytics("common.ageDays", { value: bucket.label }),
            count: bucket.count,
            tone: bucket.id === "10+" && bucket.count > 0 ? "warning" : "neutral",
          }))}
        />
      </ChartCard>

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

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

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
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        value={comments[item.entity_id] ?? ""}
                        onChange={(event) =>
                          setComments((current) => ({ ...current, [item.entity_id]: event.target.value }))
                        }
                        placeholder={t("comments")}
                        aria-label={t("comments")}
                      />
                      <Button size="sm" disabled={pending} onClick={() => decideAsDelegate(item, "approve")}>
                        {t("approveAsDelegate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending || (comments[item.entity_id]?.trim().length ?? 0) < 5}
                        onClick={() => decideAsDelegate(item, "reject")}
                      >
                        {t("rejectAsDelegate")}
                      </Button>
                    </div>
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
