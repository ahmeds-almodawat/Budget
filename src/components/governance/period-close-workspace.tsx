"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { softClosePeriodAction, hardClosePeriodAction, reopenPeriodAction } from "@/app/actions/governance-actions";

const MODULES = ["budgets", "actuals", "procurement", "forecasts", "projects", "reporting"] as const;

export interface PeriodControlRow {
  id: string;
  module: string;
  control_state: string;
  fiscal_period_id: string;
  fiscal_periods?: { period_number: number; start_date: string; end_date: string } | null;
}

export function PeriodCloseWorkspace({
  initialControls,
  fiscalPeriods,
  canClose,
}: {
  initialControls: PeriodControlRow[];
  fiscalPeriods: { id: string; period_number: number; start_date: string; end_date: string }[];
  canClose: boolean;
}) {
  const t = useTranslations("periodClose");
  const [controls, setControls] = useState(initialControls);
  const [selectedPeriod, setSelectedPeriod] = useState(fiscalPeriods[0]?.id ?? "");
  const [reopenReason, setReopenReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSoftClose = (module: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await softClosePeriodAction({
          fiscalPeriodId: selectedPeriod,
          module,
        })) as PeriodControlRow[];
        setControls(updated);
        setMessage(t("softClosed", { module: t(`modules.${module}`) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleHardClose = (module: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await hardClosePeriodAction({
          fiscalPeriodId: selectedPeriod,
          module,
        })) as PeriodControlRow[];
        setControls(updated);
        setMessage(t("hardClosed", { module: t(`modules.${module}`) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleReopen = (module: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await reopenPeriodAction({
          fiscalPeriodId: selectedPeriod,
          module,
          reason: reopenReason,
        })) as PeriodControlRow[];
        setControls(updated);
        setMessage(t("reopened", { module: t(`modules.${module}`) }));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("calendar")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="period-select" className="text-xs font-medium text-text-secondary">
              {t("selectPeriod")}
            </label>
            <select
              id="period-select"
              className="rounded-md border border-border px-3 py-2 text-sm"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
            >
              {fiscalPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {t("periodLabel", { number: p.period_number, start: p.start_date, end: p.end_date })}
                </option>
              ))}
            </select>
          </div>
          {canClose ? (
            <>
              <div className="space-y-1">
                <label htmlFor="reopen-reason" className="text-xs font-medium text-text-secondary">
                  {t("reopenReason")}
                </label>
                <input
                  id="reopen-reason"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((mod) => (
                  <Button key={`soft-${mod}`} size="sm" variant="secondary" disabled={pending} onClick={() => handleSoftClose(mod)}>
                    {t("softCloseModule", { module: t(`modules.${mod}`) })}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((mod) => (
                  <Button key={`hard-${mod}`} size="sm" variant="destructive" disabled={pending} onClick={() => handleHardClose(mod)}>
                    {t("hardCloseModule", { module: t(`modules.${mod}`) })}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((mod) => (
                  <Button
                    key={`reopen-${mod}`}
                    size="sm"
                    variant="outline"
                    disabled={pending || !reopenReason.trim()}
                    onClick={() => handleReopen(mod)}
                  >
                    {t("reopenModule", { module: t(`modules.${mod}`) })}
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("moduleStatus")}</CardTitle>
        </CardHeader>
        <CardContent>
          {controls.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("allOpen")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {controls.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b py-2">
                  <span>{t(`modules.${c.module}`)} — {t("periodLabelShort", { number: c.fiscal_periods?.period_number ?? "?" })}</span>
                  <Badge variant="outline">{c.control_state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
