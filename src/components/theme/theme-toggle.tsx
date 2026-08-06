"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/theme/theme-provider";
import { cn } from "@/lib/utils";
import type { ThemePreference } from "@/lib/theme/theme";

const OPTIONS: { value: ThemePreference; icon: typeof Sun; labelKey: "light" | "dark" | "system" }[] = [
  { value: "light", icon: Sun, labelKey: "light" },
  { value: "dark", icon: Moon, labelKey: "dark" },
  { value: "system", icon: Monitor, labelKey: "system" },
];

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const { preference, setPreference } = useTheme();

  function selectByKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % OPTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = OPTIONS.length - 1;
    }

    if (nextIndex === null) return;
    event.preventDefault();
    const next = OPTIONS[nextIndex];
    setPreference(next.value);
    const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="radio"]',
    );
    radios?.[nextIndex]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      data-testid="theme-toggle"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5",
        className,
      )}
    >
      {OPTIONS.map(({ value, icon: Icon, labelKey }, index) => {
        const selected = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            aria-label={t(labelKey)}
            data-testid={`theme-${value}`}
            title={t(labelKey)}
            onClick={() => setPreference(value)}
            onKeyDown={(event) => selectByKeyboard(event, index)}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
