"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ApprovalRuleRow {
  id: string;
  workflow_type: string;
  version_number: number;
  governance_status: string;
  rule_definition: Record<string, unknown>;
  effective_start: string;
}

export function ApprovalRulesWorkspace({
  initialRules,
  canSimulate,
}: {
  initialRules: ApprovalRuleRow[];
  canSimulate: boolean;
}) {
  const t = useTranslations("approvalRules");
  const [rules] = useState(initialRules);
  const [simAmount, setSimAmount] = useState("50000");
  const [simWorkflow, setSimWorkflow] = useState("procurement");
  const [simResult, setSimResult] = useState<string | null>(null);

  const simulate = () => {
    const amount = Number(simAmount);
    const match = rules.find(
      (r) =>
        r.workflow_type === simWorkflow &&
        r.governance_status === "approved" &&
        typeof r.rule_definition === "object",
    );
    if (!match) {
      setSimResult(t("simNoRule"));
      return;
    }
    const def = match.rule_definition as { thresholds?: { min?: number; approvers?: string[] }[] };
    const tier = def.thresholds?.find((th) => amount >= (th.min ?? 0));
    setSimResult(
      tier
        ? t("simResult", { version: match.version_number, approvers: (tier.approvers ?? []).join(", ") || t("defaultApprover") })
        : t("simBelowThreshold"),
    );
  };

  return (
    <div className="space-y-6">
      {canSimulate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("simulation")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="sim-workflow" className="text-xs font-medium text-slate-600">
                {t("workflowType")}
              </label>
              <Input id="sim-workflow" value={simWorkflow} onChange={(e) => setSimWorkflow(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="sim-amount" className="text-xs font-medium text-slate-600">
                {t("amount")}
              </label>
              <Input id="sim-amount" value={simAmount} onChange={(e) => setSimAmount(e.target.value)} />
            </div>
            <Button type="button" onClick={simulate}>
              {t("runSimulation")}
            </Button>
            {simResult ? <p className="w-full text-sm text-slate-600">{simResult}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4">
        {rules.map((rule) => (
          <Card key={rule.id} as="article">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {rule.workflow_type} v{rule.version_number}
              </CardTitle>
              <Badge variant="outline">{rule.governance_status}</Badge>
            </CardHeader>
            <CardContent className="text-sm text-slate-600">
              {t("effectiveFrom", { date: rule.effective_start })}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
