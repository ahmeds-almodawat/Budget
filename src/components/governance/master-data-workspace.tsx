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
  createMasterRecordRevisionAction,
  deactivateMasterRecordAction,
  rejectMasterRecordAction,
  submitMasterRecordAction,
} from "@/app/actions/governance-actions";
import { pickLocalized } from "@/lib/i18n/display";

const RECORD_TYPES = [
  "organization_unit_type",
  "organization_unit",
  "department",
  "cost_center",
  "team",
  "cost_category",
  "cost_subcategory",
  "cost_item",
  "vendor",
] as const;

const HIERARCHICAL_TYPES = new Set([
  "organization_unit",
  "department",
  "cost_center",
  "team",
  "cost_category",
  "cost_subcategory",
  "cost_item",
]);

const ORGANIZATION_TYPES = new Set(["organization_unit", "department", "cost_center", "team"]);
const COST_TYPES = new Set(["cost_category", "cost_subcategory", "cost_item"]);

export interface MasterRecordRow {
  id: string;
  record_type: string;
  code: string;
  name_en: string;
  name_ar: string;
  parent_id: string | null;
  governance_status: string;
  description: string | null;
  attributes: Record<string, unknown>;
  revision_number: number;
  supersedes_record_id: string | null;
  is_current: boolean;
  effective_start: string;
  effective_end: string | null;
  updated_at: string;
}

type ViewMode = "list" | "tree";

interface TreeNode extends MasterRecordRow {
  children: TreeNode[];
}

function buildTree(records: MasterRecordRow[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const r of records) {
    map.set(r.id, { ...r, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function TreeRows({
  nodes,
  depth,
  locale,
  pending,
  canSubmit,
  canApprove,
  canDeactivate,
  onSubmit,
  onApprove,
  onReject,
  onDeactivate,
  labels,
}: {
  nodes: TreeNode[];
  depth: number;
  locale: string;
  pending: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canDeactivate: boolean;
  onSubmit: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDeactivate: (id: string) => void;
  labels: {
    type: (type: string) => string;
    status: (status: string) => string;
    submit: string;
    approve: string;
    reject: string;
    deactivate: string;
  };
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.id} style={{ paddingInlineStart: depth * 16 }} className="border-b border-border py-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium">
              {pickLocalized(locale, node.name_en, node.name_ar)} ({node.code})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{labels.type(node.record_type)}</Badge>
              <Badge variant="secondary">{labels.status(node.governance_status)}</Badge>
              {canSubmit && node.governance_status === "draft" ? (
                <Button size="sm" disabled={pending} onClick={() => onSubmit(node.id)}>
                  {labels.submit}
                </Button>
              ) : null}
              {canApprove && node.governance_status === "submitted" ? (
                <>
                  <Button size="sm" disabled={pending} onClick={() => onApprove(node.id)}>
                    {labels.approve}
                  </Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => onReject(node.id)}>
                    {labels.reject}
                  </Button>
                </>
              ) : null}
              {canDeactivate && node.governance_status === "approved" ? (
                <Button size="sm" variant="destructive" disabled={pending} onClick={() => onDeactivate(node.id)}>
                  {labels.deactivate}
                </Button>
              ) : null}
            </div>
          </div>
          {node.children.length > 0 ? (
            <TreeRows
              nodes={node.children}
              depth={depth + 1}
              locale={locale}
              pending={pending}
              canSubmit={canSubmit}
              canApprove={canApprove}
              canDeactivate={canDeactivate}
              onSubmit={onSubmit}
              onApprove={onApprove}
              onReject={onReject}
              onDeactivate={onDeactivate}
              labels={labels}
            />
          ) : null}
        </div>
      ))}
    </>
  );
}

export function MasterDataWorkspace({
  initialRecords,
  canCreate,
  canSubmit,
  canApprove,
  canDeactivate,
}: {
  initialRecords: MasterRecordRow[];
  canCreate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canDeactivate: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("masterData");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("status");
  const [records, setRecords] = useState(initialRecords);
  const [recordType, setRecordType] = useState<string>(RECORD_TYPES[0]);
  const [parentId, setParentId] = useState("");
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [revisionSourceId, setRevisionSourceId] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [unitTypeCode, setUnitTypeCode] = useState("");
  const [levelOrder, setLevelOrder] = useState("");
  const [isCostCenterLevel, setIsCostCenterLevel] = useState(false);
  const [classification, setClassification] = useState("opex");
  const [currencyCode, setCurrencyCode] = useState("SAR");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
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

  const parentCandidates = useMemo(
    () =>
      records.filter((r) => {
          const sameHierarchy = r.record_type === recordType ||
            (ORGANIZATION_TYPES.has(recordType) && ORGANIZATION_TYPES.has(r.record_type)) ||
            (COST_TYPES.has(recordType) && COST_TYPES.has(r.record_type));
          return sameHierarchy &&
          r.governance_status !== "rejected" &&
          r.governance_status !== "cancelled";
        }),
    [records, recordType],
  );

  const showTreeToggle =
    filterType !== "all" && HIERARCHICAL_TYPES.has(filterType);

  const treeRoots = useMemo(() => buildTree(filtered), [filtered]);

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
        const revisionSource = records.find((record) => record.id === revisionSourceId);
        const attributes: Record<string, unknown> = { ...(revisionSource?.attributes ?? {}) };
        if (recordType === "organization_unit_type") {
          if (levelOrder) attributes.level_order = Number(levelOrder);
          attributes.is_cost_center_level = isCostCenterLevel;
        }
        if (recordType === "organization_unit" && unitTypeCode.trim()) attributes.unit_type_code = unitTypeCode.trim();
        if (COST_TYPES.has(recordType)) attributes.classification = classification;
        if (recordType === "vendor") attributes.currency_code = currencyCode.trim().toUpperCase() || "SAR";
        const created = (revisionSourceId
          ? await createMasterRecordRevisionAction({
              recordId: revisionSourceId,
              nameEn,
              nameAr,
              parentId: parentId || undefined,
              attributes,
              changeReason,
            })
          : await createMasterRecordDraftAction({
              recordType,
              code,
              nameEn,
              nameAr,
              parentId: parentId || undefined,
              attributes,
            })) as MasterRecordRow;
        setRecords((prev) => [created, ...prev]);
        setMessage(t(revisionSourceId ? "revisionCreated" : "created"));
        setCode("");
        setNameEn("");
        setNameAr("");
        setParentId("");
        setRevisionSourceId("");
        setChangeReason("");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("actionError"));
      }
    });
  };

  const runTransition = (
    action: () => Promise<unknown>,
    successKey: "submitted" | "approved" | "rejected" | "deactivated",
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
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setViewMode("list");
            }}
            aria-label={tCommon("filter")}
          >
            <option value="all">{t("allTypes")}</option>
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
          {showTreeToggle ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={viewMode === "list" ? "default" : "outline"}
                onClick={() => setViewMode("list")}
              >
                {t("listView")}
              </Button>
              <Button
                size="sm"
                variant={viewMode === "tree" ? "default" : "outline"}
                onClick={() => setViewMode("tree")}
              >
                {t("treeView")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t(revisionSourceId ? "createRevision" : "createDraft")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label htmlFor="md-type" className="text-xs font-medium text-text-secondary">
                {t("recordType")}
              </label>
              <select
                id="md-type"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={recordType}
                disabled={Boolean(revisionSourceId)}
                onChange={(e) => {
                  setRecordType(e.target.value);
                  setParentId("");
                }}
              >
                {RECORD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`types.${type}`)}
                  </option>
                ))}
              </select>
            </div>
            {HIERARCHICAL_TYPES.has(recordType) ? (
              <div className="space-y-1">
                <label htmlFor="md-parent" className="text-xs font-medium text-text-secondary">
                  {t("parent")}
                </label>
                <select
                  id="md-parent"
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  <option value="">{t("noParent")}</option>
                  {parentCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {pickLocalized(locale, p.name_en, p.name_ar)} ({p.code})
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-1">
              <label htmlFor="md-code" className="text-xs font-medium text-text-secondary">
                {t("code")}
              </label>
              <Input id="md-code" value={code} disabled={Boolean(revisionSourceId)} onChange={(e) => setCode(e.target.value)} />
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
            {recordType === "organization_unit_type" ? (
              <>
                <Input className="w-28" type="number" min="1" value={levelOrder} onChange={(event) => setLevelOrder(event.target.value)} placeholder={t("levelOrder")} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={isCostCenterLevel} onChange={(event) => setIsCostCenterLevel(event.target.checked)} />
                  {t("costCenterLevel")}
                </label>
              </>
            ) : null}
            {recordType === "organization_unit" ? (
              <Input value={unitTypeCode} onChange={(event) => setUnitTypeCode(event.target.value)} placeholder={t("unitTypeCode")} />
            ) : null}
            {COST_TYPES.has(recordType) ? (
              <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={classification} onChange={(event) => setClassification(event.target.value)}>
                {["capex", "opex", "revenue", "cost_of_revenue", "payroll", "working_capital", "internal_transfer", "statistical"].map((value) => <option key={value} value={value}>{t(`classifications.${value}`)}</option>)}
              </select>
            ) : null}
            {recordType === "vendor" ? (
              <Input className="w-24" value={currencyCode} maxLength={3} onChange={(event) => setCurrencyCode(event.target.value)} placeholder={t("currencyCode")} />
            ) : null}
            {revisionSourceId ? (
              <Input value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder={t("changeReason")} />
            ) : null}
            <Button disabled={pending || !code || !nameEn || !nameAr || (revisionSourceId !== "" && changeReason.trim().length < 5)} onClick={handleCreate}>
              {t(revisionSourceId ? "createRevision" : "createDraft")}
            </Button>
            {revisionSourceId ? (
              <Button variant="outline" disabled={pending} onClick={() => { setRevisionSourceId(""); setCode(""); setNameEn(""); setNameAr(""); setParentId(""); setChangeReason(""); }}>
                {tCommon("cancel")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-text-secondary">{tCommon("empty")}</CardContent>
        </Card>
      ) : viewMode === "tree" && showTreeToggle ? (
        <Card>
          <CardContent className="p-4">
            <TreeRows
              nodes={treeRoots}
              depth={0}
              locale={locale}
              pending={pending}
              canSubmit={canSubmit}
              canApprove={canApprove}
              canDeactivate={canDeactivate}
              onSubmit={(id) =>
                runTransition(() => submitMasterRecordAction(id), "submitted")
              }
              onApprove={(id) =>
                runTransition(() => approveMasterRecordAction(id), "approved")
              }
              onReject={(id) =>
                runTransition(() => rejectMasterRecordAction(id), "rejected")
              }
              onDeactivate={(id) =>
                runTransition(() => deactivateMasterRecordAction(id), "deactivated")
              }
              labels={{
                type: (type) => t(`types.${type}` as Parameters<typeof t>[0]),
                status: statusLabel,
                submit: tCommon("submit"),
                approve: tCommon("approve"),
                reject: tCommon("reject"),
                deactivate: t("deactivate"),
              }}
            />
          </CardContent>
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
                  <Badge variant="outline">
                    {t(`types.${record.record_type}` as Parameters<typeof t>[0])}
                  </Badge>
                  <Badge variant="secondary">{statusLabel(record.governance_status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-sm text-text-secondary">
                <span>{t("effectiveFrom", { date: record.effective_start })}</span>
                {record.parent_id ? (
                  <span>
                    {t("parent")}: {record.parent_id.slice(0, 8)}
                  </span>
                ) : null}
                <div className="ms-auto flex flex-wrap gap-2">
                  {canSubmit && record.governance_status === "draft" ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        runTransition(() => submitMasterRecordAction(record.id), "submitted")
                      }
                    >
                      {tCommon("submit")}
                    </Button>
                  ) : null}
                  {canApprove && record.governance_status === "submitted" ? (
                    <>
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          runTransition(() => approveMasterRecordAction(record.id), "approved")
                        }
                      >
                        {tCommon("approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          runTransition(() => rejectMasterRecordAction(record.id), "rejected")
                        }
                      >
                        {tCommon("reject")}
                      </Button>
                    </>
                  ) : null}
                  {canDeactivate && record.governance_status === "approved" ? (
                    <>
                      {canCreate && record.is_current ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => {
                            setRevisionSourceId(record.id);
                            setRecordType(record.record_type);
                            setCode(record.code);
                            setNameEn(record.name_en);
                            setNameAr(record.name_ar);
                            setParentId(record.parent_id ?? "");
                            setUnitTypeCode(String(record.attributes?.unit_type_code ?? ""));
                            setLevelOrder(String(record.attributes?.level_order ?? ""));
                            setIsCostCenterLevel(Boolean(record.attributes?.is_cost_center_level));
                            setClassification(String(record.attributes?.classification ?? "opex"));
                            setCurrencyCode(String(record.attributes?.currency_code ?? "SAR"));
                            globalThis.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          {t("revise")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        onClick={() =>
                          runTransition(() => deactivateMasterRecordAction(record.id), "deactivated")
                        }
                      >
                        {t("deactivate")}
                      </Button>
                    </>
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
