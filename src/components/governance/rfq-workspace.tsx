"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  closeRfqResponsesAction,
  createRfqFromRequisitionAction,
  inviteRfqSupplierAction,
  issueRfqAction,
} from "@/app/actions/procurement-actions";
import { pickLocalized } from "@/lib/i18n/display";

export interface RfqRow {
  id: string;
  rfq_number: string;
  title_en: string;
  title_ar: string;
  rfq_status: string;
  response_deadline?: string | null;
  purchase_requisitions?:
    | { requisition_number: string; title_en: string; title_ar: string }
    | { requisition_number: string; title_en: string; title_ar: string }[]
    | null;
}

function firstRel<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function RfqWorkspace({
  initialRfqs,
  requisitionOptions,
  vendorOptions,
  canCreate,
  canUpdate,
}: {
  initialRfqs: RfqRow[];
  requisitionOptions: { id: string; label: string }[];
  vendorOptions: { id: string; label: string }[];
  canCreate: boolean;
  canUpdate: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("procurement");
  const [rfqs, setRfqs] = useState(initialRfqs);
  const [requisitionId, setRequisitionId] = useState(requisitionOptions[0]?.id ?? "");
  const [rfqNumber, setRfqNumber] = useState(() => `RFQ-${Date.now()}`);
  const [inviteVendorByRfq, setInviteVendorByRfq] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleCreate = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const created = (await createRfqFromRequisitionAction({
          requisitionId,
          rfqNumber,
        })) as RfqRow;
        setRfqs((prev) => [created, ...prev]);
        setMessage(t("rfqCreated"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const run = (fn: () => Promise<unknown>, successKey: string) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        await fn();
        setMessage(t(successKey as "rfqIssued"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  return (
    <div className="space-y-6">
      {canCreate && requisitionOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createRfq")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("fromRequisition")}</label>
              <select
                className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={requisitionId}
                onChange={(e) => setRequisitionId(e.target.value)}
              >
                {requisitionOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("rfqNumber")}</label>
              <Input value={rfqNumber} onChange={(e) => setRfqNumber(e.target.value)} />
            </div>
            <Button disabled={pending || !requisitionId || !rfqNumber} onClick={handleCreate}>
              {t("createRfq")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="grid gap-3">
        {rfqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyRfqs")}</p>
        ) : (
          rfqs.map((rfq) => {
            const req = firstRel(rfq.purchase_requisitions);
            return (
              <Card key={rfq.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {rfq.rfq_number} — {pickLocalized(locale, rfq.title_en, rfq.title_ar)}
                  </CardTitle>
                  <Badge variant="outline">{rfq.rfq_status}</Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {req ? (
                    <p className="text-muted-foreground">
                      {t("fromRequisition")}: {req.requisition_number}
                    </p>
                  ) : null}
                  {canUpdate ? (
                    <div className="flex flex-wrap items-end gap-2">
                      {["draft", "issued", "responses_open"].includes(rfq.rfq_status) ? (
                        <>
                          <select
                            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
                            value={inviteVendorByRfq[rfq.id] ?? ""}
                            onChange={(e) =>
                              setInviteVendorByRfq((p) => ({ ...p, [rfq.id]: e.target.value }))
                            }
                          >
                            <option value="">{t("selectVendor")}</option>
                            {vendorOptions.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={pending || !inviteVendorByRfq[rfq.id]}
                            onClick={() =>
                              run(async () => {
                                const updated = (await inviteRfqSupplierAction({
                                  rfqId: rfq.id,
                                  vendorId: inviteVendorByRfq[rfq.id],
                                })) as RfqRow;
                                setRfqs((prev) => prev.map((r) => (r.id === rfq.id ? { ...r, ...updated } : r)));
                              }, "supplierInvited")
                            }
                          >
                            {t("inviteSupplier")}
                          </Button>
                        </>
                      ) : null}
                      {rfq.rfq_status === "draft" ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              const updated = (await issueRfqAction({ rfqId: rfq.id })) as RfqRow;
                              setRfqs((prev) =>
                                prev.map((r) => (r.id === rfq.id ? { ...r, rfq_status: updated.rfq_status ?? "responses_open" } : r)),
                              );
                            }, "rfqIssued")
                          }
                        >
                          {t("issueRfq")}
                        </Button>
                      ) : null}
                      {["issued", "responses_open"].includes(rfq.rfq_status) ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            run(async () => {
                              const updated = (await closeRfqResponsesAction(rfq.id)) as RfqRow;
                              setRfqs((prev) =>
                                prev.map((r) =>
                                  r.id === rfq.id
                                    ? { ...r, rfq_status: updated.rfq_status ?? "responses_closed" }
                                    : r,
                                ),
                              );
                            }, "rfqClosed")
                          }
                        >
                          {t("closeResponses")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
