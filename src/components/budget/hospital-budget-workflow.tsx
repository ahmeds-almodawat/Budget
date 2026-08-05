"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
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
} from "@/app/actions/budget-actions";
import {
  CONTROL_ACCOUNT_PHARM_INJ,
  COST_NODE_INJECTABLE,
  ORG_UNIT_PHARMACY,
} from "@/types/database";
import { money } from "@/lib/money";

function distributeMonthly(total: string): string[] {
  const monthly = money(total).div(12).toDecimalPlaces(4).toFixed(4);
  const months = Array(12).fill(monthly);
  const diff = money(total).minus(money(monthly).times(12));
  months[11] = money(months[11]).plus(diff).toFixed(4);
  return months;
}

export function HospitalBudgetWorkflow() {
  const t = useTranslations("budget");
  const locale = useLocale();
  const [annualAmount, setAnnualAmount] = useState("1020000");
  const [quantity, setQuantity] = useState("12000");
  const [unitRate, setUnitRate] = useState("85");
  const [budgetVersionId, setBudgetVersionId] = useState<string | null>(null);
  const [budgetLineId, setBudgetLineId] = useState<string | null>(null);
  const [changeRequestId, setChangeRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
          <CardTitle>{locale === "ar" ? "ميزانية المستشفى 2027" : "2027 Main Hospital Operating Budget"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{locale === "ar" ? "الكمية السنوية" : "Annual quantity"}</span>
            <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span>{locale === "ar" ? "سعر الوحدة" : "Unit rate (SAR)"}</span>
            <Input value={unitRate} onChange={(e) => setUnitRate(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span>{locale === "ar" ? "المبلغ السنوي (محسوب أو مباشر)" : "Annual amount (direct or driver)"}</span>
            <Input value={annualAmount} onChange={(e) => setAnnualAmount(e.target.value)} />
            <span className="text-slate-500">{locale === "ar" ? "محسوب" : "Driver"}: {computed} SAR</span>
          </label>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
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
              const { createAdminClient } = await import("@/lib/supabase/admin");
              const db = createAdminClient();
              const { data } = await db
                .from("budget_lines")
                .select("id")
                .eq("budget_version_id", version.id)
                .limit(1)
                .single();
              if (data) setBudgetLineId(data.id);
              return version;
            }, locale === "ar" ? "تم حفظ المسودة" : "Draft saved")
          }
        >
          {t("draft")}
        </Button>
        <Button
          disabled={pending || !budgetVersionId}
          variant="secondary"
          onClick={() =>
            run(
              () => submitHospitalBudgetAction(budgetVersionId!),
              locale === "ar" ? "تم الإرسال" : "Submitted",
            )
          }
        >
          {t("submitted")}
        </Button>
        <Button
          disabled={pending || !budgetVersionId}
          variant="secondary"
          onClick={() =>
            run(
              () => reviewHospitalBudgetAction(budgetVersionId!),
              locale === "ar" ? "قيد المراجعة" : "Under review",
            )
          }
        >
          {locale === "ar" ? "مراجعة مالية" : "Finance review"}
        </Button>
        <Button
          disabled={pending || !budgetVersionId}
          onClick={() =>
            run(
              () => approveHospitalBudgetAction(budgetVersionId!, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"),
              locale === "ar" ? "تم الاعتماد والقفل" : "Approved and locked",
            )
          }
        >
          {t("approved")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{locale === "ar" ? "طلب تغيير الميزانية" : "Budget change request"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !budgetVersionId}
            variant="outline"
            onClick={() =>
              run(async () => {
                const { createAdminClient } = await import("@/lib/supabase/admin");
                const db = createAdminClient();
                const { data } = await db
                  .from("budget_lines")
                  .select("id")
                  .eq("budget_version_id", budgetVersionId)
                  .limit(1)
                  .single();
                if (!data) throw new Error("Budget line missing");
                setBudgetLineId(data.id);
                const change = await requestHospitalBudgetChangeAction({
                  budgetVersionId: budgetVersionId!,
                  budgetLineId: data.id,
                  increaseAmount: "50000",
                  reason: "Increased injectable medicine volume",
                });
                setChangeRequestId(change.id);
                return change;
              }, locale === "ar" ? "تم إنشاء طلب التغيير" : "Change request created")
            }
          >
            {locale === "ar" ? "طلب زيادة" : "Request increase"}
          </Button>
          <Button
            disabled={pending || !changeRequestId || !budgetVersionId || !budgetLineId}
            onClick={() =>
              run(
                () =>
                  approveHospitalBudgetChangeAction({
                    changeRequestId: changeRequestId!,
                    budgetVersionId: budgetVersionId!,
                    budgetLineId: budgetLineId!,
                    increaseAmount: "50000",
                  }),
                locale === "ar" ? "تم اعتماد التغيير" : "Change approved",
              )
            }
          >
            {locale === "ar" ? "اعتماد التغيير" : "Approve change"}
          </Button>
        </CardContent>
      </Card>

      {message ? <p className="text-green-700">{message}</p> : null}
      {error ? <p className="text-red-700">{error}</p> : null}
      {budgetVersionId ? (
        <p className="text-xs text-slate-500">Budget version: {budgetVersionId}</p>
      ) : null}
    </div>
  );
}
