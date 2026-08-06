"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

export function WorkspaceDenied() {
  const t = useTranslations("common");
  return (
    <Card>
      <CardContent className="p-6 text-sm text-red-700">{t("accessDenied")}</CardContent>
    </Card>
  );
}

export function WorkspaceError({ message }: { message: string }) {
  const t = useTranslations("workspace");
  return (
    <Card>
      <CardContent className="p-6 text-sm text-red-700">
        {t("databaseError")}: {message}
      </CardContent>
    </Card>
  );
}

export function WorkspaceEmpty({ message }: { message?: string }) {
  const t = useTranslations("common");
  return (
    <Card>
      <CardContent className="p-6 text-sm text-slate-600">{message ?? t("empty")}</CardContent>
    </Card>
  );
}

export function WorkspaceLoading() {
  const t = useTranslations("common");
  return (
    <Card>
      <CardContent className="p-6 text-sm text-slate-500">{t("loading")}</CardContent>
    </Card>
  );
}
