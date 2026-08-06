"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  requestScheduleExtensionAction,
  approveScheduleExtensionAction,
} from "@/app/actions/project-actions";
import { CONTROL_SCOPE_KM_HOSPITAL } from "@/types/database";

interface ScheduleChange {
  id: string;
  requested_days: number;
  approved_days: number | null;
  gross_delay_days: number | null;
  excusable_delay_days: number | null;
  net_delay_days: number | null;
  reason: string;
  approval_status: string;
  created_at: string;
}

export function ScheduleChangesWorkflow({
  scheduleChanges,
  permissions,
}: {
  scheduleChanges: ScheduleChange[];
  permissions: { canRequest: boolean; canApprove: boolean };
}) {
  const locale = useLocale();
  const t = useTranslations("changes");
  const [requestedDays, setRequestedDays] = useState("14");
  const [grossDelay, setGrossDelay] = useState("20");
  const [excusableDelay, setExcusableDelay] = useState("6");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const netDelay = Math.max(0, Number(grossDelay) - Number(excusableDelay));
  const pendingRequest = scheduleChanges.find((r) => r.approval_status === "submitted");

  function run(action: () => Promise<unknown>, ok: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(ok);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-6">
      {message && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded bg-danger-surface p-3 text-sm text-red-800">{error}</p>}

      {permissions.canRequest && (
        <Card>
          <CardHeader>
            <CardTitle>{t("requestExtension")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{t("requestedDays")}</span>
              <Input value={requestedDays} onChange={(e) => setRequestedDays(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t("grossDelayDays")}</span>
              <Input value={grossDelay} onChange={(e) => setGrossDelay(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t("excusableDelayDays")}</span>
              <Input value={excusableDelay} onChange={(e) => setExcusableDelay(e.target.value)} />
            </label>
            <div className="flex items-end text-sm">
              <span>{t("netDelay")}: <strong>{netDelay}</strong></span>
            </div>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>{t("reason")}</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <Button
              disabled={pending || !reason}
              onClick={() =>
                run(
                  () =>
                    requestScheduleExtensionAction({
                      projectScopeId: CONTROL_SCOPE_KM_HOSPITAL,
                      requestedDays: Number(requestedDays),
                      grossDelayDays: Number(grossDelay),
                      excusableDelayDays: Number(excusableDelay),
                      reason,
                      delayReasonClass: "resource_shortage",
                    }),
                  t("extensionRequested"),
                )
              }
            >
              {t("submitRequest")}
            </Button>
          </CardContent>
        </Card>
      )}

      {permissions.canApprove && pendingRequest && (
        <Card>
          <CardHeader>
            <CardTitle>{t("approveExtension")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm">{pendingRequest.reason}</p>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => approveScheduleExtensionAction(pendingRequest.id, pendingRequest.requested_days),
                  t("extensionApproved"),
                )
              }
            >
              {t("approve")} ({pendingRequest.requested_days} {t("days")})
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("changeHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {scheduleChanges.map((r) => (
              <li key={r.id} className="border-b py-2">
                <div className="flex justify-between">
                  <span>{new Date(r.created_at).toLocaleDateString(locale)}</span>
                  <span>{r.approval_status}</span>
                </div>
                <div className="text-text-secondary">
                  {r.requested_days}d — gross {r.gross_delay_days ?? "—"}, excusable{" "}
                  {r.excusable_delay_days ?? "—"}, net {r.net_delay_days ?? "—"}
                </div>
                <div className="text-muted-foreground">{r.reason}</div>
              </li>
            ))}
            {scheduleChanges.length === 0 && (
              <li className="text-muted-foreground">{t("noRequests")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
