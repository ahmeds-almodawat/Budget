"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  addAppraisalCriterionAction,
  approveAppraisalTemplateAction,
  createAppraisalTemplateAction,
  retireAppraisalTemplateAction,
  submitAppraisalTemplateAction,
} from "@/app/actions/appraisal-actions";
import type { AppraisalTemplateRow } from "@/data/repositories/appraisal-repository";
import { pickLocalized } from "@/lib/i18n/display";

export function AppraisalTemplateGovernance({
  templates,
  canApprove,
  onTemplatesChange,
}: {
  templates: AppraisalTemplateRow[];
  canApprove: boolean;
  onTemplatesChange: (templates: AppraisalTemplateRow[]) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("appraisal");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [ratingScale, setRatingScale] = useState("5");
  const drafts = templates.filter((template) => template.governance_status === "draft");
  const [templateId, setTemplateId] = useState(drafts[0]?.id ?? "");
  const [criterionNameEn, setCriterionNameEn] = useState("");
  const [criterionNameAr, setCriterionNameAr] = useState("");
  const [criterionCategory, setCriterionCategory] = useState("competency");
  const [criterionWeight, setCriterionWeight] = useState("100");
  const [criterionScale, setCriterionScale] = useState("5");
  const [criterionSequence, setCriterionSequence] = useState("1");
  const [retireReasons, setRetireReasons] = useState<Record<string, string>>({});

  const replace = (updated: AppraisalTemplateRow) => {
    onTemplatesChange(templates.map((template) => {
      if (template.id === updated.id) return updated;
      if (updated.governance_status === "approved" && updated.is_active && template.code === updated.code && template.is_active) {
        return { ...template, governance_status: "inactive", is_active: false };
      }
      return template;
    }));
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("templateGovernance")}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {message ? <p className="text-sm text-success">{message}</p> : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
        <div className="flex flex-wrap items-end gap-3">
          <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder={t("templateCode")} />
          <Input value={nameEn} onChange={(event) => setNameEn(event.target.value)} placeholder={t("nameEn")} />
          <Input value={nameAr} onChange={(event) => setNameAr(event.target.value)} placeholder={t("nameAr")} dir="rtl" />
          <Input className="w-24" type="number" min="2" max="10" value={ratingScale} onChange={(event) => setRatingScale(event.target.value)} aria-label={t("ratingScale")} />
          <Button
            disabled={pending || !code.trim() || !nameEn.trim() || !nameAr.trim()}
            onClick={() => startTransition(async () => {
              setError(null);
              try {
                const created = await createAppraisalTemplateAction({ code, nameEn, nameAr, ratingScaleMax: Number(ratingScale) }) as AppraisalTemplateRow;
                onTemplatesChange([created, ...templates]);
                setTemplateId(created.id);
                setCode(""); setNameEn(""); setNameAr("");
                setMessage(t("templateCreated"));
              } catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
            })}
          >{t("createTemplate")}</Button>
        </div>

        {drafts.length ? (
          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <select className="rounded-md border border-border bg-background px-3 py-2 text-sm" value={templateId} onChange={(event) => {
              setTemplateId(event.target.value);
              const selected = templates.find((template) => template.id === event.target.value);
              if (selected) setCriterionScale(String(selected.rating_scale_max));
            }}>
              {drafts.map((template) => <option key={template.id} value={template.id}>{template.code} v{template.version_number}</option>)}
            </select>
            <Input className="w-20" type="number" min="1" value={criterionSequence} onChange={(event) => setCriterionSequence(event.target.value)} aria-label={t("sequence")} />
            <Input value={criterionCategory} onChange={(event) => setCriterionCategory(event.target.value)} placeholder={t("category")} />
            <Input value={criterionNameEn} onChange={(event) => setCriterionNameEn(event.target.value)} placeholder={t("criterionNameEn")} />
            <Input value={criterionNameAr} onChange={(event) => setCriterionNameAr(event.target.value)} placeholder={t("criterionNameAr")} dir="rtl" />
            <Input className="w-24" type="number" min="0.0001" max="100" step="0.0001" value={criterionWeight} onChange={(event) => setCriterionWeight(event.target.value)} aria-label={t("weight")} />
            <Input className="w-24" type="number" min="2" max="10" value={criterionScale} onChange={(event) => setCriterionScale(event.target.value)} aria-label={t("maxScale")} />
            <Button
              disabled={pending || !templateId || !criterionNameEn.trim() || !criterionNameAr.trim()}
              onClick={() => startTransition(async () => {
                setError(null);
                try {
                  await addAppraisalCriterionAction({
                    templateId,
                    sequenceNo: Number(criterionSequence),
                    category: criterionCategory,
                    nameEn: criterionNameEn,
                    nameAr: criterionNameAr,
                    weight: criterionWeight,
                    maxScale: Number(criterionScale),
                  });
                  setCriterionNameEn(""); setCriterionNameAr("");
                  setCriterionSequence(String(Number(criterionSequence) + 1));
                  setMessage(t("criterionAdded"));
                } catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
              })}
            >{t("addCriterion")}</Button>
          </div>
        ) : null}

        <ul className="space-y-2 text-sm">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <span>{pickLocalized(locale, template.name_en, template.name_ar)} · {template.code} v{template.version_number} · {template.governance_status}</span>
              <div className="flex flex-wrap items-center gap-2">
                {template.governance_status === "draft" ? (
                  <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
                    setError(null);
                    try { replace(await submitAppraisalTemplateAction(template.id) as AppraisalTemplateRow); setMessage(t("templateSubmitted")); }
                    catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
                  })}>{t("submitTemplate")}</Button>
                ) : null}
                {canApprove && template.governance_status === "submitted" ? (
                  <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
                    setError(null);
                    try { replace(await approveAppraisalTemplateAction(template.id) as AppraisalTemplateRow); setMessage(t("templateApproved")); }
                    catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
                  })}>{t("approveTemplate")}</Button>
                ) : null}
                {canApprove && template.governance_status === "approved" ? (
                  <>
                    <Input className="w-40" value={retireReasons[template.id] ?? ""} onChange={(event) => setRetireReasons((current) => ({ ...current, [template.id]: event.target.value }))} placeholder={t("retirementReason")} />
                    <Button size="sm" variant="outline" disabled={pending || (retireReasons[template.id]?.trim().length ?? 0) < 5} onClick={() => startTransition(async () => {
                      setError(null);
                      try { replace(await retireAppraisalTemplateAction({ templateId: template.id, reason: retireReasons[template.id] }) as AppraisalTemplateRow); setMessage(t("templateRetired")); }
                      catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
                    })}>{t("retireTemplate")}</Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
