"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyProgressAction } from "@/app/actions/project-actions";
import { pickLocalized } from "@/lib/i18n/display";
import { useLocale } from "next-intl";

interface PendingUpdate {
  id: string;
  reported_progress: number;
  notes: string | null;
  created_at: string;
  milestones: {
    id: string;
    code: string;
    name_en: string;
    name_ar: string;
  } | null;
}

export function ProgressApprovalWorkflow({ updates }: { updates: PendingUpdate[] }) {
  const locale = useLocale();
  const t = useTranslations("milestones");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function verify(updateId: string, progress: number) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await verifyProgressAction({ progressUpdateId: updateId, verifiedProgress: progress });
        setMessage(t("progressVerified"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {message && <p className="rounded bg-success-surface p-3 text-sm text-success">{message}</p>}
      {error && <p className="rounded bg-danger-surface p-3 text-sm text-danger">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{t("awaitingVerification")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className="flex items-center justify-between border-b pb-4">
                <div>
                  <div className="font-medium">
                    {pickLocalized(locale, u.milestones?.name_en, u.milestones?.name_ar)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {u.milestones?.code} — {u.reported_progress}%
                  </div>
                  {u.notes && <div className="text-sm text-text-secondary">{u.notes}</div>}
                </div>
                <Button disabled={pending} onClick={() => verify(u.id, u.reported_progress)}>
                  {t("verify")}
                </Button>
              </li>
            ))}
            {updates.length === 0 && (
              <li className="text-muted-foreground">{t("noPendingUpdates")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
