"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  approvePoAction,
  cancelPoAction,
  createPoFromAwardAction,
  issuePoAction,
  submitPoAction,
} from "@/app/actions/procurement-actions";
import { formatMoney } from "@/lib/money";
import { pickLocalized } from "@/lib/i18n/display";

function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  po_status: string;
  total_amount: string;
  vendors?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null;
  purchase_order_lines?: Array<{
    id: string;
    line_number: number;
    description: string;
    quantity: string | number;
    unit_price_ex_vat: string | number;
    line_total_ex_vat?: string | number;
  }>;
}

export function PurchaseOrderWorkspace({
  initialOrders,
  awardOptions,
  fiscalPeriodId,
  canCreate,
  canUpdate,
  canApprove,
}: {
  initialOrders: PurchaseOrderRow[];
  awardOptions: { id: string; label: string }[];
  fiscalPeriodId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canApprove: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const tCommon = useTranslations("common");
  const [orders, setOrders] = useState(initialOrders);
  const [awardId, setAwardId] = useState(awardOptions[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const replace = (updated: PurchaseOrderRow) => {
    setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  return (
    <div className="space-y-6">
      {canCreate && awardOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createPoFromAward")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <select
              className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={awardId}
              onChange={(e) => setAwardId(e.target.value)}
            >
              {awardOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("description")}
            />
            <Button
              disabled={pending || !awardId}
              onClick={() => {
                startTransition(async () => {
                  setError(null);
                  setMessage(null);
                  try {
                    const created = (await createPoFromAwardAction({
                      awardId,
                      fiscalPeriodId: fiscalPeriodId || undefined,
                      description: description || undefined,
                    })) as PurchaseOrderRow;
                    setOrders((prev) => [created, ...prev]);
                    setMessage(t("poCreated"));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : t("actionError"));
                  }
                });
              }}
            >
              {t("createPoFromAward")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-3">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyOrders")}</p>
        ) : (
          orders.map((po) => {
            const vendor = firstRel(po.vendors);
            const lines = po.purchase_order_lines ?? [];
            return (
              <Card key={po.id} data-testid="po-row">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">{t("poNumber", { number: po.po_number })}</CardTitle>
                  <Badge variant="outline">{po.po_status}</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {t("vendor")}:{" "}
                    {vendor ? pickLocalized(locale, vendor.name_en, vendor.name_ar) : tCommon("none")}
                    {" · "}
                    {formatMoney(po.total_amount, "SAR")}
                    {lines.length ? ` · ${lines.length} lines` : ""}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canUpdate && po.po_status === "draft" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              replace((await submitPoAction(po.id)) as PurchaseOrderRow);
                              setMessage(t("poSubmitted"));
                            } catch (err) {
                              setError(err instanceof Error ? err.message : t("actionError"));
                            }
                          });
                        }}
                      >
                        {tCommon("submit")}
                      </Button>
                    ) : null}
                    {canApprove && po.po_status === "submitted" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              replace((await approvePoAction(po.id)) as PurchaseOrderRow);
                              setMessage(t("poApproved"));
                            } catch (err) {
                              setError(err instanceof Error ? err.message : t("actionError"));
                            }
                          });
                        }}
                      >
                        {t("approvePo")}
                      </Button>
                    ) : null}
                    {canUpdate && po.po_status === "approved" ? (
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          startTransition(async () => {
                            try {
                              replace((await issuePoAction(po.id)) as PurchaseOrderRow);
                              setMessage(t("poIssued"));
                            } catch (err) {
                              setError(err instanceof Error ? err.message : t("actionError"));
                            }
                          });
                        }}
                      >
                        {t("issuePo")}
                      </Button>
                    ) : null}
                    {canUpdate && !["cancelled", "closed"].includes(po.po_status) ? (
                      <>
                        <Input
                          className="w-40"
                          placeholder={t("cancelReason")}
                          value={cancelReason[po.id] ?? ""}
                          onChange={(e) =>
                            setCancelReason((p) => ({ ...p, [po.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                replace(
                                  (await cancelPoAction({
                                    poId: po.id,
                                    reason: cancelReason[po.id] || undefined,
                                  })) as PurchaseOrderRow,
                                );
                                setMessage(t("poCancelled"));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : t("actionError"));
                              }
                            });
                          }}
                        >
                          {t("cancelPo")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
