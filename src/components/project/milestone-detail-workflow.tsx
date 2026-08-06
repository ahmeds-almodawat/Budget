"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  submitProgressAction,
  verifyProgressAction,
  acceptMilestoneAction,
} from "@/app/actions/project-actions";
import { pickLocalized } from "@/lib/i18n/display";

interface MilestoneDetailProps {
  milestone: {
    id: string;
    code: string;
    name_en: string;
    name_ar: string;
    baseline_date: string | null;
    forecast_date: string | null;
    approved_progress: number;
    reported_progress: number;
    approval_status: string;
  };
  steps: { id: string; name_en: string; name_ar: string; weight_percent: number; completed: boolean }[];
  updates: {
    id: string;
    reported_progress: number;
    verified_progress: number | null;
    approval_status: string;
    notes: string | null;
    created_at: string;
  }[];
  weightedProgress: number;
  permissions: {
    canSubmit: boolean;
    canVerify: boolean;
    canAccept: boolean;
  };
}

export function MilestoneDetailWorkflow({
  milestone,
  steps,
  updates,
  weightedProgress,
  permissions,
}: MilestoneDetailProps) {
  const locale = useLocale();
  const t = useTranslations("milestones");
  const [reportedProgress, setReportedProgress] = useState(String(milestone.reported_progress));
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const name = pickLocalized(locale, milestone.name_en, milestone.name_ar);
  const pendingUpdate = updates.find((u) => u.approval_status === "submitted" && !u.verified_progress);

  function run(action: () => Promise<unknown>, ok: string) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await action();
        setMessage(ok);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-sm text-slate-500">{milestone.code}</p>
        </div>
        <Link href={`/${locale}/milestones`} className="text-sm text-teal-700 hover:underline">
          {t("backToMilestones")}
        </Link>
      </div>

      {message && <p className="rounded bg-green-50 p-3 text-sm text-green-800">{message}</p>}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("baseline")}</CardTitle></CardHeader>
          <CardContent>{milestone.baseline_date ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("forecast")}</CardTitle></CardHeader>
          <CardContent>{milestone.forecast_date ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("approvedProgress")}</CardTitle></CardHeader>
          <CardContent>{milestone.approved_progress}%</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t("weightedSteps")}</CardTitle></CardHeader>
          <CardContent>{weightedProgress.toFixed(1)}%</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("milestoneSteps")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.id} className="flex justify-between border-b py-2">
                <span>{pickLocalized(locale, s.name_en, s.name_ar)}</span>
                <span>{s.weight_percent}% — {s.completed ? "✓" : "—"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {permissions.canSubmit && (
        <Card>
          <CardHeader><CardTitle>{t("submitProgress")}</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{t("reportedProgress")}</span>
              <Input value={reportedProgress} onChange={(e) => setReportedProgress(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t("notes")}</span>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span>{t("evidenceDescription")}</span>
              <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} />
            </label>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    submitProgressAction({
                      milestoneId: milestone.id,
                      reportedProgress: Number(reportedProgress),
                      notes: notes || undefined,
                      evidenceDescription: evidence || undefined,
                    }),
                  t("progressSubmitted"),
                )
              }
            >
              {t("submit")}
            </Button>
          </CardContent>
        </Card>
      )}

      {permissions.canVerify && pendingUpdate && (
        <Card>
          <CardHeader><CardTitle>{t("verifyProgress")}</CardTitle></CardHeader>
          <CardContent className="flex gap-4">
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    verifyProgressAction({
                      progressUpdateId: pendingUpdate.id,
                      verifiedProgress: pendingUpdate.reported_progress,
                    }),
                  t("progressVerified"),
                )
              }
            >
              {t("verifyReported")}
            </Button>
          </CardContent>
        </Card>
      )}

      {permissions.canAccept && milestone.approval_status !== "approved" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => acceptMilestoneAction(milestone.id),
              t("milestoneAccepted"),
            )
          }
        >
          {t("acceptMilestone")}
        </Button>
      )}

      <Card>
        <CardHeader><CardTitle>{t("updateHistory")}</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {updates.map((u) => (
              <li key={u.id} className="flex justify-between border-b py-2">
                <span>{new Date(u.created_at).toLocaleDateString(locale)}</span>
                <span>
                  {u.reported_progress}%
                  {u.verified_progress != null ? ` → ${u.verified_progress}%` : ""} — {u.approval_status}
                </span>
              </li>
            ))}
            {updates.length === 0 && (
              <li className="text-slate-500">{t("noUpdates")}</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
