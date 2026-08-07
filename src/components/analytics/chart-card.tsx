"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyChartState } from "@/components/analytics/empty-chart-state";

export function ChartCard({
  title,
  description,
  children,
  empty,
  emptyTitle,
  emptyDescription,
  className,
  actions,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? <p className="mt-1 text-xs text-text-secondary">{description}</p> : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyChartState
            title={emptyTitle ?? "No data available for the selected period"}
            description={emptyDescription}
          />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
