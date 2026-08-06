"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  approveForecastAction,
  cancelForecastAction,
  createForecastDraftAction,
  rejectForecastAction,
  startForecastReviewAction,
  submitForecastAction,
} from "@/app/actions/forecast-actions";
import { CONTROL_SCOPE_HOSPITAL_BUDGET_2027 } from "@/types/database";
import { formatMoney } from "@/lib/money";

export interface ForecastRecord {
  id: string;
  version_label: string;
  approval_status: string;
  is_current_approved: boolean;
  forecast_cost: string;
  row_version?: number;
  as_of_date?: string | null;
  scenario?: string;
  forecast_lines?: { id: string; forecast_amount: string; fiscal_period_id: string }[];
}

interface ForecastsWorkspaceProps {
  initialForecasts: ForecastRecord[];
  defaultFiscalPeriodId: string;
  canCreate: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
}

export function ForecastsWorkspace({
  initialForecasts,
  defaultFiscalPeriodId,
  canCreate,
  canSubmit,
  canReview,
  canApprove,
}: ForecastsWorkspaceProps) {
  const t = useTranslations("forecasts");
  const tStatus = useTranslations("status");
  const [forecasts, setForecasts] = useState(initialForecasts);
  const [versionLabel, setVersionLabel] = useState("FC-DRAFT");
  const [amount, setAmount] = useState("50000");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = (updated: ForecastRecord) => {
    setForecasts((prev) => {
      const idx = prev.findIndex((f) => f.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
      return [updated, ...prev];
    });
  };

  const handleCreate = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const created = await createForecastDraftAction({
          controlScopeId: CONTROL_SCOPE_HOSPITAL_BUDGET_2027,
          versionLabel,
          lines: [
            {
              fiscalPeriodId: defaultFiscalPeriodId,
              forecastAmount: amount,
            },
          ],
        });
        setForecasts((prev) => [created as ForecastRecord, ...prev]);
        setMessage(t("created"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("createError"));
      }
    });
  };

  const runAction = (
    forecastId: string,
    action: () => Promise<ForecastRecord>,
    successKey: "submitted" | "reviewStarted" | "approved" | "rejected" | "cancelled",
  ) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = await action();
        refresh(updated as ForecastRecord);
        setMessage(t(successKey));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const statusLabel = (status: string) => {
    const key = status as "draft" | "submitted" | "under_review" | "approved" | "rejected" | "cancelled" | "locked";
    if (["draft", "submitted", "approved", "rejected"].includes(status)) {
      return tStatus(key === "under_review" ? "pending" : key);
    }
    return status;
  };

  return (
    <div className="space-y-6">
      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createDraft")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{t("versionLabel")}</label>
              <Input value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">{t("monthlyAmount")}</label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <Button disabled={pending} onClick={handleCreate}>
              {t("createDraft")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4">
        {forecasts.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-slate-600">{t("empty")}</CardContent>
          </Card>
        ) : (
          forecasts.map((forecast) => (
            <Card key={forecast.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{forecast.version_label}</CardTitle>
                <div className="flex items-center gap-2">
                  {forecast.is_current_approved ? (
                    <Badge variant="default">{t("currentApprovedBadge")}</Badge>
                  ) : null}
                  <Badge variant="outline">{statusLabel(forecast.approval_status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <div>{t("totalForecast", { amount: formatMoney(forecast.forecast_cost, "SAR") })}</div>
                <div>{t("lineCount", { count: forecast.forecast_lines?.length ?? 0 })}</div>
                {forecast.as_of_date ? <div>{t("asOfDate", { date: forecast.as_of_date })}</div> : null}
                <div className="flex flex-wrap gap-2">
                  {canSubmit && forecast.approval_status === "draft" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runAction(forecast.id, () => submitForecastAction(forecast.id), "submitted")
                      }
                    >
                      {t("submit")}
                    </Button>
                  ) : null}
                  {canReview && forecast.approval_status === "submitted" ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        runAction(forecast.id, () => startForecastReviewAction(forecast.id), "reviewStarted")
                      }
                    >
                      {t("startReview")}
                    </Button>
                  ) : null}
                  {canApprove && forecast.approval_status === "under_review" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          runAction(forecast.id, () => approveForecastAction(forecast.id), "approved")
                        }
                      >
                        {t("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() =>
                          runAction(forecast.id, () => rejectForecastAction(forecast.id), "rejected")
                        }
                      >
                        {t("reject")}
                      </Button>
                    </>
                  ) : null}
                  {canSubmit && forecast.approval_status === "draft" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() =>
                        runAction(forecast.id, () => cancelForecastAction(forecast.id), "cancelled")
                      }
                    >
                      {t("cancel")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
