export function pickLocalized(locale: string, english?: string | null, arabic?: string | null): string {
  const preferAr = locale === "ar";
  const primary = preferAr ? arabic : english;
  const fallback = preferAr ? english : arabic;
  return (primary?.trim() || fallback?.trim() || "");
}

export function otherLocale(locale: string): "en" | "ar" {
  return locale === "ar" ? "en" : "ar";
}

export function numberLocale(locale: string): string {
  return locale.startsWith("ar") ? "ar-SA" : "en-SA";
}
