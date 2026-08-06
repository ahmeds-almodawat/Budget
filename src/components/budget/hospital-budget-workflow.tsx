"use client";

import { useState, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  saveHospitalDraftBudgetAction,
  submitHospitalBudgetAction,
  reviewHospitalBudgetAction,
  approveHospitalBudgetAction,
  requestHospitalBudgetChangeAction,
  approveHospitalBudgetChangeAction,
  fetchBudgetLineIdAction,
  fetchLatestHospitalBudgetVersionAction,
} from "@/app/actions/budget-actions";
import {
  CONTROL_ACCOUNT_PHARM_INJ,
  COST_NODE_INJECTABLE,
  ORG_UNIT_PHARMACY,
} from "@/types/database";
import { money } from "@/lib/money";

export interface BudgetWorkflowPermissions {
  canDraft: boolean;
  canSubmit: boolean;
  canReview: boolean;
  canApprove: boolean;
  canRequestChange: boolean;
  canApproveChange: boolean;
}

function distributeMonthly(total: string): string[] {
  const monthly = money(total).div(12).toDecimalPlaces(4).toFixed(4);
  const months = Array(12).fill(monthly);
  const diff = money(total).minus(money(monthly).times(12));
  months[11] = money(months[11]).plus(diff).toFixed(4);
  return months;
}

export function HospitalBudgetWorkflow({ permissions }: { permissions: BudgetWorkflowPermissions }) {
  const t = useTranslations("budget");
  const tWorkflow = useTranslations("budgetWorkflow");
  const [annualAmount, setAnnualAmount] = useState("1020000");
  const [quantity, setQuantity] = useState("12000");
  const [unitRate, setUnitRate] = useState("85");
  const [budgetVersionId, setBudgetVersionId] = useState<string | null>(null);
  const [budgetLineId, setBudgetLineId] = useState<string | null>(null);
  const [changeRequestId, setChangeRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void fetchLatestHospitalBudgetVersionAction().then((version) => {
      if (version?.id) {
        setBudgetVersionId(version.id);
        void fetchBudgetLineIdAction(version.id).then((lineId) => {
          if (lineId) setBudgetLineId(lineId);
        });
      }
    });
  }, []);

  const computed = money(quantity).times(money(unitRate)).toFixed(2);

  function run(action: () => Promise<unknown>, ok: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(ok);
        if (result && typeof result === "object") {
          if ("id" in result && typeof result.id === "string") {
            if ("version_label" in result) setBudgetVersionId(result.id);
            if ("budget_version_id" in result) setChangeRequestId(result.id);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : t("draft"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tWorkflow("title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{tWorkflow("annualQuantity")}</span>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={!permissions.canDraft} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{tWorkflow("unitRate")}</span>
            <Input value={unitRate} onChange={(e) => setUnitRate(e.target.value)} disabled={!permissions.canDraft} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>{tWorkflow("annualAmount")}</span>
            <Input value={annualAmount} onChange={(e) => setAnnualAmount(e.target.value)} disabled={!permissions.canDraft} />
            <span className="text-muted-foreground">{tWorkflow("driver")}: {computed} SAR</span>
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || !permissions.canDraft}
          onClick={() =>
            run(async () => {
              const amount = annualAmount || computed;
              const version = await saveHospitalDraftBudgetAction([
                {
                  organizationUnitId: ORG_UNIT_PHARMACY,
                  costNodeId: COST_NODE_INJECTABLE,
                  controlAccountId: CONTROL_ACCOUNT_PHARM_INJ,
                  plannedQuantity: quantity,
                  unitOfMeasure: "units",
                  plannedUnitRate: unitRate,
                  plannedAmount: amount,
                  monthlyAmounts: distributeMonthly(amount),
                  assumption: "Injectable medicines consumption driver",
                },
              ]);
              setBudgetVersionId(version.id);
              const lineId = await fetchBudgetLineIdAction(version.id);
              if (lineId) setBudgetLineId(lineId);
              return version;
            }, tWorkflow("draftSaved"))
          }
        >
          {t("draft")}
        </Button>
        <Button
          disabled={pending || !budgetVersionId || !permissions.canSubmit}
          variant="secondary"
          onClick={() =>
            run(
              () => submitHospitalBudgetAction(budgetVersionId!),
              tWorkflow("submitted"),
            )
          }
        >
          {t("submitted")}
        </Button>
        <Button
          disabled={pending || !budgetVersionId || !permissions.canReview}
          variant="secondary"
          onClick={() =>
            run(
              () => reviewHospitalBudgetAction(budgetVersionId!),
              tWorkflow("underReview"),
            )
          }
        >
          {tWorkflow("financeReview")}
        </Button>
        <Button
          disabled={pending || !budgetVersionId || !permissions.canApprove}
          onClick={() =>
            run(
              () => approveHospitalBudgetAction(budgetVersionId!),
              tWorkflow("approvedLocked"),
            )
          }
        >
          {t("approved")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tWorkflow("changeRequestTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !budgetVersionId || !permissions.canRequestChange}
            variant="outline"
            onClick={() =>
              run(async () => {
                const lineId = budgetLineId ?? (await fetchBudgetLineIdAction(budgetVersionId!));
                if (!lineId) throw new Error("Budget line missing");
                setBudgetLineId(lineId);
                const change = await requestHospitalBudgetChangeAction({
                  budgetVersionId: budgetVersionId!,
                  budgetLineId: lineId,
                  increaseAmount: "50000",
                  reason: "Increased injectable medicine volume",
                });
                setChangeRequestId(change.id);
                return change;
              }, tWorkflow("changeRequestCreated"))
            }
          >
            {tWorkflow("requestIncrease")}
          </Button>
          <Button
            disabled={pending || !changeRequestId || !permissions.canApproveChange}
            onClick={() =>
              run(
                () =>
                  approveHospitalBudgetChangeAction({
                    changeRequestId: changeRequestId!,
                  }),
                tWorkflow("changeApproved"),
              )
            }
          >
            {tWorkflow("approveChange")}
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-danger" role="alert">{error}</p> : null}
      {budgetVersionId ? (
        <p className="text-xs text-muted-foreground">Budget version: {budgetVersionId}</p>
      ) : null}
    </div>
  );
}
