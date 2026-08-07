"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  approveAwardAction,
  createAndSubmitAwardAction,
  createQuotationAction,
  submitEvaluationAction,
} from "@/app/actions/procurement-actions";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function QuotationWorkspace({
  quotations,
  rfqOptions,
  vendorOptions,
  rfqLinesByRfq,
  canCreate,
}: {
  quotations: Array<{
    id: string;
    supplier_quote_reference: string;
    quotation_status: string;
    total_amount?: string | number;
    subtotal_ex_vat?: string | number;
    vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
    rfqs?: { rfq_number: string } | { rfq_number: string }[] | null;
  }>;
  rfqOptions: { id: string; label: string }[];
  vendorOptions: { id: string; label: string }[];
  rfqLinesByRfq: Record<string, { id: string; description: string; quantity: string | number }[]>;
  canCreate: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(quotations);
  const [rfqId, setRfqId] = useState(rfqOptions[0]?.id ?? "");
  const [vendorId, setVendorId] = useState(vendorOptions[0]?.id ?? "");
  const [ref, setRef] = useState(() => `Q-${Date.now()}`);
  const [unitPrice, setUnitPrice] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const lines = rfqLinesByRfq[rfqId] ?? [];

  const handleCreate = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const payloadLines = lines.map((l) => ({
          rfq_line_id: l.id,
          quoted_quantity: Number(l.quantity),
          unit_price_ex_vat: Number(unitPrice),
        }));
        if (payloadLines.length === 0) throw new Error(t("needRfqLines"));
        const created = await createQuotationAction({
          rfqId,
          vendorId,
          supplierQuoteReference: ref,
          lines: payloadLines,
        });
        setRows((prev) => [created as (typeof rows)[0], ...prev]);
        setMessage(t("quotationCreated"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  return (
    <div className="space-y-6">
      {canCreate && rfqOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createQuotation")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={rfqId}
              onChange={(e) => setRfqId(e.target.value)}
            >
              {rfqOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              {vendorOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("quoteRef")} />
            <Input
              type="number"
              className="w-28"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder={t("unitPrice")}
            />
            <Button disabled={pending || !rfqId || !vendorId || !ref} onClick={handleCreate}>
              {t("createQuotation")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground">{t("emptyQuotations")}</li>
        ) : (
          rows.map((q) => {
            const vendor = firstRel(q.vendors);
            const rfq = firstRel(q.rfqs);
            return (
              <li key={q.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
                <div>
                  <p className="font-medium">{q.supplier_quote_reference}</p>
                  <p className="text-muted-foreground">
                    {rfq?.rfq_number ?? "—"} ·{" "}
                    {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : "—"}
                  </p>
                </div>
                <div className="text-end">
                  <Badge variant="outline">{q.quotation_status}</Badge>
                  <p className="mt-1">{formatMoney(q.total_amount ?? q.subtotal_ex_vat ?? 0, "SAR")}</p>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function EvaluationWorkspace({
  evaluations,
  quotationOptions,
  canUpdate,
}: {
  evaluations: Array<{
    id: string;
    evaluation_status: string;
    weighted_score?: string | number;
    recommendation?: string | null;
    rfqs?: { rfq_number: string } | { rfq_number: string }[] | null;
    supplier_quotations?:
      | { supplier_quote_reference: string }
      | { supplier_quote_reference: string }[]
      | null;
  }>;
  quotationOptions: {
    id: string;
    rfqId: string;
    label: string;
  }[];
  canUpdate: boolean;
}) {
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(evaluations);
  const [quotationId, setQuotationId] = useState(quotationOptions[0]?.id ?? "");
  const [score, setScore] = useState("80");
  const [recommendation, setRecommendation] = useState("recommend");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = quotationOptions.find((q) => q.id === quotationId);

  const handleSubmit = () => {
    if (!selected) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const created = await submitEvaluationAction({
          rfqId: selected.rfqId,
          quotationId: selected.id,
          criteria: [
            {
              sequence_no: 1,
              category: "general",
              name_en: "Commercial",
              name_ar: "تجاري",
              weight_percent: 100,
              scoring_scale_max: 100,
            },
          ],
          scores: [{ sequence_no: 1, score: Number(score), is_pass: true }],
          recommendation,
        });
        setRows((prev) => [created as (typeof rows)[0], ...prev]);
        setMessage(t("evaluationSubmitted"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  return (
    <div className="space-y-6">
      {canUpdate && quotationOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("submitEvaluation")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={quotationId}
              onChange={(e) => setQuotationId(e.target.value)}
            >
              {quotationOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input type="number" className="w-24" value={score} onChange={(e) => setScore(e.target.value)} />
            <Input value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
            <Button disabled={pending || !quotationId} onClick={handleSubmit}>
              {t("submitEvaluation")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground">{t("emptyEvaluations")}</li>
        ) : (
          rows.map((e) => {
            const rfq = firstRel(e.rfqs);
            const q = firstRel(e.supplier_quotations);
            return (
              <li key={e.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
                <div>
                  <p className="font-medium">{rfq?.rfq_number ?? e.id.slice(0, 8)}</p>
                  <p className="text-muted-foreground">{q?.supplier_quote_reference ?? "—"}</p>
                </div>
                <div className="text-end">
                  <Badge variant="outline">{e.evaluation_status}</Badge>
                  <p className="mt-1">{e.weighted_score ?? "—"}</p>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

export function AwardPanel({
  awards,
  quotationOptions,
  rfqLinesByRfq,
  canCreate,
  canApprove,
}: {
  awards: Array<{
    id: string;
    award_status: string;
    total_amount?: string | number;
    vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
    rfqs?: { rfq_number: string } | { rfq_number: string }[] | null;
  }>;
  quotationOptions: {
    id: string;
    rfqId: string;
    label: string;
    lines: { rfq_line_id: string; awarded_quantity: number; unit_price_ex_vat: number }[];
  }[];
  rfqLinesByRfq: Record<string, { id: string; quantity: string | number }[]>;
  canCreate: boolean;
  canApprove: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(awards);
  const [quotationId, setQuotationId] = useState(quotationOptions[0]?.id ?? "");
  const [unitPrice, setUnitPrice] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selected = quotationOptions.find((q) => q.id === quotationId);

  return (
    <div className="space-y-4">
      {canCreate && selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createAward")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={quotationId}
              onChange={(e) => setQuotationId(e.target.value)}
            >
              {quotationOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input type="number" className="w-28" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <Button
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  setMessage(null);
                  try {
                    const rfqLines = rfqLinesByRfq[selected.rfqId] ?? [];
                    const lines = rfqLines.map((l) => ({
                      rfq_line_id: l.id,
                      awarded_quantity: Number(l.quantity),
                      unit_price_ex_vat: Number(unitPrice),
                    }));
                    const created = await createAndSubmitAwardAction({
                      rfqId: selected.rfqId,
                      quotationId: selected.id,
                      lines,
                      justification: "Award from evaluation workspace",
                    });
                    setRows((prev) => [created as (typeof rows)[0], ...prev]);
                    setMessage(t("awardSubmitted"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createAward")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((a) => {
          const vendor = firstRel(a.vendors);
          const rfq = firstRel(a.rfqs);
          return (
            <li key={a.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
              <div>
                <p className="font-medium">{rfq?.rfq_number ?? a.id.slice(0, 8)}</p>
                <p className="text-muted-foreground">
                  {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-end">
                  <Badge variant="outline">{a.award_status}</Badge>
                  <p className="mt-1">{formatMoney(a.total_amount ?? 0, "SAR")}</p>
                </div>
                {canApprove && a.award_status === "submitted" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const updated = await approveAwardAction(a.id);
                          setRows((prev) =>
                            prev.map((r) => (r.id === a.id ? (updated as (typeof rows)[0]) : r)),
                          );
                          setMessage(t("awardApproved"));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("actionError"));
                        }
                      });
                    }}
                  >
                    {t("approveAward")}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
