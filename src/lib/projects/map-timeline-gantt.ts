import { buildProjectGanttItems, dateInTimeZone } from "@/domain/analytics/timeline";
import type { GanttItem } from "@/domain/analytics/types";
import { pickLocalized } from "@/lib/i18n/display";

type TimelinePhase = {
  id: string;
  name_en: string;
  name_ar: string;
  baseline_start: string | null;
  baseline_end: string | null;
  forecast_start: string | null;
  forecast_end: string | null;
  actual_end?: string | null;
  work_packages?: Array<{
    id: string;
    name_en: string;
    name_ar: string;
    tasks?: Array<{
      id: string;
      name_en: string;
      name_ar: string;
      baseline_start: string | null;
      baseline_end: string | null;
      forecast_start: string | null;
      forecast_end: string | null;
      actual_start?: string | null;
      actual_end?: string | null;
      progress_percent?: number | string | null;
      status?: string | null;
    }>;
  }>;
};

type TimelineMilestone = {
  id: string;
  name_en: string;
  name_ar: string;
  phase_id: string | null;
  work_package_id?: string | null;
  baseline_date: string | null;
  forecast_date: string | null;
  actual_date: string | null;
  approved_progress: number | string | null;
  approval_status?: string | null;
};

type TimelineProject = {
  id: string;
  baseline_start: string | null;
  baseline_end: string | null;
  forecast_start: string | null;
  forecast_end: string | null;
  actual_end?: string | null;
  control_scopes?: { name_en?: string | null; name_ar?: string | null } | null;
};

/** Shared mapping from repository timeline payload → Gantt presentation items. */
export function mapTimelineToGanttItems(input: {
  locale: string;
  project: TimelineProject;
  phases: TimelinePhase[];
  milestones: TimelineMilestone[];
  today?: string;
}): GanttItem[] {
  const { locale, project, phases, milestones } = input;
  const today = input.today ?? dateInTimeZone();
  const projectLabel = pickLocalized(
    locale,
    project.control_scopes?.name_en,
    project.control_scopes?.name_ar,
  );

  return buildProjectGanttItems({
    projectId: project.id,
    projectLabel,
    project: {
      baseline_start: project.baseline_start,
      baseline_end: project.baseline_end,
      forecast_start: project.forecast_start,
      forecast_end: project.forecast_end,
      actual_end: project.actual_end,
    },
    phases: phases.map((p) => ({
      id: p.id,
      name: pickLocalized(locale, p.name_en, p.name_ar),
      baseline_start: p.baseline_start,
      baseline_end: p.baseline_end,
      forecast_start: p.forecast_start,
      forecast_end: p.forecast_end,
      actual_end: p.actual_end,
      work_packages: (p.work_packages ?? []).map((wp) => ({
        id: wp.id,
        name: pickLocalized(locale, wp.name_en, wp.name_ar),
        tasks: (wp.tasks ?? []).map((task) => ({
          id: task.id,
          name: pickLocalized(locale, task.name_en, task.name_ar),
          baseline_start: task.baseline_start,
          baseline_end: task.baseline_end,
          forecast_start: task.forecast_start,
          forecast_end: task.forecast_end,
          actual_start: task.actual_start,
          actual_end: task.actual_end,
          progress_percent: task.progress_percent,
          status: task.status,
        })),
      })),
    })),
    milestones: milestones.map((m) => ({
      id: m.id,
      name: pickLocalized(locale, m.name_en, m.name_ar),
      phase_id: m.phase_id,
      work_package_id: m.work_package_id,
      baseline_date: m.baseline_date,
      forecast_date: m.forecast_date,
      actual_date: m.actual_date,
      approved_progress: m.approved_progress,
      approval_status: m.approval_status,
    })),
    today,
  });
}
