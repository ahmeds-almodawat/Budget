"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  setActiveLegalEntityAction,
} from "@/app/actions/context-actions";
import type { UserSummary } from "@/components/layout/app-shell";

export function ActiveEntitySelector({ user }: { user: UserSummary | null }) {
  const t = useTranslations("shell");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const entities = user?.legalEntities ?? [];
  const [activeId, setActiveId] = useState<string | null>(
    user?.activeLegalEntityId ?? user?.primaryLegalEntityId ?? null,
  );

  if (!user || entities.length <= 1) {
    return null;
  }

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">{t("activeLegalEntity")}</span>
      <select
        className="max-w-[12rem] truncate rounded-lg border border-input bg-input-background px-2 py-1.5 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60 sm:max-w-xs"
        value={activeId ?? ""}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setActiveLegalEntityAction(next);
            setActiveId(next);
            router.refresh();
          });
        }}
      >
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.code}
          </option>
        ))}
      </select>
    </label>
  );
}
