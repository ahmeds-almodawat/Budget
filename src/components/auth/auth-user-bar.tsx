"use client";

import { useLocale, useTranslations } from "next-intl";
import { signOutAction } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import type { UserSummary } from "@/components/layout/app-shell";

export function AuthUserBar({ user }: { user: UserSummary | null }) {
  const locale = useLocale();
  const t = useTranslations("auth");

  if (!user) {
    return null;
  }

  const displayName = locale === "ar" && user.displayNameAr ? user.displayNameAr : user.displayName;

  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="text-end">
        <div className="font-medium text-slate-900">{displayName}</div>
        <div className="text-xs text-slate-500">
          {user.roleCodes.join(", ")}
          {user.primaryLegalEntityId ? ` · ${user.primaryLegalEntityId.slice(0, 8)}…` : ""}
        </div>
      </div>
      <form action={signOutAction.bind(null, locale)}>
        <Button type="submit" variant="outline" size="sm">
          {t("signOut")}
        </Button>
      </form>
    </div>
  );
}
