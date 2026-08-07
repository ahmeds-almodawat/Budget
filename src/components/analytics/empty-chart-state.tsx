"use client";

import { cn } from "@/lib/utils";

export function EmptyChartState({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-muted/40 px-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-xs text-text-secondary">{description}</p> : null}
    </div>
  );
}

export function ChartSkeleton({ className, height = 240 }: { className?: string; height?: number }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-xl border border-border bg-card p-4", className)}
      style={{ minHeight: height }}
    >
      <div className="mb-4 h-4 w-1/3 rounded bg-surface-muted" />
      <div className="h-[70%] rounded bg-surface-muted/80" />
    </div>
  );
}

export function KpiSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-xl border border-border bg-card p-5", className)}
    >
      <div className="h-3 w-24 rounded bg-surface-muted" />
      <div className="mt-3 h-7 w-32 rounded bg-surface-muted" />
      <div className="mt-2 h-3 w-20 rounded bg-surface-muted" />
    </div>
  );
}
