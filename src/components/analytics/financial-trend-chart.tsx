"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartPoint, ChartSeriesDef } from "@/domain/analytics/types";
import { chartCssVar, chartThemeColors } from "@/components/analytics/chart-theme";
import {
  formatCompactPercent,
  formatExactMoney,
  formatInteger,
  formatRatio,
} from "@/domain/analytics/format";
import { useTranslations } from "next-intl";

function formatSeriesValue(
  value: number | null | undefined,
  definition: ChartSeriesDef | undefined,
  locale: string,
) {
  if (value == null) return "—";
  if (definition?.valueKind === "percent") return formatCompactPercent(value, locale);
  if (definition?.valueKind === "number") return formatInteger(value, locale);
  if (definition?.valueKind === "ratio") return formatRatio(value, locale);
  return formatExactMoney(value, { locale });
}

function AccessibleChartTable({
  data,
  series,
  locale,
  caption,
}: {
  data: ChartPoint[];
  series: ChartSeriesDef[];
  locale: string;
  caption: string;
}) {
  return (
    <div className="sr-only overflow-hidden">
    <table>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{caption}</th>
          {series.map((definition) => (
            <th key={definition.key} scope="col">{definition.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((point) => (
          <tr key={point.key}>
            <th scope="row">{point.label}</th>
            {series.map((definition) => (
              <td key={definition.key}>
                {formatSeriesValue(
                  typeof point[definition.key] === "number"
                    ? (point[definition.key] as number)
                    : null,
                  definition,
                  locale,
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  series,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string }>;
  label?: string;
  locale: string;
  series: ChartSeriesDef[];
}) {
  if (!active || !payload?.length) return null;
  const theme = chartThemeColors();
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{
        background: theme.tooltipBg,
        color: theme.tooltipFg,
        borderColor: theme.tooltipBorder,
      }}
    >
      <p className="mb-1 font-medium">{label}</p>
      <ul className="space-y-0.5">
        {payload.map((entry) => {
          const definition = series.find((item) => item.key === entry.dataKey);
          const value = entry.value;
          const formatted = formatSeriesValue(value, definition, locale);
          return (
            <li key={String(entry.dataKey)} className="flex justify-between gap-4 tabular-nums">
              <span style={{ color: entry.color }}>{entry.name}</span>
              <span>{formatted}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FinancialTrendChart({
  data,
  series,
  mode = "line",
  locale = "en-SA",
  height = 280,
}: {
  data: ChartPoint[];
  series: ChartSeriesDef[];
  mode?: "line" | "area" | "bar";
  locale?: string;
  height?: number;
}) {
  const t = useTranslations("analytics");
  const theme = useMemo(() => chartThemeColors(), []);
  if (!data.length) return null;

  const common = (
    <>
      <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
      <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 12 }} />
      <YAxis tick={{ fill: theme.axis, fontSize: 12 }} width={64} />
      <Tooltip content={<ChartTooltip locale={locale} series={series} />} />
      <Legend />
    </>
  );

  return (
    <div className="h-[280px] w-full" style={{ height }} data-testid="financial-trend-chart">
      <AccessibleChartTable
        data={data}
        series={series}
        locale={locale}
        caption={t("common.chartData")}
      />
      <ResponsiveContainer width="100%" height="100%">
        {mode === "bar" ? (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={chartCssVar(s.token)} radius={4} />
            ))}
          </BarChart>
        ) : mode === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={chartCssVar(s.token)}
                fill={chartCssVar(s.token)}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={chartCssVar(s.token)}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryBarChart({
  data,
  series,
  layout = "vertical",
  locale = "en-SA",
  height = 280,
}: {
  data: ChartPoint[];
  series: ChartSeriesDef[];
  layout?: "vertical" | "horizontal";
  locale?: string;
  height?: number;
}) {
  const t = useTranslations("analytics");
  const theme = useMemo(() => chartThemeColors(), []);
  if (!data.length) return null;

  return (
    <div className="w-full" style={{ height }} data-testid="category-bar-chart">
      <AccessibleChartTable
        data={data}
        series={series}
        locale={locale}
        caption={t("common.chartData")}
      />
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout === "horizontal" ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke={theme.grid} strokeDasharray="3 3" />
          {layout === "horizontal" ? (
            <>
              <XAxis type="number" tick={{ fill: theme.axis, fontSize: 12 }} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fill: theme.axis, fontSize: 11 }} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 12 }} />
              <YAxis tick={{ fill: theme.axis, fontSize: 12 }} width={64} />
            </>
          )}
          <Tooltip content={<ChartTooltip locale={locale} series={series} />} />
          <Legend />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={chartCssVar(s.token)} radius={4} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
