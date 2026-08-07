"use client";

import type { ChartToken } from "@/domain/analytics/types";

const TOKEN_VAR: Record<ChartToken, string> = {
  "chart-1": "--chart-1",
  "chart-2": "--chart-2",
  "chart-3": "--chart-3",
  "chart-4": "--chart-4",
  "chart-5": "--chart-5",
  "chart-6": "--chart-6",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
  information: "--information",
};

export function chartCssVar(token: ChartToken): string {
  return `var(${TOKEN_VAR[token]})`;
}

export function readChartColor(token: ChartToken): string {
  if (typeof window === "undefined") return chartCssVar(token);
  const value = getComputedStyle(document.documentElement).getPropertyValue(TOKEN_VAR[token]).trim();
  return value || chartCssVar(token);
}

export function chartThemeColors() {
  if (typeof window === "undefined") {
    return {
      grid: "var(--chart-grid)",
      axis: "var(--chart-axis)",
      tooltipBg: "var(--chart-tooltip)",
      tooltipFg: "var(--chart-tooltip-foreground)",
      tooltipBorder: "var(--chart-tooltip-border)",
    };
  }
  const root = getComputedStyle(document.documentElement);
  return {
    grid: root.getPropertyValue("--chart-grid").trim() || "var(--chart-grid)",
    axis: root.getPropertyValue("--chart-axis").trim() || "var(--chart-axis)",
    tooltipBg: root.getPropertyValue("--chart-tooltip").trim() || "var(--chart-tooltip)",
    tooltipFg:
      root.getPropertyValue("--chart-tooltip-foreground").trim() || "var(--chart-tooltip-foreground)",
    tooltipBorder:
      root.getPropertyValue("--chart-tooltip-border").trim() || "var(--chart-tooltip-border)",
  };
}
