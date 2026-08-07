"use client";

import { cn } from "@/lib/utils";
import type { PipelineStage, TimelineEvent } from "@/domain/analytics/types";
import { formatCompactMoney, formatInteger } from "@/domain/analytics/format";
import { sortTimelineEvents } from "@/domain/analytics/timeline";
import { useTranslations } from "next-intl";

export function ProgressBar({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("space-y-1", className)}>
      {label ? (
        <div className="flex justify-between text-xs text-text-secondary">
          <span>{label}</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ProgressRing({
  value,
  max = 100,
  size = 88,
  label,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="inline-flex flex-col items-center gap-1" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--border)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--chart-1)"
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm font-semibold tabular-nums">{Math.round(pct)}%</span>
      {label ? <span className="text-xs text-text-secondary">{label}</span> : null}
    </div>
  );
}

export function ProgressStepper({
  steps,
  currentIndex,
}: {
  steps: Array<{ id: string; label: string }>;
  currentIndex: number;
}) {
  const t = useTranslations("analytics");
  return (
    <ol className="flex flex-wrap gap-2" aria-label={t("common.lifecycle")}>
      {steps.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li
            key={step.id}
            className={cn(
              "rounded-full border px-3 py-1 text-xs",
              done && "border-success/40 bg-success-surface text-success",
              active && "border-primary bg-primary/10 text-primary",
              !done && !active && "border-border text-text-secondary",
            )}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function PipelineFunnel({
  stages,
  locale = "en",
  arabicCurrency = false,
}: {
  stages: PipelineStage[];
  locale?: string;
  arabicCurrency?: boolean;
}) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ul className="space-y-3" data-testid="pipeline-funnel">
      {stages.map((stage) => (
        <li key={stage.id} className="space-y-1">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{stage.label}</span>
            <span className="tabular-nums text-text-secondary">
              {formatInteger(stage.count, locale)} ·{" "}
              {stage.amount == null
                ? "—"
                : formatCompactMoney(stage.amount, { locale, arabicCurrency })}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-[var(--chart-3)]"
              style={{ width: `${(stage.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StatusTimeline({ events }: { events: TimelineEvent[] }) {
  const ordered = sortTimelineEvents(events);
  if (!ordered.length) return null;
  return (
    <ol className="relative space-y-4 border-s border-border ps-4" data-testid="status-timeline">
      {ordered.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -start-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--chart-1)] ring-4 ring-background" />
          <p className="text-sm font-medium">{event.label}</p>
          <p className="text-xs text-text-secondary tabular-nums">
            {event.at ?? "—"}
            {event.status ? ` · ${event.status}` : ""}
          </p>
          {event.detail ? <p className="mt-0.5 text-xs text-text-secondary">{event.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}
