"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchLatestRevenueBudgetVersionAction,
  fetchRevenueBudgetMasterDataAction,
  saveRevenueDraftBudgetAction,
  submitRevenueBudgetAction,
} from "@/app/actions/revenue-budget-actions";
import {
  calculateComponentBasedNetPreview,
  calculateDriverAmount,
  validateComponentBasedLines,
  validateNetOnlyLine,
  type ComponentLineInput,
} from "@/domain/financial/revenue-budget";
import type { RevenueBudgetBasis } from "@/types/database";
import { money } from "@/lib/money";

export interface RevenueBudgetPermissions {
  canDraft: boolean;
  canSubmit: boolean;
}

function distributeMonthly(total: string): string[] {
  const monthly = money(total).div(12).toDecimalPlaces(4).toFixed(4);
  const months = Array(12).fill(monthly);
  const diff = money(total).minus(money(monthly).times(12));
  months[11] = money(months[11]).plus(diff).toFixed(4);
  return months;
}

type MasterData = Awaited<ReturnType<typeof fetchRevenueBudgetMasterDataAction>>;

export function RevenueBudgetWorkflow({ permissions }: { permissions: RevenueBudgetPermissions }) {
  const t = useTranslations("revenueBudget");
  const [basis, setBasis] = useState<RevenueBudgetBasis>("net_only");
  const [master, setMaster] = useState<MasterData | null>(null);
  const [versionStatus, setVersionStatus] = useState<string>("draft");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [payerId, setPayerId] = useState("");
  const [serviceLineId, setServiceLineId] = useState("");
  const [quantity, setQuantity] = useState("1200");
  const [unitRate, setUnitRate] = useState("850");
  const [annualAmount, setAnnualAmount] = useState("1020000");
  const [assumption, setAssumption] = useState("");
  const [monthly, setMonthly] = useState<string[]>(distributeMonthly("1020000"));
  const [components, setComponents] = useState<ComponentLineInput[]>([
    { componentCode: "gross_revenue", annualAmount: "1200000", monthlyAmounts: distributeMonthly("1200000") },
    { componentCode: "rejection", annualAmount: "60000", monthlyAmounts: distributeMonthly("60000") },
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const readOnly = !permissions.canDraft || ["locked", "approved", "posted"].includes(versionStatus);

  useEffect(() => {
    void fetchRevenueBudgetMasterDataAction().then((data) => {
      setMaster(data);
      setOrgUnitId(data.units.find((u) => u.code === "REST-B1")?.id ?? data.units[0]?.id ?? "");
    });
    void fetchLatestRevenueBudgetVersionAction().then((v) => {
      if (v?.approval_status) setVersionStatus(v.approval_status);
    });
  }, []);

  const driverAmount = calculateDriverAmount(quantity, unitRate);
  const netOnlyDiff = useMemo(() => {
    try {
      return validateNetOnlyLine({
        plannedQuantity: quantity,
        plannedUnitRate: unitRate,
        plannedAmount: annualAmount,
        monthlyAmounts: monthly,
      });
    } catch {
      return { driverAmount, difference: "0" };
    }
  }, [quantity, unitRate, annualAmount, monthly, driverAmount]);

  const componentPreview = useMemo(() => {
    try {
      validateComponentBasedLines(components);
      return calculateComponentBasedNetPreview(components);
    } catch {
      return null;
    }
  }, [components]);

  function componentTypeId(code: string) {
    return master?.componentTypes.find((c) => c.code === code)?.id;
  }

  function saveDraft() {
    if (!master) return;
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        if (basis === "net_only") {
          validateNetOnlyLine({
            plannedQuantity: quantity,
            plannedUnitRate: unitRate,
            plannedAmount: annualAmount,
            monthlyAmounts: monthly,
          });
          await saveRevenueDraftBudgetAction({
            basis,
            organizationUnitId: orgUnitId,
            payerId: payerId || undefined,
            serviceLineId: serviceLineId || undefined,
            lines: [
              {
                organizationUnitId: orgUnitId,
                costNodeId: master.defaultCostNodeId,
                plannedQuantity: quantity,
                unitOfMeasure: "covers",
                plannedUnitRate: unitRate,
                plannedAmount: annualAmount,
                monthlyAmounts: monthly,
                assumption,
                revenueBudgetBasis: "net_only",
                payerId: payerId || undefined,
                serviceLineId: serviceLineId || undefined,
              },
            ],
          });
        } else {
          validateComponentBasedLines(components);
          await saveRevenueDraftBudgetAction({
            basis,
            organizationUnitId: orgUnitId,
            payerId: payerId || undefined,
            serviceLineId: serviceLineId || undefined,
            lines: components.map((c) => ({
              organizationUnitId: orgUnitId,
              costNodeId: master.defaultCostNodeId,
              plannedAmount: String(c.annualAmount),
              monthlyAmounts: c.monthlyAmounts,
              revenueBudgetBasis: "component_based",
              revenueComponentTypeId: componentTypeId(c.componentCode),
              payerId: payerId || undefined,
              serviceLineId: serviceLineId || undefined,
            })),
          });
        }
        setMessage(t("draftSaved"));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("saveFailed"));
      }
    });
  }

  return (
    <div className="space-y-6" data-testid="revenue-budget-workflow">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={basis === "net_only" ? "default" : "outline"}
              disabled={readOnly}
              data-testid="basis-net-only"
              onClick={() => setBasis("net_only")}
            >
              {t("netOnly")}
            </Button>
            <Button
              type="button"
              variant={basis === "component_based" ? "default" : "outline"}
              disabled={readOnly}
              data-testid="basis-component"
              onClick={() => setBasis("component_based")}
            >
              {t("componentBased")}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm space-y-1">
              <span>{t("organizationUnit")}</span>
              <select
                className="w-full rounded border px-2 py-2"
                value={orgUnitId}
                disabled={readOnly}
                data-testid="org-unit-select"
                onChange={(e) => setOrgUnitId(e.target.value)}
              >
                {master?.units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name_en}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span>{t("payer")}</span>
              <select className="w-full rounded border px-2 py-2" value={payerId} disabled={readOnly} onChange={(e) => setPayerId(e.target.value)}>
                <option value="">{t("optional")}</option>
                {master?.payers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name_en}</option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1">
              <span>{t("serviceLine")}</span>
              <select className="w-full rounded border px-2 py-2" value={serviceLineId} disabled={readOnly} onChange={(e) => setServiceLineId(e.target.value)}>
                <option value="">{t("optional")}</option>
                {master?.serviceLines.map((s) => (
                  <option key={s.id} value={s.id}>{s.name_en}</option>
                ))}
              </select>
            </label>
          </div>

          {basis === "net_only" ? (
            <div className="grid gap-4 md:grid-cols-2" data-testid="net-only-form">
              <label className="text-sm space-y-1">
                <span>{t("quantity")}</span>
                <Input value={quantity} disabled={readOnly} onChange={(e) => setQuantity(e.target.value)} data-testid="net-quantity" />
              </label>
              <label className="text-sm space-y-1">
                <span>{t("unitRate")}</span>
                <Input value={unitRate} disabled={readOnly} onChange={(e) => setUnitRate(e.target.value)} data-testid="net-rate" />
              </label>
              <label className="text-sm space-y-1 md:col-span-2">
                <span>{t("annualAmount")}</span>
                <Input value={annualAmount} disabled={readOnly} onChange={(e) => setAnnualAmount(e.target.value)} data-testid="net-amount" />
              </label>
              <label className="text-sm space-y-1 md:col-span-2">
                <span>{t("assumptions")}</span>
                <Input value={assumption} disabled={readOnly} onChange={(e) => setAssumption(e.target.value)} data-testid="net-assumptions" />
              </label>
              <p className="text-sm text-muted-foreground md:col-span-2">
                {t("driverPreview", { driver: driverAmount ?? "—", diff: netOnlyDiff.difference })}
              </p>
            </div>
          ) : (
            <div className="space-y-3" data-testid="component-form">
              {components.map((c, idx) => (
                <div key={c.componentCode} className="grid gap-2 md:grid-cols-3 items-end">
                  <span className="text-sm font-medium">{c.componentCode}</span>
                  <Input
                    value={String(c.annualAmount)}
                    disabled={readOnly}
                    data-testid={`component-${c.componentCode}-annual`}
                    onChange={(e) => {
                      const next = [...components];
                      next[idx] = { ...c, annualAmount: e.target.value, monthlyAmounts: distributeMonthly(e.target.value) };
                      setComponents(next);
                    }}
                  />
                </div>
              ))}
              {componentPreview && (
                <div className="rounded border p-3 text-sm space-y-1" data-testid="component-preview">
                  <div>{t("grossBudget")}: {componentPreview.grossBudget.toFixed(2)}</div>
                  <div>{t("netRevenueBudget")}: {componentPreview.netRevenueBudget.toFixed(2)}</div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2" data-testid="monthly-phasing">
            <h3 className="font-medium">{t("monthlyPhasing")}</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {monthly.map((m, i) => (
                <label key={i} className="text-xs space-y-1">
                  <span>M{i + 1}</span>
                  <Input
                    value={basis === "net_only" ? m : String(components[0]?.monthlyAmounts[i] ?? m)}
                    disabled={readOnly || basis !== "net_only"}
                    onChange={(e) => {
                      const next = [...monthly];
                      next[i] = e.target.value;
                      setMonthly(next);
                    }}
                  />
                </label>
              ))}
            </div>
          </div>

          {readOnly && <p className="text-sm text-warning" data-testid="read-only-notice">{t("readOnly")}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" disabled={pending || readOnly} data-testid="save-revenue-draft" onClick={saveDraft}>
              {t("saveDraft")}
            </Button>
            {permissions.canSubmit && (
              <Button
                type="button"
                variant="outline"
                disabled={pending || readOnly}
                data-testid="submit-revenue-budget"
                onClick={() =>
                  startTransition(async () => {
                    const v = await fetchLatestRevenueBudgetVersionAction();
                    if (v?.id) {
                      await submitRevenueBudgetAction(v.id);
                      setMessage(t("submitted"));
                    }
                  })
                }
              >
                {t("submit")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
