"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { WaterfallStep } from "@/domain/analytics/types";
import { waterfallDisplayBars } from "@/domain/analytics/bridges";
import { formatExactMoney } from "@/domain/analytics/format";
import { chartCssVar, chartThemeColors } from "@/components/analytics/chart-theme";

export function WaterfallChart({
  steps,
  locale = "en-SA",
  height = 300,
}: {
  steps: WaterfallStep[];
  locale?: string;
  height?: number;
}) {
  const theme = useMemo(() => chartThemeColors(), []);
  const bars = useMemo(() => waterfallDisplayBars(steps), [steps]);
  if (!bars.length) return null;

  const chartData = bars.map((b) => {
    const low = Math.min(b.start, b.end);
    const high = Math.max(b.start, b.end);
    return {
      ...b,
      base: low,
      rise: high - low,
    };
  });

  return (
    <div className="w-full" style={{ height }} data-testid="waterfall-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" interval={0} angle={-20} textAnchor="end" height={60} tick={{ fill: theme.axis, fontSize: 11 }} />
          <YAxis tick={{ fill: theme.axis, fontSize: 12 }} width={64} />
          <Tooltip
            formatter={(value, _name, item) => {
              const raw = (item?.payload as { value?: number } | undefined)?.value ?? Number(value);
              return formatExactMoney(raw, { locale });
            }}
          />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="rise" stackId="a" radius={4}>
            {chartData.map((entry) => (
              <Cell
                key={entry.id}
                fill={
                  entry.kind === "total"
                    ? chartCssVar("chart-1")
                    : entry.value >= 0
                      ? chartCssVar("success")
                      : chartCssVar("danger")
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
