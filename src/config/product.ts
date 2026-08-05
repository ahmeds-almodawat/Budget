/**
 * Central branding and product configuration.
 * Change product name, colors, and company references here only.
 */
export const productConfig = {
  workingName: {
    en: "Enterprise Project, Budget and Performance Control",
    ar: "منصة إدارة المشاريع والميزانيات وقياس الأداء",
  },
  shortName: {
    en: "Control Platform",
    ar: "منصة التحكم",
  },
  company: {
    en: "Al Modawat Group",
    ar: "مجموعة المداوات",
  },
  logo: {
    light: "/brand/logo-light.svg",
    dark: "/brand/logo-dark.svg",
  },
  colors: {
    primary: "#0f766e",
    primaryForeground: "#ffffff",
    secondary: "#1e3a5f",
    accent: "#c9a227",
    success: "#15803d",
    warning: "#ca8a04",
    danger: "#b91c1c",
  },
} as const;

export const financialConfig = {
  defaultCurrency: "SAR",
  defaultTimezone: "Asia/Riyadh",
  defaultFinancialYearStartMonth: 1,
  defaultLocale: "en" as const,
  supportedLocales: ["en", "ar"] as const,
  supportedCurrencies: ["SAR", "USD", "EUR"] as const,
  monetaryDisplayDecimals: 2,
  monetaryDbPrecision: { precision: 18, scale: 4 },
  percentageDisplayDecimals: 2,
  defaultVarianceThresholdAmount: "25000",
  defaultVarianceThresholdPercent: "10",
  defaultPerformanceWeights: {
    schedule: 35,
    cost: 35,
    quality: 20,
    governance: 10,
  },
} as const;

export type SupportedLocale = (typeof financialConfig.supportedLocales)[number];
