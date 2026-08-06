"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export interface CostControlRow {
  control_scope_id: string;
  scope_name: string;
  approved_budget: string;
  actual_cost: string;
  committed_cost: string;
  open_commitment: string;
  variance: string;
}

export function CostControlWorkspace({ rows }: { rows: CostControlRow[] }) {
  const t = useTranslations("costControl");

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-text-secondary">{t("empty")}</CardContent>
        </Card>
      ) : (
        rows.map((row) => (
          <Card key={row.control_scope_id}>
            <CardHeader>
              <CardTitle className="text-base">{row.scope_name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <span className="text-muted-foreground">{t("approvedBudget")}</span>
                <p className="font-medium">{formatMoney(row.approved_budget, "SAR")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("actualCost")}</span>
                <p className="font-medium">{formatMoney(row.actual_cost, "SAR")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("committedCost")}</span>
                <p className="font-medium">{formatMoney(row.committed_cost, "SAR")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("openCommitment")}</span>
                <p className="font-medium">{formatMoney(row.open_commitment, "SAR")}</p>
              </div>
              <div>
                <span className="text-muted-foreground">{t("variance")}</span>
                <p className="font-medium">{formatMoney(row.variance, "SAR")}</p>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
