"use client";

import Link from "next/link";
import {
  AnalyticsSection,
  ChartCard,
  CompactChronology,
  GanttTimeline,
  KpiCard,
  KpiGrid,
  RoadmapTimeline,
} from "@/components/analytics";
import { buildGanttRange } from "@/domain/analytics/timeline";
import type { GanttItem, KpiMetric } from "@/domain/analytics/types";

export function ProjectTimelineAnalytics({
  items,
  today,
  locale,
  titles,
  scheduleKpis = [],
}: {
  items: GanttItem[];
  today: string;
  locale: string;
  titles: {
    timeline: string;
    roadmap: string;
    empty: string;
  };
  scheduleKpis?: KpiMetric[];
}) {
  const range = buildGanttRange(items);
  const empty = !items.length || !range.start || !range.end;

  return (
    <div className="space-y-6" data-testid="project-timeline-analytics">
      {scheduleKpis.length > 0 ? (
        <div data-testid="schedule-kpis">
          <KpiGrid className="xl:grid-cols-5">
            {scheduleKpis.map((kpi) => (
              <KpiCard key={kpi.id} metric={kpi} locale={locale} />
            ))}
          </KpiGrid>
        </div>
      ) : null}

      <AnalyticsSection title={titles.timeline}>
        <ChartCard title={titles.timeline} empty={empty} emptyTitle={titles.empty}>
          <div className="space-y-4">
            <div className="hidden md:block">
              <GanttTimeline items={items} today={today} />
            </div>
            <CompactChronology items={items} />
          </div>
        </ChartCard>
      </AnalyticsSection>

      <AnalyticsSection title={titles.roadmap}>
        <ChartCard title={titles.roadmap} empty={empty} emptyTitle={titles.empty}>
          <RoadmapTimeline items={items} />
        </ChartCard>
      </AnalyticsSection>
    </div>
  );
}

/** Compact executive schedule preview for the project overview. */
export function ProjectSchedulePreview({
  items,
  today,
  locale,
  href,
  title,
  viewFullLabel,
  emptyTitle,
  scheduleKpis = [],
}: {
  items: GanttItem[];
  today: string;
  locale: string;
  href: string;
  title: string;
  viewFullLabel: string;
  emptyTitle: string;
  scheduleKpis?: KpiMetric[];
}) {
  const range = buildGanttRange(items);
  const empty = !items.length || !range.start || !range.end;

  return (
    <section className="space-y-3" data-testid="project-schedule-preview">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <Link
          href={href}
          className="text-sm font-medium text-primary hover:underline"
          data-testid="view-full-timeline"
        >
          {viewFullLabel}
        </Link>
      </div>

      {scheduleKpis.length > 0 ? (
        <div data-testid="schedule-kpis">
          <KpiGrid className="xl:grid-cols-5">
            {scheduleKpis.map((kpi) => (
              <KpiCard key={kpi.id} metric={kpi} locale={locale} />
            ))}
          </KpiGrid>
        </div>
      ) : null}

      <ChartCard title={title} empty={empty} emptyTitle={emptyTitle}>
        <div className="space-y-3">
          <div className="hidden md:block">
            <GanttTimeline items={items} today={today} compact />
          </div>
          <CompactChronology items={items} />
        </div>
      </ChartCard>
    </section>
  );
}
