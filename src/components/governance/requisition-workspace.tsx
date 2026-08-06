"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createRequisitionDraftAction,
  submitRequisitionAction,
} from "@/app/actions/governance-actions";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

export interface RequisitionRow {
  id: string;
  requisition_number: string;
  title_en: string;
  title_ar: string;
  requisition_status: string;
  estimated_total: string;
  created_at: string;
}

export function RequisitionWorkspace({
  initialRequisitions,
  fiscalPeriodId,
  canCreate,
  canSubmit,
}: {
  initialRequisitions: RequisitionRow[];
  fiscalPeriodId: string;
  canCreate: boolean;
  canSubmit: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("requisition");
  const tCommon = useTranslations("common");
  const [requisitions, setRequisitions] = useState(initialRequisitions);
  const [reqNumber, setReqNumber] = useState(() => `REQ-${Date.now()}`);
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const handleSubmit = (id: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await submitRequisitionAction(id)) as RequisitionRow;
        setRequisitions((prev) => prev.map((r) => (r.id === id ? updated : r)));
        setMessage(t("submitted"));
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
              <label htmlFor="req-number" className="text-xs font-medium text-text-secondary">
                {t("number")}
              </label>
              <Input id="req-number" value={reqNumber} onChange={(e) => setReqNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="req-title-en" className="text-xs font-medium text-text-secondary">
                {t("titleEn")}
              </label>
              <Input id="req-title-en" value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="req-title-ar" className="text-xs font-medium text-text-secondary">
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

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-4">
        {requisitions.map((r) => (
          <Card key={r.id} as="article" data-testid="requisition-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                {r.requisition_number} — {pickLocalized(locale, r.title_en, r.title_ar)}
              </CardTitle>
              <Badge variant="outline">{r.requisition_status}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
              <span>{t("estimatedTotal", { amount: formatMoney(r.estimated_total, "SAR") })}</span>
              {canSubmit && r.requisition_status === "draft" ? (
                <Button size="sm" disabled={pending} onClick={() => handleSubmit(r.id)}>
                  {tCommon("submit")}
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
