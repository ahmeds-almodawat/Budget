"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  approveMasterRecordAction,
  createMasterRecordDraftAction,
  submitMasterRecordAction,
} from "@/app/actions/governance-actions";
import { pickLocalized } from "@/lib/i18n/display";

const RECORD_TYPES = [
  "department",
  "cost_center",
  "cost_category",
  "cost_subcategory",
  "cost_item",
  "vendor",
  "unit_of_measure",
  "currency",
  "vat_treatment",
  "organization_unit",
  "gl_account",
  "approval_threshold",
] as const;

export interface MasterRecordRow {
  id: string;
  record_type: string;
  code: string;
  name_en: string;
  name_ar: string;
  governance_status: string;
  effective_start: string;
  effective_end: string | null;
  updated_at: string;
}

export function MasterDataWorkspace({
  initialRecords,
  canCreate,
  canSubmit,
  canApprove,
}: {
  initialRecords: MasterRecordRow[];
  canCreate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("masterData");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [records, setRecords] = useState(initialRecords);
  const [recordType, setRecordType] = useState<string>(RECORD_TYPES[0]);
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (filterType !== "all" && r.record_type !== filterType) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.name_en.toLowerCase().includes(q) ||
        r.name_ar.includes(q)
      );
    });
  }, [records, search, filterType]);

  const statusLabel = (status: string) => {
    if (status === "draft") return tStatus("draft");
    if (status === "submitted") return tStatus("submitted");
    if (status === "approved") return tStatus("approved");
    if (status === "rejected") return tStatus("rejected");
    if (status === "inactive") return tStatus("inactive");
    return status;
  };

  const refresh = (row: MasterRecordRow) => {
    setRecords((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = row;
        return next;
      }
      return [row, ...prev];
    });
  };

  const handleCreate = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const created = (await createMasterRecordDraftAction({
          recordType,
          code,
          nameEn,
          nameAr,
        })) as MasterRecordRow;
        setRecords((prev) => [created, ...prev]);
        setMessage(t("created"));
        setCode("");
        setNameEn("");
        setNameAr("");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const runTransition = (
    id: string,
    action: () => Promise<unknown>,
    successKey: "submitted" | "approved",
  ) => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const updated = (await action()) as MasterRecordRow;
        refresh(updated);
        setMessage(t(successKey));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder={tCommon("search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            aria-label={tCommon("search")}
          />
          <select
            className="rounded-md border border-border px-3 py-2 text-sm"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label={tCommon("filter")}
          >
            <option value="all">{t("allTypes")}</option>
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("createDraft")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="md-type" className="text-xs font-medium text-text-secondary">
                {t("recordType")}
              </label>
              <select
                id="md-type"
                className="rounded-md border border-border px-3 py-2 text-sm"
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
              >
                {RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="md-code" className="text-xs font-medium text-text-secondary">
                {t("code")}
              </label>
              <Input id="md-code" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="md-name-en" className="text-xs font-medium text-text-secondary">
                {t("nameEn")}
              </label>
              <Input id="md-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="md-name-ar" className="text-xs font-medium text-text-secondary">
                {t("nameAr")}
              </label>
              <Input id="md-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
            </div>
            <Button disabled={pending || !code || !nameEn || !nameAr} onClick={handleCreate}>
              {t("createDraft")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-text-secondary">{tCommon("empty")}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((record) => (
            <Card key={record.id} as="article" data-testid="master-record-card">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">
                  {pickLocalized(locale, record.name_en, record.name_ar)} ({record.code})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{t(`types.${record.record_type}`)}</Badge>
                  <Badge variant="secondary">{statusLabel(record.governance_status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm text-text-secondary">
                <span>{t("effectiveFrom", { date: record.effective_start })}</span>
                <div className="flex flex-wrap gap-2 ms-auto">
                  {canSubmit && record.governance_status === "draft" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runTransition(record.id, () => submitMasterRecordAction(record.id), "submitted")
                      }
                    >
                      {tCommon("submit")}
                    </Button>
                  ) : null}
                  {canApprove && record.governance_status === "submitted" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runTransition(record.id, () => approveMasterRecordAction(record.id), "approved")
                      }
                    >
                      {tCommon("approve")}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
