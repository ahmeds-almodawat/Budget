"use client";

import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  po_status: string;
  total_amount: string;
  vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
}

export interface SupplierInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_status: string;
  gross_amount: string;
  purchase_orders?: { po_number: string } | { po_number: string }[] | null;
  vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
}

export interface PaymentRequestRow {
  id: string;
  request_status: string;
  amount: string;
  supplier_invoices?: { invoice_number: string } | { invoice_number: string }[] | null;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function ProcurementWorkspace({
  purchaseOrders,
  invoices,
  payments,
}: {
  purchaseOrders: PurchaseOrderRow[];
  invoices: SupplierInvoiceRow[];
  payments: PaymentRequestRow[];
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const tCommon = useTranslations("common");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("purchaseOrders")}</CardTitle>
        </CardHeader>
        <CardContent>
          {purchaseOrders.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("emptyOrders")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {purchaseOrders.map((po) => {
                const vendor = firstRelation(po.vendors);
                return (
                  <li key={po.id} className="flex items-center justify-between border-b py-2" data-testid="po-row">
                    <div>
                      <p className="font-medium">{t("poNumber", { number: po.po_number })}</p>
                      <p className="text-text-secondary">
                        {t("vendor")}: {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : tCommon("none")}
                      </p>
                    </div>
                    <div className="text-end">
                      <Badge variant="outline">{po.po_status}</Badge>
                      <p className="mt-1">{formatMoney(po.total_amount, "SAR")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("supplierInvoices")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("emptyInvoices")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {invoices.map((inv) => {
                const vendor = firstRelation(inv.vendors);
                const po = firstRelation(inv.purchase_orders);
                return (
                  <li key={inv.id} className="flex items-center justify-between border-b py-2" data-testid="invoice-row">
                    <div>
                      <p className="font-medium">{t("invoiceNumber", { number: inv.invoice_number })}</p>
                      <p className="text-text-secondary">
                        {t("vendor")}: {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : tCommon("none")}
                        {po ? ` · PO ${po.po_number}` : ""}
                      </p>
                    </div>
                    <div className="text-end">
                      <Badge variant="outline">{inv.invoice_status}</Badge>
                      <p className="mt-1">{formatMoney(inv.gross_amount, "SAR")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("paymentRequests")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("emptyPayments")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {payments.map((pr) => {
                const invoice = firstRelation(pr.supplier_invoices);
                return (
                  <li key={pr.id} className="flex items-center justify-between border-b py-2" data-testid="payment-row">
                    <div>
                      <p className="font-medium">
                        {invoice ? t("invoiceNumber", { number: invoice.invoice_number }) : pr.id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="text-end">
                      <Badge variant="outline">{pr.request_status}</Badge>
                      <p className="mt-1">{formatMoney(pr.amount, "SAR")}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
