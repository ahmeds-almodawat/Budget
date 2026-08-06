import { productConfig } from "@/config/product";

export function BrandMark({ locale, compact = false }: { locale: "en" | "ar"; compact?: boolean }) {
  const short = productConfig.shortName[locale];
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-teal-700 text-sm font-bold text-white shadow-lg shadow-teal-900/30"
        aria-hidden
      >
        CP
      </div>
      {!compact ? (
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-400/90">
            {short}
          </div>
          <div className="truncate text-sm font-semibold leading-snug text-white">
            {productConfig.company[locale]}
          </div>
        </div>
      ) : null}
    </div>
  );
}
