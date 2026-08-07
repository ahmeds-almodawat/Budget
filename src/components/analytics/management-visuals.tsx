"use client";

import { cn } from "@/lib/utils";
import type { ManagementInsight, RiskPlotPoint, VarianceItem } from "@/domain/analytics/types";
import { formatCompactMoney } from "@/domain/analytics/format";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function RiskMatrix({
  risks,
  maxScale = 5,
}: {
  risks: RiskPlotPoint[];
  maxScale?: number;
}) {
  const t = useTranslations("analytics");
  if (!risks.length) return null;
  const cells: Record<string, RiskPlotPoint[]> = {};
  for (const risk of risks) {
    const p = Math.min(maxScale, Math.max(1, Math.round(risk.probability)));
    const i = Math.min(maxScale, Math.max(1, Math.round(risk.impact)));
    const key = `${p}:${i}`;
    cells[key] = cells[key] ? [...cells[key], risk] : [risk];
  }
  return (
    <div className="overflow-x-auto" data-testid="risk-matrix">
      <div
        className="inline-grid gap-1"
        style={{ gridTemplateColumns: `repeat(${maxScale}, minmax(3.5rem, 1fr))` }}
        role="table"
        aria-label={t("common.riskMatrix")}
      >
        {Array.from({ length: maxScale }, (_, row) =>
          Array.from({ length: maxScale }, (_, col) => {
            const impact = maxScale - row;
            const probability = col + 1;
            const key = `${probability}:${impact}`;
            const list = cells[key] ?? [];
            const heat = probability * impact;
            return (
              <div
                key={key}
                role="cell"
                className={cn(
                  "min-h-14 rounded-md border border-border p-1 text-[10px]",
                  heat >= 16 && "bg-danger-surface",
                  heat >= 9 && heat < 16 && "bg-warning-surface",
                  heat < 9 && "bg-surface-muted/60",
                )}
                title={`P${probability} × I${impact}`}
              >
                {list.slice(0, 2).map((r) => (
                  <div key={r.id} className="truncate font-medium">
                    {r.label}
                  </div>
                ))}
                {list.length > 2 ? <div>+{list.length - 2}</div> : null}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

export function ExceptionSummary({
  items,
}: {
  items: Array<{ id: string; label: string; count: number; href?: string; tone?: "neutral" | "warning" | "danger" }>;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="exception-summary">
      {items.map((item) => {
        const body = (
          <div
            className={cn(
              "rounded-xl border border-border bg-card p-4",
              item.tone === "warning" && "border-warning/40",
              item.tone === "danger" && "border-danger/40",
            )}
          >
            <p className="text-sm text-text-secondary">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{item.count}</p>
          </div>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ManagementInsightCard({ insights }: { insights: ManagementInsight[] }) {
  if (!insights.length) return null;
  return (
    <ul className="space-y-2" data-testid="management-insights">
      {insights.map((insight) => {
        const content = (
          <li
            className={cn(
              "rounded-lg border border-border bg-card px-3 py-2 text-sm",
              insight.tone === "favorable" && "border-success/30",
              insight.tone === "unfavorable" && "border-danger/30",
              insight.tone === "warning" && "border-warning/30",
            )}
          >
            {insight.text}
          </li>
        );
        return insight.href ? (
          <Link key={insight.id} href={insight.href} className="block">
            {content}
          </Link>
        ) : (
          <div key={insight.id}>{content}</div>
        );
      })}
    </ul>
  );
}

export function VarianceBars({
  items,
  locale = "en",
}: {
  items: VarianceItem[];
  locale?: string;
}) {
  if (!items.length) return null;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.variance)));
  return (
    <ul className="space-y-3" data-testid="variance-bars">
      {items.map((item) => (
        <li key={item.id} className="space-y-1">
          <div className="flex justify-between gap-2 text-sm">
            <span className="truncate">{item.label}</span>
            <span
              className={cn(
                "tabular-nums",
                item.status === "favorable" && "text-success",
                item.status === "unfavorable" && "text-danger",
              )}
            >
              {formatCompactMoney(item.variance, { locale })}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-muted">
            <div
              className={cn(
                "h-full rounded-full",
                item.status === "favorable" ? "bg-success" : "bg-danger",
              )}
              style={{ width: `${(Math.abs(item.variance) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
