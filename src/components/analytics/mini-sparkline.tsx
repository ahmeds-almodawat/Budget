"use client";

import { cn } from "@/lib/utils";

export function MiniSparkline({
  values,
  className,
  tokenClass = "stroke-[var(--chart-1)]",
}: {
  values: number[];
  className?: string;
  tokenClass?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const width = 120;
  const height = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / span) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-7 w-full max-w-[140px]", className)}
      role="img"
      aria-hidden
    >
      <polyline
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
        className={tokenClass}
      />
    </svg>
  );
}
