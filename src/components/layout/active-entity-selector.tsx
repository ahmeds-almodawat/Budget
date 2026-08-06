"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  fetchSelectableLegalEntitiesAction,
  getActiveLegalEntityIdAction,
  setActiveLegalEntityAction,
} from "@/app/actions/context-actions";
import type { UserSummary } from "@/components/layout/app-shell";

export function ActiveEntitySelector({ user }: { user: UserSummary | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [entities, setEntities] = useState<{ id: string; code: string; name_en: string; name_ar: string }[]>([]);
  const [activeId, setActiveId] = useState<string | null>(user?.primaryLegalEntityId ?? null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [list, current] = await Promise.all([
        fetchSelectableLegalEntitiesAction(),
        getActiveLegalEntityIdAction(),
      ]);
      setEntities(list);
      setActiveId(current ?? list[0]?.id ?? null);
    })().catch(() => undefined);
  }, [user]);

  if (!user || entities.length <= 1) {
    return null;
  }

  return (
    <label className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
      <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <span className="sr-only">Active legal entity</span>
      <select
        className="max-w-[12rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:opacity-60 sm:max-w-xs"
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
