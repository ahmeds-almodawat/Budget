"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { verifyProgressAction } from "@/app/actions/project-actions";

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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function verify(updateId: string, progress: number) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await verifyProgressAction({ progressUpdateId: updateId, verifiedProgress: progress });
        setMessage(locale === "ar" ? "تم التحقق" : "Progress verified");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {message && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "بانتظار التحقق" : "Awaiting verification"}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-4">
            {updates.map((u) => (
              <li key={u.id} className="flex items-center justify-between border-b pb-4">
                <div>
                  <div className="font-medium">
                    {locale === "ar" ? u.milestones?.name_ar : u.milestones?.name_en}
                  </div>
                  <div className="text-sm text-slate-500">
                    {u.milestones?.code} — {u.reported_progress}%
                  </div>
                  {u.notes && <div className="text-sm text-slate-600">{u.notes}</div>}
                </div>
                <Button disabled={pending} onClick={() => verify(u.id, u.reported_progress)}>
                  {locale === "ar" ? "تحقق" : "Verify"}
                </Button>
              </li>
            ))}
            {updates.length === 0 && (
              <li className="text-slate-500">
                {locale === "ar" ? "لا توجد تحديثات معلقة" : "No pending updates"}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
