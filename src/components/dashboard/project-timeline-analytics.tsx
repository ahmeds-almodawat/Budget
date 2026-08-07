"use client";

import {
  AnalyticsSection,
  ChartCard,
  CompactChronology,
  GanttTimeline,
  RoadmapTimeline,
} from "@/components/analytics";
import { buildGanttRange } from "@/domain/analytics/timeline";
import type { GanttItem } from "@/domain/analytics/types";

export function ProjectTimelineAnalytics({
  items,
  today,
  titles,
}: {
  items: GanttItem[];
  today: string;
  titles: {
    timeline: string;
    roadmap: string;
    empty: string;
  };
}) {
  const range = buildGanttRange(items);
  const empty = !items.length || !range.start || !range.end;

  return (
    <div className="space-y-6" data-testid="project-timeline-analytics">
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
