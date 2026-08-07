"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  approveRequisitionAction,
  budgetCheckRequisitionAction,
  createRequisitionDraftAction,
  departmentApproveRequisitionAction,
  sendRequisitionToProcurementReviewAction,
  submitRequisitionAction,
  upsertRequisitionLineAction,
} from "@/app/actions/procurement-actions";
import { lineTotal } from "@/domain/procurement/calculations";
import { formatMoney, money } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

export interface RequisitionLineRow {
  id: string;
  line_number: number;
  description: string;
  quantity: string | number;
  unit_price: string | number;
  line_total?: string | number;
  uom?: string | null;
}

export interface RequisitionRow {
  id: string;
  requisition_number: string;
  title_en: string;
  title_ar: string;
  requisition_status: string;
  estimated_total: string;
  created_at: string;
  purchase_requisition_lines?: RequisitionLineRow[];
}

export function RequisitionWorkspace({
  initialRequisitions,
  fiscalPeriodId,
  canCreate,
  canSubmit,
  canApprove,
}: {
  initialRequisitions: RequisitionRow[];
  fiscalPeriodId: string;
  canCreate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("requisition");
  const tCommon = useTranslations("common");
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [reqNumber, setReqNumber] = useState(() => `REQ-${Date.now()}`);
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [lineDrafts, setLineDrafts] = useState<
    Record<string, { description: string; quantity: string; unitPrice: string; uom: string }>
  >({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const getLineDraft = (id: string) =>
    lineDrafts[id] ?? { description: "", quantity: "1", unitPrice: "0", uom: "EA" };

  const setLineField = (id: string, field: keyof ReturnType<typeof getLineDraft>, value: string) => {
    setLineDrafts((prev) => ({
      ...prev,
      [id]: { ...getLineDraft(id), ...(prev[id] ?? {}), [field]: value },
    }));
  };

  const replaceReq = (updated: RequisitionRow) => {
    setRequisitions((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleCreate = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const created = (await createRequisitionDraftAction({
          requisitionNumber: reqNumber,
          titleEn,
          titleAr,
          fiscalPeriodId: fiscalPeriodId || undefined,
        })) as RequisitionRow;
        setRequisitions((prev) => [created, ...prev]);
        setMessage(t("created"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const runStatus = (
    id: string,
    action: (id: string) => Promise<unknown>,
    successKey: "submitted" | "departmentApproved" | "budgetChecked" | "sentToProcurement" | "approved",
  ) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await action(id)) as RequisitionRow;
        replaceReq(updated);
        setMessage(t(successKey));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const handleUpsertLine = (req: RequisitionRow) => {
    const draft = getLineDraft(req.id);
    const nextLine =
      (req.purchase_requisition_lines ?? []).reduce((m, l) => Math.max(m, Number(l.line_number)), 0) +
      1;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await upsertRequisitionLineAction({
          requisitionId: req.id,
          lineNumber: nextLine,
          description: draft.description,
          quantity: draft.quantity,
          unitPrice: draft.unitPrice,
          uom: draft.uom || undefined,
        })) as RequisitionRow;
        replaceReq(updated);
        setLineDrafts((prev) => ({
          ...prev,
          [req.id]: { description: "", quantity: "1", unitPrice: "0", uom: "EA" },
        }));
        setMessage(t("lineSaved"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
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
              <label htmlFor="req-number" className="text-xs font-medium text-muted-foreground">
                {t("number")}
              </label>
              <Input id="req-number" value={reqNumber} onChange={(e) => setReqNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="req-title-en" className="text-xs font-medium text-muted-foreground">
                {t("titleEn")}
              </label>
              <Input id="req-title-en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="req-title-ar" className="text-xs font-medium text-muted-foreground">
                {t("titleAr")}
              </label>
              <Input id="req-title-ar" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} dir="rtl" />
            </div>
            <Button disabled={pending || !reqNumber || !titleEn || !titleAr} onClick={handleCreate}>
              {t("createDraft")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-4">
        {requisitions.map((r) => {
          const lines = r.purchase_requisition_lines ?? [];
          const computedTotal = lines.reduce(
            (sum, l) => sum.plus(lineTotal(l.quantity, l.unit_price)),
            money(0),
          );
          const draft = getLineDraft(r.id);
          return (
            <Card key={r.id} as="article" data-testid="requisition-card">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {r.requisition_number} — {pickLocalized(locale, r.title_en, r.title_ar)}
                </CardTitle>
                <Badge variant="outline">{r.requisition_status}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {t("estimatedTotal", {
                    amount: formatMoney(r.estimated_total || computedTotal.toFixed(4), "SAR"),
                  })}
                  {lines.length > 0
                    ? ` · ${t("lineCount", { count: lines.length })} · ${t("computedTotal", { amount: formatMoney(computedTotal.toFixed(4), "SAR") })}`
                    : null}
                </p>

                {lines.length > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 text-start">#</th>
                          <th className="px-2 py-1 text-start">{t("lineDescription")}</th>
                          <th className="px-2 py-1 text-end">{t("quantity")}</th>
                          <th className="px-2 py-1 text-end">{t("unitPrice")}</th>
                          <th className="px-2 py-1 text-end">{t("lineTotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines
                          .slice()
                          .sort((a, b) => a.line_number - b.line_number)
                          .map((l) => (
                            <tr key={l.id} className="border-t border-border">
                              <td className="px-2 py-1">{l.line_number}</td>
                              <td className="px-2 py-1">{l.description}</td>
                              <td className="px-2 py-1 text-end">{l.quantity}</td>
                              <td className="px-2 py-1 text-end">{formatMoney(l.unit_price, "SAR")}</td>
                              <td className="px-2 py-1 text-end">
                                {formatMoney(l.line_total ?? lineTotal(l.quantity, l.unit_price).toFixed(4), "SAR")}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {canSubmit && r.requisition_status === "draft" ? (
                  <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("lineDescription")}</label>
                      <Input
                        value={draft.description}
                        onChange={(e) => setLineField(r.id, "description", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("quantity")}</label>
                      <Input
                        type="number"
                        className="w-24"
                        value={draft.quantity}
                        onChange={(e) => setLineField(r.id, "quantity", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("unitPrice")}</label>
                      <Input
                        type="number"
                        className="w-28"
                        value={draft.unitPrice}
                        onChange={(e) => setLineField(r.id, "unitPrice", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("uom")}</label>
                      <Input
                        className="w-20"
                        value={draft.uom}
                        onChange={(e) => setLineField(r.id, "uom", e.target.value)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || !draft.description}
                      onClick={() => handleUpsertLine(r)}
                    >
                      {t("addLine")}
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {canSubmit && r.requisition_status === "draft" ? (
                    <Button size="sm" disabled={pending} onClick={() => runStatus(r.id, submitRequisitionAction, "submitted")}>
                      {tCommon("submit")}
                    </Button>
                  ) : null}
                  {canApprove && r.requisition_status === "submitted" ? (
                    <Button size="sm" disabled={pending} onClick={() => runStatus(r.id, departmentApproveRequisitionAction, "departmentApproved")}>
                      {t("departmentApprove")}
                    </Button>
                  ) : null}
                  {canApprove && r.requisition_status === "department_approved" ? (
                    <Button size="sm" disabled={pending} onClick={() => runStatus(r.id, budgetCheckRequisitionAction, "budgetChecked")}>
                      {t("budgetCheck")}
                    </Button>
                  ) : null}
                  {canApprove && r.requisition_status === "budget_checked" ? (
                    <Button size="sm" disabled={pending} onClick={() => runStatus(r.id, sendRequisitionToProcurementReviewAction, "sentToProcurement")}>
                      {t("sendToProcurement")}
                    </Button>
                  ) : null}
                  {canApprove && r.requisition_status === "procurement_review" ? (
                    <Button size="sm" disabled={pending} onClick={() => runStatus(r.id, approveRequisitionAction, "approved")}>
                      {t("approve")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
