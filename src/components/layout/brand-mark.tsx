import { productConfig } from "@/config/product";

export function BrandMark({ locale, compact = false }: { locale: "en" | "ar"; compact?: boolean }) {
  const short = productConfig.shortName[locale];
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-sm"
        aria-hidden
      >
        CP
      </div>
      {!compact ? (
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-accent">
            {short}
          </div>
          <div className="truncate text-sm font-semibold leading-snug text-sidebar-foreground">
            {productConfig.company[locale]}
          </div>
        </div>
      ) : null}
    </div>
  );
}
