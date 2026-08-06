"use client";

import { useLocale, useTranslations } from "next-intl";
import { signOutAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { UserSummary } from "@/components/layout/app-shell";
import { LogOut, User } from "lucide-react";
import { pickLocalized } from "@/lib/i18n/display";

function formatRole(code: string) {
  return code.replace(/_/g, " ");
}

export function AuthUserBar({ user }: { user: UserSummary | null }) {
  const locale = useLocale();
  const t = useTranslations("auth");

  if (!user) {
    return null;
  }

  const displayName = pickLocalized(locale, user.displayName, user.displayNameAr);
  const primaryRole = user.roleCodes[0];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 shadow-sm">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-teal-800 text-white shadow-inner">
        <User className="h-4 w-4" aria-hidden />
      </div>
      <div className="hidden min-w-0 text-start sm:block">
        <div className="truncate text-sm font-semibold text-slate-900">{displayName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          {primaryRole ? (
            <Badge variant="secondary" className="capitalize">
              {formatRole(primaryRole)}
            </Badge>
          ) : null}
        </div>
      </div>
      <form action={signOutAction.bind(null, locale)}>
        <Button type="submit" variant="outline" size="sm" className="gap-1.5">
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">{t("signOut")}</span>
        </Button>
      </form>
    </div>
  );
}
