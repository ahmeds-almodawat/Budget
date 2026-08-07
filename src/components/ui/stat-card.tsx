import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-[var(--shadow)] transition-shadow duration-200 hover:shadow-[var(--shadow-card)]",
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-primary opacity-80" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
          {hint ? (
            <p
              className={cn(
                "mt-1 text-xs",
                trend === "up" && "text-success",
                trend === "down" && "text-danger",
                (!trend || trend === "neutral") && "text-muted-foreground",
              )}
            >
              {hint}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-information-surface text-information ring-1 ring-border">
            <Icon className="h-5 w-5" aria-hidden />
          </div>
        ) : null}
      </div>
    </div>
  );
}
