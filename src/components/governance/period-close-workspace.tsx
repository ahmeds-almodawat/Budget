"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  approvePeriodReopenAction,
  evaluatePeriodReadinessAction,
  fetchPeriodChecklistAction,
  hardClosePeriodAction,
  requestPeriodReopenAction,
  setPeriodChecklistResultAction,
  softClosePeriodAction,
} from "@/app/actions/governance-actions";
import { pickLocalized } from "@/lib/i18n/display";

const MODULES = ["budgets", "actuals", "procurement", "forecasts", "projects", "reporting"] as const;

export interface PeriodControlRow {
  id: string;
  module: string;
  control_state: string;
  fiscal_period_id: string;
  fiscal_periods?: { period_number: number; start_date: string; end_date: string } | null;
}

type ChecklistPayload = Awaited<ReturnType<typeof fetchPeriodChecklistAction>>;
type ReadinessPayload = Awaited<ReturnType<typeof evaluatePeriodReadinessAction>>;

export function PeriodCloseWorkspace({
  initialControls,
  fiscalPeriods,
  canClose,
  canRequestReopen,
  canApproveReopen,
}: {
  initialControls: PeriodControlRow[];
  fiscalPeriods: { id: string; period_number: number; start_date: string; end_date: string }[];
  canClose: boolean;
  canRequestReopen: boolean;
  canApproveReopen: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("periodClose");
  const [controls, setControls] = useState(initialControls);
  const [selectedPeriod, setSelectedPeriod] = useState(fiscalPeriods[0]?.id ?? "");
  const [selectedModule, setSelectedModule] = useState<(typeof MODULES)[number]>("actuals");
  const [reopenReason, setReopenReason] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [itemEvidence, setItemEvidence] = useState<Record<string, string>>({});
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [checklist, setChecklist] = useState<ChecklistPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const loadChecklistAndReadiness = (periodId: string, module: string) => {
    startTransition(async () => {
      setError(null);
      try {
        const [cl, ready] = await Promise.all([
          fetchPeriodChecklistAction({ fiscalPeriodId: periodId, module }),
          evaluatePeriodReadinessAction({ fiscalPeriodId: periodId, module }),
        ]);
        setChecklist(cl);
        setReadiness(ready);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  useEffect(() => {
    if (selectedPeriod) {
      loadChecklistAndReadiness(selectedPeriod, selectedModule);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional refresh on period/module change
  }, [selectedPeriod, selectedModule]);

  const blockingIncomplete =
    checklist?.items.some(
      (item) =>
        item.is_blocking &&
        item.result_status !== "passed" &&
        item.result_status !== "waived",
    ) ?? false;

  const readinessPass = Boolean(readiness && (readiness as { pass?: boolean }).pass);

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
        loadChecklistAndReadiness(selectedPeriod, module);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleHardCloseGated = (module: string) => {
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
        loadChecklistAndReadiness(selectedPeriod, module);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleChecklistResult = (
    resultId: string,
    status: "passed" | "failed" | "waived",
  ) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const detail = itemEvidence[resultId]?.trim();
        const updated = await setPeriodChecklistResultAction({
          itemResultId: resultId,
          fiscalPeriodId: selectedPeriod,
          module: selectedModule,
          itemStatus: status,
          evidenceReference: status === "passed" ? detail || undefined : undefined,
          comments: status === "failed" ? detail || undefined : undefined,
          waiverReason: status === "waived" ? detail || undefined : undefined,
        });
        setChecklist(updated);
        setMessage(t("checklistResultSaved"));
        const ready = await evaluatePeriodReadinessAction({
          fiscalPeriodId: selectedPeriod,
          module: selectedModule,
        });
        setReadiness(ready);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleReopenRequest = (module: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const cl = await requestPeriodReopenAction({
          fiscalPeriodId: selectedPeriod,
          module,
          reason: reopenReason,
          evidenceReference: evidenceRef || undefined,
        });
        setChecklist(cl);
        setMessage(t("reopenRequested", { module: t(`modules.${module}`) }));
        setReopenReason("");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleApproveReopen = (requestId: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const result = await approvePeriodReopenAction({
          reopenRequestId: requestId,
          fiscalPeriodId: selectedPeriod,
          module: selectedModule,
          decisionReason: decisionReason || undefined,
        });
        setControls(result.controls as PeriodControlRow[]);
        setChecklist(result.checklist);
        setMessage(t("reopenApproved"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const periodControls = controls.filter((c) => c.fiscal_period_id === selectedPeriod);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("calendar")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <label htmlFor="period-select" className="text-xs font-medium text-text-secondary">
                {t("selectPeriod")}
              </label>
              <select
                id="period-select"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
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
            <div className="space-y-1">
              <label htmlFor="module-select" className="text-xs font-medium text-text-secondary">
                {t("selectModule")}
              </label>
              <select
                id="module-select"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value as (typeof MODULES)[number])}
              >
                {MODULES.map((mod) => (
                  <option key={mod} value={mod}>
                    {t(`modules.${mod}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {canClose ? (
            <>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((mod) => (
                  <Button
                    key={`soft-${mod}`}
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => handleSoftClose(mod)}
                  >
                    {t("softCloseModule", { module: t(`modules.${mod}`) })}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {MODULES.map((mod) => (
                  <Button
                    key={`hard-${mod}`}
                    size="sm"
                    variant="destructive"
                    disabled={pending || (mod === selectedModule && (!readinessPass || blockingIncomplete))}
                    onClick={() => handleHardCloseGated(mod)}
                  >
                    {t("hardCloseGatedModule", { module: t(`modules.${mod}`) })}
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t("readiness")}</CardTitle>
          <Badge variant={readinessPass ? "success" : "danger"}>
            {readinessPass ? t("ready") : t("blocked")}
          </Badge>
        </CardHeader>
        <CardContent>
          {readiness ? (
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-text-secondary">
              {JSON.stringify(readiness, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-text-secondary">{t("noReadiness")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("checklist")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!checklist?.items.length ? (
            <p className="text-sm text-text-secondary">{t("noChecklist")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {checklist.items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"
                >
                  <div>
                    <span className="font-medium">
                      {pickLocalized(locale, item.name_en, item.name_ar)}
                    </span>
                    {item.is_blocking ? (
                      <span className="ms-2 text-xs text-danger">{t("blocking")}</span>
                    ) : null}
                  </div>
                  <Badge variant="outline">{item.result_status ?? "pending"}</Badge>
                  {canClose && item.item_type !== "automatic" && item.result_id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        aria-label={t("itemEvidence")}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                        value={itemEvidence[item.result_id] ?? ""}
                        onChange={(event) =>
                          setItemEvidence((current) => ({
                            ...current,
                            [item.result_id as string]: event.target.value,
                          }))
                        }
                        placeholder={t("itemEvidence")}
                      />
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => handleChecklistResult(item.result_id as string, "passed")}
                      >
                        {t("markPassed")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => handleChecklistResult(item.result_id as string, "failed")}
                      >
                        {t("markFailed")}
                      </Button>
                      {canApproveReopen ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending || (itemEvidence[item.result_id]?.trim().length ?? 0) < 5}
                          onClick={() => handleChecklistResult(item.result_id as string, "waived")}
                        >
                          {t("waiveItem")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {blockingIncomplete ? (
            <p className="mt-3 text-sm text-danger">{t("blockingIncomplete")}</p>
          ) : null}
        </CardContent>
      </Card>

      {(canRequestReopen || canApproveReopen) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("reopenGate")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canRequestReopen ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="reopen-reason" className="text-xs font-medium text-text-secondary">
                    {t("reopenReason")}
                  </label>
                  <input
                    id="reopen-reason"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="evidence-ref" className="text-xs font-medium text-text-secondary">
                    {t("evidenceReference")}
                  </label>
                  <input
                    id="evidence-ref"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={evidenceRef}
                    onChange={(e) => setEvidenceRef(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={pending || reopenReason.trim().length < 5}
                  onClick={() => handleReopenRequest(selectedModule)}
                >
                  {t("requestReopen", { module: t(`modules.${selectedModule}`) })}
                </Button>
              </div>
            ) : null}

            {canApproveReopen ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="decision-reason" className="text-xs font-medium text-text-secondary">
                    {t("decisionReason")}
                  </label>
                  <input
                    id="decision-reason"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                  />
                </div>
                <ul className="space-y-2 text-sm">
                  {(checklist?.reopenRequests ?? [])
                    .filter((r) => r.status === "submitted")
                    .map((req) => (
                      <li
                        key={req.id}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2"
                      >
                        <span>
                          {t(`modules.${req.module}`)} — {req.reason}
                        </span>
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => handleApproveReopen(req.id)}
                        >
                          {t("approveReopen")}
                        </Button>
                      </li>
                    ))}
                  {(checklist?.reopenRequests ?? []).filter((r) => r.status === "submitted").length ===
                  0 ? (
                    <li className="text-text-secondary">{t("noReopenRequests")}</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("moduleStatus")}</CardTitle>
        </CardHeader>
        <CardContent>
          {periodControls.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("allOpen")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {periodControls.map((c) => (
                <li key={c.id} className="flex items-center justify-between border-b border-border py-2">
                  <span>
                    {t(`modules.${c.module}`)} —{" "}
                    {t("periodLabelShort", { number: c.fiscal_periods?.period_number ?? "?" })}
                  </span>
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
