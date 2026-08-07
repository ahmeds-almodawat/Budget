"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  acknowledgeAppraisalAction,
  activateAppraisalCycleAction,
  createAppraisalAssignmentAction,
  createAppraisalCycleAction,
  finalizeAppraisalAction,
} from "@/app/actions/appraisal-actions";
import { pickLocalized } from "@/lib/i18n/display";
import type {
  AppraisalAssignmentRow,
  AppraisalCycleRow,
  AppraisalTemplateRow,
} from "@/data/repositories/appraisal-repository";

type Tab = "scorecard" | "my" | "team" | "cycles";

export interface ScorecardTeam {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  onTimePercent: number;
  milestoneCount: number;
}

export function PerformanceWorkspace({
  scorecard,
  myAppraisals,
  teamAppraisals,
  cycles,
  templates,
  profiles,
  canManageCycles,
  localePrefix,
}: {
  scorecard: ScorecardTeam[];
  myAppraisals: AppraisalAssignmentRow[];
  teamAppraisals: AppraisalAssignmentRow[];
  cycles: AppraisalCycleRow[];
  templates: AppraisalTemplateRow[];
  profiles: { id: string; full_name_en: string | null; full_name_ar: string | null }[];
  canManageCycles: boolean;
  localePrefix: string;
}) {
  const locale = useLocale();
  const t = useTranslations("appraisal");
  const tDash = useTranslations("dashboard.employee");
  const [tab, setTab] = useState<Tab>("scorecard");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [cycleNameEn, setCycleNameEn] = useState("");
  const [cycleNameAr, setCycleNameAr] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [assignCycleId, setAssignCycleId] = useState(cycles.find((c) => c.cycle_status === "active")?.id ?? "");
  const [assignTemplateId, setAssignTemplateId] = useState(templates[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [managerId, setManagerId] = useState("");

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "scorecard", label: t("tabs.scorecard"), show: true },
    { key: "my", label: t("tabs.my"), show: true },
    { key: "team", label: t("tabs.team"), show: true },
    { key: "cycles", label: t("tabs.cycles"), show: canManageCycles },
  ];

  const profileLabel = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    return p ? pickLocalized(locale, p.full_name_en, p.full_name_ar) : id.slice(0, 8);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs
          .filter((x) => x.show)
          .map((x) => (
            <Button
              key={x.key}
              size="sm"
              variant={tab === x.key ? "default" : "outline"}
              onClick={() => setTab(x.key)}
            >
              {x.label}
            </Button>
          ))}
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {tab === "scorecard" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {scorecard.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("emptyScorecard")}</p>
          ) : (
            scorecard.map((team) => (
              <Card key={team.id}>
                <CardHeader>
                  <CardTitle>{pickLocalized(locale, team.name_en, team.name_ar)}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    {tDash("onTimeCompletion")}: {team.onTimePercent}%
                  </div>
                  <div>
                    {t("milestones")}: {team.milestoneCount}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {tab === "my" ? (
        <ul className="space-y-3">
          {myAppraisals.length === 0 ? (
            <li className="text-sm text-text-secondary">{t("emptyMy")}</li>
          ) : (
            myAppraisals.map((a) => {
              const cycleRaw = (a as { appraisal_cycles?: { name_en: string; name_ar: string } | { name_en: string; name_ar: string }[] | null }).appraisal_cycles;
              const cycle = Array.isArray(cycleRaw) ? cycleRaw[0] : cycleRaw;
              return (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <Link
                        href={`${localePrefix}/performance/appraisals/${a.id}`}
                        className="font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {cycle
                          ? pickLocalized(locale, cycle.name_en, cycle.name_ar)
                          : `${t("assignment")} ${a.id.slice(0, 8)}`}
                      </Link>
                      <div className="text-text-secondary">
                        {t("manager")}: {profileLabel(a.manager_id)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{a.assignment_status}</Badge>
                      {a.final_score != null ? (
                        <span>{t("score")}: {String(a.final_score)}</span>
                      ) : null}
                      {a.assignment_status === "finalized" ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await acknowledgeAppraisalAction({ assignmentId: a.id });
                                setMessage(t("acknowledged"));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : t("actionError"));
                              }
                            })
                          }
                        >
                          {t("acknowledge")}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
              );
            })
          )}
        </ul>
      ) : null}

      {tab === "team" ? (
        <ul className="space-y-3">
          {teamAppraisals.length === 0 ? (
            <li className="text-sm text-text-secondary">{t("emptyTeam")}</li>
          ) : (
            teamAppraisals.map((a) => {
              const empLabel = profileLabel(a.employee_id);
              return (
              <li key={a.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <Link
                        href={`${localePrefix}/performance/appraisals/${a.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {empLabel}
                      </Link>
                      <div className="text-text-secondary">{a.assignment_status}</div>
                    </div>
                    <div className="flex gap-2">
                      {canManageCycles && a.assignment_status === "manager_submitted" ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await finalizeAppraisalAction(a.id);
                                setMessage(t("finalized"));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : t("actionError"));
                              }
                            })
                          }
                        >
                          {t("finalize")}
                        </Button>
                      ) : null}
                      <Badge variant="outline">{a.assignment_status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </li>
              );
            })
          )}
        </ul>
      ) : null}

      {tab === "cycles" && canManageCycles ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("createCycle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("nameEn")}</label>
                <Input value={cycleNameEn} onChange={(e) => setCycleNameEn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("nameAr")}</label>
                <Input value={cycleNameAr} onChange={(e) => setCycleNameAr(e.target.value)} dir="rtl" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("periodStart")}</label>
                <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("periodEnd")}</label>
                <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </div>
              <Button
                disabled={pending || !cycleNameEn || !cycleNameAr || !periodStart || !periodEnd}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await createAppraisalCycleAction({
                        nameEn: cycleNameEn,
                        nameAr: cycleNameAr,
                        periodStart,
                        periodEnd,
                      });
                      setMessage(t("cycleCreated"));
                      setCycleNameEn("");
                      setCycleNameAr("");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t("actionError"));
                    }
                  })
                }
              >
                {t("createCycle")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("createAssignment")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("cycle")}</label>
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={assignCycleId}
                  onChange={(e) => setAssignCycleId(e.target.value)}
                >
                  <option value="">{t("selectCycle")}</option>
                  {cycles
                    .filter((c) => c.cycle_status === "active")
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {pickLocalized(locale, c.name_en, c.name_ar)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("template")}</label>
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={assignTemplateId}
                  onChange={(e) => setAssignTemplateId(e.target.value)}
                >
                  {templates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {pickLocalized(locale, tmpl.name_en, tmpl.name_ar)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("employee")}</label>
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                >
                  <option value="">{t("selectPerson")}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {pickLocalized(locale, p.full_name_en, p.full_name_ar)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-secondary">{t("manager")}</label>
                <select
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={managerId}
                  onChange={(e) => setManagerId(e.target.value)}
                >
                  <option value="">{t("selectPerson")}</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {pickLocalized(locale, p.full_name_en, p.full_name_ar)}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={pending || !assignCycleId || !assignTemplateId || !employeeId || !managerId}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await createAppraisalAssignmentAction({
                        cycleId: assignCycleId,
                        templateId: assignTemplateId,
                        employeeId,
                        managerId,
                      });
                      setMessage(t("assignmentCreated"));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : t("actionError"));
                    }
                  })
                }
              >
                {t("createAssignment")}
              </Button>
            </CardContent>
          </Card>

          <ul className="space-y-2">
            {cycles.map((c) => (
              <li key={c.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div>
                      <div className="font-medium">
                        {pickLocalized(locale, c.name_en, c.name_ar)}
                      </div>
                      <div className="text-text-secondary">
                        {c.period_start} → {c.period_end}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{c.cycle_status}</Badge>
                      {c.cycle_status === "draft" ? (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await activateAppraisalCycleAction(c.id);
                                setMessage(t("cycleActivated"));
                              } catch (err) {
                                setError(err instanceof Error ? err.message : t("actionError"));
                              }
                            })
                          }
                        >
                          {t("activate")}
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
