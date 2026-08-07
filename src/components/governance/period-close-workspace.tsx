"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  addPeriodTemplateItemAction,
  approvePeriodTemplateAction,
  approvePeriodReopenAction,
  evaluatePeriodReadinessAction,
  fetchPeriodChecklistAction,
  hardClosePeriodAction,
  createPeriodTemplateAction,
  requestPeriodReopenAction,
  setPeriodChecklistResultAction,
  softClosePeriodAction,
  submitPeriodTemplateAction,
  retirePeriodTemplateAction,
} from "@/app/actions/governance-actions";
import { pickLocalized } from "@/lib/i18n/display";
import type { PeriodCloseTemplateRow } from "@/data/repositories/period-close-repository";

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
  initialTemplates,
  fiscalPeriods,
  canClose,
  canManageTemplates,
  canRequestReopen,
  canApproveReopen,
}: {
  initialControls: PeriodControlRow[];
  initialTemplates: PeriodCloseTemplateRow[];
  fiscalPeriods: { id: string; period_number: number; start_date: string; end_date: string }[];
  canClose: boolean;
  canManageTemplates: boolean;
  canRequestReopen: boolean;
  canApproveReopen: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("periodClose");
  const [controls, setControls] = useState(initialControls);
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedPeriod, setSelectedPeriod] = useState(fiscalPeriods[0]?.id ?? "");
  const [selectedModule, setSelectedModule] = useState<(typeof MODULES)[number]>("actuals");
  const [reopenReason, setReopenReason] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [itemEvidence, setItemEvidence] = useState<Record<string, string>>({});
  const [templateCode, setTemplateCode] = useState("");
  const [templateNameEn, setTemplateNameEn] = useState("");
  const [templateNameAr, setTemplateNameAr] = useState("");
  const [templateModule, setTemplateModule] = useState<(typeof MODULES)[number]>("actuals");
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplates.find((item) => item.governance_status === "draft")?.id ?? "");
  const [itemNameEn, setItemNameEn] = useState("");
  const [itemNameAr, setItemNameAr] = useState("");
  const [itemType, setItemType] = useState<"manual" | "automatic">("manual");
  const [controlCode, setControlCode] = useState("");
  const [itemBlocking, setItemBlocking] = useState(true);
  const [retirementReasons, setRetirementReasons] = useState<Record<string, string>>({});
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

  const replaceTemplates = (next: PeriodCloseTemplateRow[]) => {
    setTemplates(next);
    if (!next.some((item) => item.id === selectedTemplateId && item.governance_status === "draft")) {
      setSelectedTemplateId(next.find((item) => item.governance_status === "draft")?.id ?? "");
    }
  };

  const mutateTemplates = (action: () => Promise<PeriodCloseTemplateRow[]>, successKey: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        replaceTemplates(await action());
        setMessage(t(successKey as Parameters<typeof t>[0]));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  return (
    <div className="space-y-6">
      {canManageTemplates || canApproveReopen ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("templateGovernance")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManageTemplates ? (
              <div className="flex flex-wrap items-end gap-3">
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={templateModule}
                  onChange={(event) => setTemplateModule(event.target.value as (typeof MODULES)[number])}
                  aria-label={t("selectModule")}
                >
                  {MODULES.map((module) => <option key={module} value={module}>{t(`modules.${module}`)}</option>)}
                </select>
                <Input value={templateCode} onChange={(event) => setTemplateCode(event.target.value)} placeholder={t("templateCode")} />
                <Input value={templateNameEn} onChange={(event) => setTemplateNameEn(event.target.value)} placeholder={t("templateNameEn")} />
                <Input value={templateNameAr} onChange={(event) => setTemplateNameAr(event.target.value)} placeholder={t("templateNameAr")} dir="rtl" />
                <Button
                  disabled={pending || !templateCode.trim() || !templateNameEn.trim() || !templateNameAr.trim()}
                  onClick={() => mutateTemplates(async () => {
                    const next = await createPeriodTemplateAction({
                      module: templateModule,
                      code: templateCode,
                      nameEn: templateNameEn,
                      nameAr: templateNameAr,
                    });
                    setTemplateCode(""); setTemplateNameEn(""); setTemplateNameAr("");
                    return next;
                  }, "templateCreated")}
                >
                  {t("createTemplate")}
                </Button>
              </div>
            ) : null}

            {canManageTemplates && templates.some((template) => template.governance_status === "draft") ? (
              <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={selectedTemplateId}
                  onChange={(event) => setSelectedTemplateId(event.target.value)}
                  aria-label={t("draftTemplate")}
                >
                  {templates.filter((template) => template.governance_status === "draft").map((template) => (
                    <option key={template.id} value={template.id}>{template.code} v{template.version_number}</option>
                  ))}
                </select>
                <Input value={itemNameEn} onChange={(event) => setItemNameEn(event.target.value)} placeholder={t("itemNameEn")} />
                <Input value={itemNameAr} onChange={(event) => setItemNameAr(event.target.value)} placeholder={t("itemNameAr")} dir="rtl" />
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={itemType}
                  onChange={(event) => setItemType(event.target.value as "manual" | "automatic")}
                >
                  <option value="manual">{t("manualItem")}</option>
                  <option value="automatic">{t("automaticItem")}</option>
                </select>
                {itemType === "automatic" ? (
                  <select
                    className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={controlCode}
                    onChange={(event) => setControlCode(event.target.value)}
                  >
                    <option value="">{t("selectControl")}</option>
                    {(["unmapped_actuals", "unmapped_cleared", "incomplete_allocations", "open_match_exceptions"] as const).map((code) => (
                      <option key={code} value={code}>{t(`controls.${code}`)}</option>
                    ))}
                  </select>
                ) : null}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={itemBlocking} onChange={(event) => setItemBlocking(event.target.checked)} />
                  {t("blocking")}
                </label>
                <Button
                  disabled={pending || !selectedTemplateId || !itemNameEn.trim() || !itemNameAr.trim() || (itemType === "automatic" && !controlCode)}
                  onClick={() => mutateTemplates(async () => {
                    const template = templates.find((candidate) => candidate.id === selectedTemplateId);
                    const next = await addPeriodTemplateItemAction({
                      templateId: selectedTemplateId,
                      sequenceNo: (template?.period_close_checklist_items?.length ?? 0) + 1,
                      nameEn: itemNameEn,
                      nameAr: itemNameAr,
                      itemType,
                      isRequired: true,
                      isBlocking: itemBlocking,
                      controlCode: itemType === "automatic" ? controlCode : undefined,
                    });
                    setItemNameEn(""); setItemNameAr(""); setControlCode("");
                    return next;
                  }, "templateItemAdded")}
                >
                  {t("addTemplateItem")}
                </Button>
              </div>
            ) : null}

            <ul className="space-y-2 text-sm">
              {templates.map((template) => (
                <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <span>{template.code} v{template.version_number} · {t(`modules.${template.module}`)} · {template.governance_status}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {canManageTemplates && template.governance_status === "draft" ? (
                      <Button size="sm" disabled={pending} onClick={() => mutateTemplates(() => submitPeriodTemplateAction(template.id), "templateSubmitted")}>{t("submitTemplate")}</Button>
                    ) : null}
                    {canApproveReopen && template.governance_status === "submitted" ? (
                      <Button size="sm" disabled={pending} onClick={() => mutateTemplates(() => approvePeriodTemplateAction(template.id), "templateApproved")}>{t("approveTemplate")}</Button>
                    ) : null}
                    {canApproveReopen && template.governance_status === "approved" ? (
                      <>
                        <Input
                          className="w-40"
                          value={retirementReasons[template.id] ?? ""}
                          onChange={(event) => setRetirementReasons((current) => ({ ...current, [template.id]: event.target.value }))}
                          placeholder={t("retirementReason")}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending || (retirementReasons[template.id]?.trim().length ?? 0) < 5}
                          onClick={() => mutateTemplates(() => retirePeriodTemplateAction({ templateId: template.id, reason: retirementReasons[template.id] }), "templateRetired")}
                        >
                          {t("retireTemplate")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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
