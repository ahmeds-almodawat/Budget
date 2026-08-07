"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  acceptGoodsReceiptAction,
  acceptServiceEntryAction,
  activateContractAction,
  approveContractAction,
  approvePaymentRequestAction,
  approveSupplierInvoiceAction,
  cancelPaymentRequestAction,
  closeContractAction,
  createContractAction,
  createGoodsReceiptAction,
  createPaymentRequestAction,
  createServiceEntryAction,
  createSupplierInvoiceAction,
  expireContractAction,
  matchSupplierInvoiceAction,
  overrideInvoiceMatchAction,
  rejectPaymentRequestAction,
  rejectContractAction,
  reverseSupplierInvoiceAction,
  submitContractAction,
  submitPaymentRequestAction,
  terminateContractAction,
} from "@/app/actions/procurement-actions";
import { formatMoney } from "@/lib/money";
import { lineTotal } from "@/domain/procurement/calculations";
import { pickLocalized } from "@/lib/i18n/display";
import { ChartCard, ExceptionSummary } from "@/components/analytics";
import { toNumber } from "@/domain/analytics/format";

function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function ContractWorkspace({
  initialContracts,
  vendorOptions,
  canCreate,
  canApprove,
  canUpdate,
}: {
  initialContracts: Array<{
    id: string;
    contract_number: string;
    title_en: string;
    title_ar: string;
    contract_status: string;
    ceiling_value: string | number;
    remaining_ceiling?: string;
    vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
  }>;
  vendorOptions: { id: string; label: string }[];
  canCreate: boolean;
  canApprove: boolean;
  canUpdate: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(initialContracts);
  const [vendorId, setVendorId] = useState(vendorOptions[0]?.id ?? "");
  const [number, setNumber] = useState(() => `CTR-${Date.now()}`);
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ceiling, setCeiling] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const transitionContract = (
    contractId: string,
    action: (id: string) => Promise<unknown>,
    successKey:
      | "contractSubmitted"
      | "contractApproved"
      | "contractActivated"
      | "contractRejected"
      | "contractClosed"
      | "contractTerminated"
      | "contractExpired",
  ) => {
    startTransition(async () => {
      setError(null);
      try {
        const updated = await action(contractId);
        setRows((prev) =>
          prev.map((row) => (row.id === contractId ? (updated as (typeof rows)[0]) : row)),
        );
        setMessage(t(successKey));
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
            <CardTitle className="text-base">{t("createContract")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={t("contractNumber")} />
            <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={t("titleEn")} />
            <Input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} placeholder={t("titleAr")} dir="rtl" />
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            <Input type="number" className="w-28" value={ceiling} onChange={(e) => setCeiling(e.target.value)} />
            <Button
              disabled={pending || !vendorId || !number || !titleEn || !titleAr || !startDate || !endDate}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  try {
                    const created = await createContractAction({
                      vendorId,
                      contractNumber: number,
                      titleEn,
                      titleAr,
                      startDate,
                      endDate,
                      ceilingValue: ceiling,
                    });
                    setRows((prev) => [created as (typeof rows)[0], ...prev]);
                    setMessage(t("contractCreated"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createContract")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((c) => {
          const vendor = firstRel(c.vendors);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
              <div>
                <p className="font-medium">
                  {c.contract_number} — {pickLocalized(locale, c.title_en, c.title_ar)}
                </p>
                <p className="text-muted-foreground">
                  {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : "—"} ·{" "}
                  {formatMoney(c.ceiling_value, "SAR")}
                  {c.remaining_ceiling != null
                    ? ` · ${t("remainingCeiling")}: ${formatMoney(c.remaining_ceiling, "SAR")}`
                    : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{c.contract_status}</Badge>
                {canUpdate && c.contract_status === "draft" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => transitionContract(c.id, submitContractAction, "contractSubmitted")}
                  >
                    {t("submitContract")}
                  </Button>
                ) : null}
                {canApprove && c.contract_status === "submitted" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => transitionContract(c.id, approveContractAction, "contractApproved")}
                    >
                      {t("approveContract")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => transitionContract(c.id, rejectContractAction, "contractRejected")}
                    >
                      {t("rejectContract")}
                    </Button>
                  </>
                ) : null}
                {canUpdate && c.contract_status === "approved" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => transitionContract(c.id, activateContractAction, "contractActivated")}
                  >
                    {t("activateContract")}
                  </Button>
                ) : null}
                {canUpdate && c.contract_status === "active" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => transitionContract(c.id, closeContractAction, "contractClosed")}
                    >
                      {t("closeContract")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => transitionContract(c.id, expireContractAction, "contractExpired")}
                    >
                      {t("expireContract")}
                    </Button>
                  </>
                ) : null}
                {canApprove && c.contract_status === "active" ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={pending}
                    onClick={() => transitionContract(c.id, terminateContractAction, "contractTerminated")}
                  >
                    {t("terminateContract")}
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

export function ReceiptWorkspace({
  initialReceipts,
  poOptions,
  poLinesByPo,
  canCreate,
  canApprove,
}: {
  initialReceipts: Array<{
    id: string;
    receipt_number: string;
    receipt_status: string;
    purchase_orders?: { po_number: string } | { po_number: string }[] | null;
  }>;
  poOptions: { id: string; label: string }[];
  poLinesByPo: Record<string, { id: string; quantity: string | number }[]>;
  canCreate: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(initialReceipts);
  const [poId, setPoId] = useState(poOptions[0]?.id ?? "");
  const [receiptNumber, setReceiptNumber] = useState(() => `GR-${Date.now()}`);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {canCreate && poOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createReceipt")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
            >
              {poOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} />
            <Button
              disabled={pending || !poId}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  try {
                    const lines = (poLinesByPo[poId] ?? []).map((l) => ({
                      purchase_order_line_id: l.id,
                      quantity_received: Number(l.quantity),
                      quantity_accepted: Number(l.quantity),
                    }));
                    const created = await createGoodsReceiptAction({
                      purchaseOrderId: poId,
                      receiptNumber,
                      lines,
                    });
                    setRows((prev) => [created as (typeof rows)[0], ...prev]);
                    setMessage(t("receiptCreated"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createReceipt")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((r) => {
          const po = firstRel(r.purchase_orders);
          return (
            <li key={r.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
              <div>
                <p className="font-medium">{r.receipt_number}</p>
                <p className="text-muted-foreground">{po?.po_number ?? "—"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{r.receipt_status}</Badge>
                {canApprove && r.receipt_status === "draft" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const updated = await acceptGoodsReceiptAction(r.id);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? (updated as (typeof rows)[0]) : x)));
                          setMessage(t("receiptAccepted"));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("actionError"));
                        }
                      });
                    }}
                  >
                    {t("acceptReceipt")}
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

export function ServiceEntryWorkspace({
  initialEntries,
  vendorOptions,
  poOptions,
  canCreate,
  canApprove,
}: {
  initialEntries: Array<{
    id: string;
    entry_number: string;
    entry_status: string;
    accepted_amount?: string | number;
    description?: string;
  }>;
  vendorOptions: { id: string; label: string }[];
  poOptions: { id: string; label: string }[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(initialEntries);
  const [vendorId, setVendorId] = useState(vendorOptions[0]?.id ?? "");
  const [poId, setPoId] = useState(poOptions[0]?.id ?? "");
  const [entryNumber, setEntryNumber] = useState(() => `SE-${Date.now()}`);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createServiceEntry")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              {vendorOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
            >
              {poOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input value={entryNumber} onChange={(e) => setEntryNumber(e.target.value)} />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("description")} />
            <Input type="number" className="w-28" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button
              disabled={pending || !vendorId || !poId || !description}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  try {
                    const created = await createServiceEntryAction({
                      vendorId,
                      purchaseOrderId: poId,
                      entryNumber,
                      description,
                      lines: [
                        {
                          description,
                          quantity: 1,
                          unit_price_ex_vat: Number(amount),
                          accepted_amount: Number(amount),
                        },
                      ],
                    });
                    setRows((prev) => [created as (typeof rows)[0], ...prev]);
                    setMessage(t("serviceEntryCreated"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createServiceEntry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((e) => (
          <li key={e.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
            <div>
              <p className="font-medium">{e.entry_number}</p>
              <p className="text-muted-foreground">{e.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{e.entry_status}</Badge>
              {canApprove && e.entry_status === "draft" ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        const updated = await acceptServiceEntryAction(e.id);
                        setRows((prev) => prev.map((x) => (x.id === e.id ? (updated as (typeof rows)[0]) : x)));
                        setMessage(t("serviceEntryAccepted"));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : t("actionError"));
                      }
                    });
                  }}
                >
                  {t("acceptServiceEntry")}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SupplierInvoiceWorkspace({
  initialInvoices,
  poOptions,
  canCreate,
  canUpdate,
  canApprove,
}: {
  initialInvoices: Array<{
    id: string;
    invoice_number: string;
    invoice_status: string;
    match_status?: string;
    gross_amount: string | number;
    purchase_orders?: { po_number: string } | { po_number: string }[] | null;
    vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
  }>;
  poOptions: {
    id: string;
    label: string;
    vendorId: string;
    lines: Array<{
      id: string;
      lineNumber: number;
      description: string;
      quantity: string;
      unitPrice: string;
    }>;
  }[];
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const [rows, setRows] = useState(initialInvoices);
  const [poId, setPoId] = useState(poOptions[0]?.id ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(() => `INV-${Date.now()}`);
  const [invoiceDate, setInvoiceDate] = useState("");
  const [poLineId, setPoLineId] = useState(poOptions[0]?.lines[0]?.id ?? "");
  const [invoiceQuantity, setInvoiceQuantity] = useState(poOptions[0]?.lines[0]?.quantity ?? "1");
  const [overrideReason, setOverrideReason] = useState<Record<string, string>>({});
  const [reverseReason, setReverseReason] = useState<Record<string, string>>({});
  const [replacementNumber, setReplacementNumber] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const selectedPo = poOptions.find((p) => p.id === poId);
  const selectedLine = selectedPo?.lines.find((line) => line.id === poLineId);
  const gross = selectedLine ? lineTotal(invoiceQuantity || "0", selectedLine.unitPrice).toFixed(4) : "0.0000";

  return (
    <div className="space-y-6">
      {canCreate && selectedPo ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createInvoice")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={poId}
              onChange={(e) => {
                const nextPo = poOptions.find((option) => option.id === e.target.value);
                setPoId(e.target.value);
                setPoLineId(nextPo?.lines[0]?.id ?? "");
                setInvoiceQuantity(nextPo?.lines[0]?.quantity ?? "1");
              }}
            >
              {poOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={poLineId}
              onChange={(event) => {
                const line = selectedPo.lines.find((candidate) => candidate.id === event.target.value);
                setPoLineId(event.target.value);
                setInvoiceQuantity(line?.quantity ?? "1");
              }}
              aria-label={t("invoiceLine")}
            >
              {selectedPo.lines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.lineNumber} — {line.description}
                </option>
              ))}
            </select>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            <Input
              type="number"
              className="w-28"
              min="0.0001"
              step="0.0001"
              value={invoiceQuantity}
              onChange={(e) => setInvoiceQuantity(e.target.value)}
              aria-label={t("invoiceQuantity")}
            />
            <span className="text-sm text-text-secondary">{formatMoney(gross, "SAR")}</span>
            <Button
              disabled={pending || !invoiceDate || !selectedLine || Number(invoiceQuantity) <= 0}
              onClick={() => {
                const invoiceLine = selectedLine;
                if (!invoiceLine) return;
                startTransition(async () => {
                  setError(null);
                  try {
                    const created = await createSupplierInvoiceAction({
                      purchaseOrderId: selectedPo.id,
                      vendorId: selectedPo.vendorId,
                      invoiceNumber,
                      invoiceDate,
                      grossAmount: gross,
                      subtotalExVat: gross,
                      vatAmount: "0",
                      lines: [
                        {
                          purchase_order_line_id: invoiceLine.id,
                          line_number: invoiceLine.lineNumber,
                          description: invoiceLine.description,
                          quantity: invoiceQuantity,
                          unit_price_ex_vat: invoiceLine.unitPrice,
                          vat_amount: "0",
                        },
                      ],
                    });
                    setRows((prev) => [created as (typeof rows)[0], ...prev]);
                    setMessage(t("invoiceCreated"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createInvoice")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <div data-testid="invoice-match-visual">
      <ChartCard
        title={t("matchVisualTitle")}
        empty={rows.length === 0}
        emptyTitle={t("emptyMatchVisual")}
      >
        <ExceptionSummary
          items={[
            {
              id: "matched",
              label: "matched",
              count: rows.filter((r) => r.match_status === "matched").length,
              tone: "neutral",
            },
            {
              id: "tolerance",
              label: "matched_within_tolerance",
              count: rows.filter((r) => r.match_status === "matched_within_tolerance").length,
              tone: "warning",
            },
            {
              id: "exception",
              label: "exception",
              count: rows.filter((r) => r.match_status === "exception").length,
              tone: "danger",
            },
            {
              id: "overridden",
              label: "overridden",
              count: rows.filter((r) => r.match_status === "overridden").length,
              tone: "warning",
            },
          ]}
        />
        <ul className="mt-4 space-y-2 text-xs text-text-secondary">
          {rows
            .filter((inv) => inv.match_status)
            .slice(0, 8)
            .map((inv) => {
              const po = firstRel(inv.purchase_orders);
              return (
                <li key={inv.id} className="flex flex-wrap justify-between gap-2 border-b border-border/60 py-1">
                  <span>
                    {inv.invoice_number}
                    {po ? ` · PO ${po.po_number}` : ""}
                  </span>
                  <span className="tabular-nums">
                    {inv.match_status} · {formatMoney(inv.gross_amount, "SAR")}
                  </span>
                  <span className="sr-only">amount {toNumber(inv.gross_amount)}</span>
                </li>
              );
            })}
        </ul>
      </ChartCard>
      </div>
      <ul className="space-y-2">
        {rows.map((inv) => {
          const vendor = firstRel(inv.vendors);
          const po = firstRel(inv.purchase_orders);
          return (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
              <div>
                <p className="font-medium">{t("invoiceNumber", { number: inv.invoice_number })}</p>
                <p className="text-muted-foreground">
                  {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : "—"}
                  {po ? ` · PO ${po.po_number}` : ""}
                  {inv.match_status ? ` · ${inv.match_status}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{inv.invoice_status}</Badge>
                <span>{formatMoney(inv.gross_amount, "SAR")}</span>
                {canUpdate && inv.invoice_status === "draft" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const updated = await matchSupplierInvoiceAction(inv.id);
                          setRows((prev) => prev.map((x) => (x.id === inv.id ? (updated as (typeof rows)[0]) : x)));
                          setMessage(t("invoiceMatched"));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("actionError"));
                        }
                      });
                    }}
                  >
                    {t("matchInvoice")}
                  </Button>
                ) : null}
                {canApprove && inv.match_status === "exception" ? (
                  <>
                    <Input
                      className="w-40"
                      placeholder={t("overrideReason")}
                      value={overrideReason[inv.id] ?? ""}
                      onChange={(e) => setOverrideReason((p) => ({ ...p, [inv.id]: e.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending || (overrideReason[inv.id] ?? "").length < 5}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const updated = await overrideInvoiceMatchAction({
                              supplierInvoiceId: inv.id,
                              reason: overrideReason[inv.id],
                            });
                            setRows((prev) => prev.map((x) => (x.id === inv.id ? (updated as (typeof rows)[0]) : x)));
                            setMessage(t("matchOverridden"));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t("actionError"));
                          }
                        });
                      }}
                    >
                      {t("overrideMatch")}
                    </Button>
                  </>
                ) : null}
                {canApprove && inv.invoice_status === "matched" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const updated = await approveSupplierInvoiceAction(inv.id);
                          setRows((prev) => prev.map((x) => (x.id === inv.id ? (updated as (typeof rows)[0]) : x)));
                          setMessage(t("invoiceApproved"));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("actionError"));
                        }
                      });
                    }}
                  >
                    {t("approveInvoice")}
                  </Button>
                ) : null}
                {canUpdate && inv.invoice_status === "approved" ? (
                  <>
                    <Input
                      className="w-40"
                      placeholder={t("reversalReason")}
                      value={reverseReason[inv.id] ?? ""}
                      onChange={(event) => setReverseReason((current) => ({ ...current, [inv.id]: event.target.value }))}
                    />
                    <Input
                      className="w-40"
                      placeholder={t("replacementInvoiceNumber")}
                      value={replacementNumber[inv.id] ?? ""}
                      onChange={(event) => setReplacementNumber((current) => ({ ...current, [inv.id]: event.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending || (reverseReason[inv.id]?.trim().length ?? 0) < 5}
                      onClick={() => {
                        startTransition(async () => {
                          setError(null);
                          try {
                            const updated = (await reverseSupplierInvoiceAction({
                              supplierInvoiceId: inv.id,
                              reason: reverseReason[inv.id],
                              replacementInvoiceNumber: replacementNumber[inv.id] || undefined,
                              replacementInvoiceDate: replacementNumber[inv.id] ? invoiceDate || undefined : undefined,
                            })) as (typeof rows);
                            setRows((current) => {
                              const changed = new Map(updated.map((row) => [row.id, row]));
                              const existing = current.map((row) => changed.get(row.id) ?? row);
                              return [...updated.filter((row) => !current.some((old) => old.id === row.id)), ...existing];
                            });
                            setMessage(t("invoiceReversed"));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t("actionError"));
                          }
                        });
                      }}
                    >
                      {t("reverseInvoice")}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PaymentRequestWorkspace({
  initialRequests,
  invoiceOptions,
  canCreate,
  canUpdate,
  canApprove,
}: {
  initialRequests: Array<{
    id: string;
    request_status: string;
    amount: string | number;
    supplier_invoices?: { invoice_number: string } | { invoice_number: string }[] | null;
  }>;
  invoiceOptions: { id: string; label: string; maxAmount: string }[];
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
}) {
  const t = useTranslations("procurement");
  const tCommon = useTranslations("common");
  const [rows, setRows] = useState(initialRequests);
  const [invoiceId, setInvoiceId] = useState(invoiceOptions[0]?.id ?? "");
  const [amount, setAmount] = useState(invoiceOptions[0]?.maxAmount ?? "0");
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      {canCreate && invoiceOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createPaymentRequest")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const inv = invoiceOptions.find((i) => i.id === e.target.value);
                if (inv) setAmount(inv.maxAmount);
              }}
            >
              {invoiceOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Input type="number" className="w-28" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button
              disabled={pending || !invoiceId}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  try {
                    const created = await createPaymentRequestAction({
                      supplierInvoiceId: invoiceId,
                      amount,
                    });
                    setRows((prev) => [created as (typeof rows)[0], ...prev]);
                    setMessage(t("paymentRequestCreated"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createPaymentRequest")}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map((pr) => {
          const inv = firstRel(pr.supplier_invoices);
          return (
            <li key={pr.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
              <div>
                <p className="font-medium">
                  {inv ? t("invoiceNumber", { number: inv.invoice_number }) : pr.id.slice(0, 8)}
                </p>
                {pr.request_status === "approved" ? (
                  <p className="text-xs text-muted-foreground">{t("readyForPayment")}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{pr.request_status}</Badge>
                <span>{formatMoney(pr.amount, "SAR")}</span>
                {canUpdate && pr.request_status === "draft" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          const updated = await submitPaymentRequestAction(pr.id);
                          setRows((prev) => prev.map((x) => (x.id === pr.id ? (updated as (typeof rows)[0]) : x)));
                          setMessage(t("paymentRequestSubmitted"));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : t("actionError"));
                        }
                      });
                    }}
                  >
                    {tCommon("submit")}
                  </Button>
                ) : null}
                {canApprove && pr.request_status === "submitted" ? (
                  <>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const updated = await approvePaymentRequestAction(pr.id);
                            setRows((prev) => prev.map((x) => (x.id === pr.id ? (updated as (typeof rows)[0]) : x)));
                            setMessage(t("paymentRequestApproved"));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t("actionError"));
                          }
                        });
                      }}
                    >
                      {t("approvePaymentRequest")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || (reason[pr.id]?.trim().length ?? 0) < 5}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const updated = await rejectPaymentRequestAction({ paymentRequestId: pr.id, reason: reason[pr.id] });
                            setRows((prev) => prev.map((x) => (x.id === pr.id ? (updated as (typeof rows)[0]) : x)));
                            setMessage(t("paymentRequestRejected"));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t("actionError"));
                          }
                        });
                      }}
                    >
                      {tCommon("reject")}
                    </Button>
                  </>
                ) : null}
                {(canUpdate && ["draft", "submitted"].includes(pr.request_status)) ||
                (canApprove && pr.request_status === "approved") ? (
                  <>
                    <Input
                      className="w-40"
                      placeholder={t("paymentDecisionReason")}
                      value={reason[pr.id] ?? ""}
                      onChange={(event) => setReason((current) => ({ ...current, [pr.id]: event.target.value }))}
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={pending || (reason[pr.id]?.trim().length ?? 0) < 5}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            const updated = await cancelPaymentRequestAction({
                              paymentRequestId: pr.id,
                              reason: reason[pr.id],
                              expectedStatus: pr.request_status as "draft" | "submitted" | "approved",
                            });
                            setRows((prev) => prev.map((x) => (x.id === pr.id ? (updated as (typeof rows)[0]) : x)));
                            setMessage(t("paymentRequestCancelled"));
                          } catch (err) {
                            setError(err instanceof Error ? err.message : t("actionError"));
                          }
                        });
                      }}
                    >
                      {tCommon("cancel")}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
