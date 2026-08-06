"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createDelegationDraftAction } from "@/app/actions/governance-actions";

export interface DelegationRow {
  id: string;
  delegate_id: string;
  workflow_type: string;
  permission_code: string;
  financial_threshold: string | null;
  effective_start: string;
  effective_end: string;
  reason: string;
  delegation_status: string;
  created_at: string;
}

export interface ProfileOption {
  id: string;
  email: string;
  full_name_en: string;
  full_name_ar: string;
}

export function DelegationWorkspace({
  initialDelegations,
  profiles,
  canCreate,
}: {
  initialDelegations: DelegationRow[];
  profiles: ProfileOption[];
  canCreate: boolean;
}) {
  const t = useTranslations("delegation");
  const tCommon = useTranslations("common");
  const [delegations, setDelegations] = useState(initialDelegations);
  const [delegateId, setDelegateId] = useState("");
  const [workflowType, setWorkflowType] = useState("budget");
  const [permissionCode, setPermissionCode] = useState("approve");
  const [effectiveStart, setEffectiveStart] = useState("");
  const [effectiveEnd, setEffectiveEnd] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleCreate = () => {
    startTransition(async () => {
      setError(null);
      setMessage(null);
      try {
        const created = (await createDelegationDraftAction({
          delegateId,
          workflowType,
          permissionCode,
          effectiveStart: new Date(effectiveStart).toISOString(),
          effectiveEnd: new Date(effectiveEnd).toISOString(),
          reason,
        })) as DelegationRow;
        setDelegations((prev) => [created, ...prev]);
        setMessage(t("created"));
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
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="del-delegate" className="text-xs font-medium text-slate-600">
                {t("delegate")}
              </label>
              <select
                id="del-delegate"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={delegateId}
                onChange={(e) => setDelegateId(e.target.value)}
              >
                <option value="">{t("selectDelegate")}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name_en} ({p.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="del-workflow" className="text-xs font-medium text-slate-600">
                {t("workflowType")}
              </label>
              <Input id="del-workflow" value={workflowType} onChange={(e) => setWorkflowType(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="del-permission" className="text-xs font-medium text-slate-600">
                {t("permissionCode")}
              </label>
              <Input id="del-permission" value={permissionCode} onChange={(e) => setPermissionCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="del-start" className="text-xs font-medium text-slate-600">
                {t("effectiveStart")}
              </label>
              <Input id="del-start" type="datetime-local" value={effectiveStart} onChange={(e) => setEffectiveStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="del-end" className="text-xs font-medium text-slate-600">
                {t("effectiveEnd")}
              </label>
              <Input id="del-end" type="datetime-local" value={effectiveEnd} onChange={(e) => setEffectiveEnd(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="del-reason" className="text-xs font-medium text-slate-600">
                {t("reason")}
              </label>
              <Input id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button
              disabled={pending || !delegateId || !effectiveStart || !effectiveEnd || !reason}
              onClick={handleCreate}
            >
              {t("createDraft")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4">
        {delegations.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-slate-600">{tCommon("empty")}</CardContent>
          </Card>
        ) : (
          delegations.map((d) => (
            <Card key={d.id} as="article" data-testid="delegation-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{d.workflow_type}</CardTitle>
                <Badge variant="outline">{d.delegation_status}</Badge>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-1">
                <p>{t("permissionCode")}: {d.permission_code}</p>
                <p>{t("reason")}: {d.reason}</p>
                <p>{t("effectiveRange", { start: d.effective_start, end: d.effective_end })}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
