"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { KpiMetric } from "@/domain/analytics/types";
import { formatCompactPercent, varianceTone } from "@/domain/analytics/format";
import { MiniSparkline } from "@/components/analytics/mini-sparkline";

export function KpiGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
  );
}

export function KpiCard({
  metric,
  locale = "en",
  className,
}: {
  metric: KpiMetric;
  locale?: string;
  className?: string;
}) {
  const tone = varianceTone(metric.varianceStatus);
  const body = (
    <article
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[var(--shadow)]",
        className,
      )}
      aria-label={metric.label}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/80" />
      <p className="text-sm font-medium text-text-secondary">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {metric.formattedValue}
        {metric.unit ? <span className="ms-1 text-sm font-normal text-text-secondary">{metric.unit}</span> : null}
      </p>
      {metric.subtitle ? <p className="mt-1 text-xs text-text-secondary">{metric.subtitle}</p> : null}
      {metric.variance != null || metric.variancePercent != null ? (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            tone === "favorable" && "text-success",
            tone === "unfavorable" && "text-danger",
            tone === "neutral" && "text-text-secondary",
          )}
        >
          <span className="sr-only">{metric.varianceStatus ?? "neutral"}: </span>
          {metric.variancePercent != null
            ? formatCompactPercent(metric.variancePercent * 100, locale)
            : null}
          {metric.comparisonLabel ? ` · ${metric.comparisonLabel}` : null}
        </p>
      ) : null}
      {metric.sparkline && metric.sparkline.length > 1 ? (
        <div className="mt-3">
          <MiniSparkline values={metric.sparkline} />
        </div>
      ) : null}
    </article>
  );

  if (metric.href) {
    return (
      <Link href={metric.href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    );
  }
  return body;
}
