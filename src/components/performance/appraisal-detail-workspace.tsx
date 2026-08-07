"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  acknowledgeAppraisalAction,
  createAppraisalGoalAction,
  finalizeAppraisalAction,
  managerSubmitAppraisalAction,
  reviewerSubmitAppraisalAction,
  selfSubmitAppraisalAction,
  updateEmployeeGoalAction,
  updateManagerGoalAction,
} from "@/app/actions/appraisal-actions";
import {
  calculateWeightedAppraisalScore,
} from "@/domain/performance/appraisal-scoring";
import { pickLocalized } from "@/lib/i18n/display";
import type {
  AppraisalAssignmentRow,
  AppraisalCriterionRow,
  AppraisalGoalRow,
  AppraisalRatingRow,
} from "@/data/repositories/appraisal-repository";

export function AppraisalDetailWorkspace({
  assignment: initial,
  ratings: initialRatings,
  criteria,
  goals: initialGoals,
  currentUserId,
  canManage,
  canCreateGoals,
}: {
  assignment: AppraisalAssignmentRow;
  ratings: AppraisalRatingRow[];
  criteria: AppraisalCriterionRow[];
  goals: AppraisalGoalRow[];
  currentUserId: string;
  canManage: boolean;
  canCreateGoals: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("appraisal");
  const [assignment, setAssignment] = useState(initial);
  const [ratings, setRatings] = useState(initialRatings);
  const [goals, setGoals] = useState(initialGoals);
  const [goalDescription, setGoalDescription] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalUnit, setGoalUnit] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [employeeGoalComments, setEmployeeGoalComments] = useState<Record<string, string>>(
    Object.fromEntries(initialGoals.map((goal) => [goal.id, goal.employee_comment ?? ""])),
  );
  const [managerGoalRatings, setManagerGoalRatings] = useState<Record<string, string>>(
    Object.fromEntries(initialGoals.map((goal) => [goal.id, goal.manager_rating == null ? "" : String(goal.manager_rating)])),
  );
  const [managerGoalComments, setManagerGoalComments] = useState<Record<string, string>>(
    Object.fromEntries(initialGoals.map((goal) => [goal.id, goal.manager_comment ?? ""])),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const previewScore = useMemo(() => {
    try {
      return calculateWeightedAppraisalScore(
        criteria.map((c) => ({
          criterionId: c.id,
          weight: c.weight,
          maxScale: c.max_scale,
        })),
        ratings.map((r) => ({
          criterionId: r.criterion_id,
          calibratedRating: r.calibrated_rating,
          managerRating: r.manager_rating,
        })),
      ).toFixed(4);
    } catch {
      return null;
    }
  }, [criteria, ratings]);

  const isEmployee = assignment.employee_id === currentUserId;
  const isManager = assignment.manager_id === currentUserId;
  const isReviewer = assignment.reviewer_id === currentUserId;
  const isParticipant = isEmployee || isManager || isReviewer;

  const updateLocal = (
    criterionId: string,
    field:
      | "self_rating"
      | "manager_rating"
      | "calibrated_rating"
      | "self_comment"
      | "manager_comment",
    value: string,
  ) => {
    setRatings((prev) =>
      prev.map((r) =>
        r.criterion_id === criterionId
          ? {
              ...r,
              [field]:
                field === "self_rating" ||
                field === "manager_rating" ||
                field === "calibrated_rating"
                  ? value === ""
                    ? null
                    : value
                  : value,
            }
          : r,
      ),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline">{assignment.assignment_status}</Badge>
        {assignment.final_score != null ? (
          <span className="text-sm">
            {t("score")}: {String(assignment.final_score)}
          </span>
        ) : previewScore ? (
          <span className="text-sm text-text-secondary">
            {t("previewScore")}: {previewScore}
          </span>
        ) : null}
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("goals")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {canCreateGoals && assignment.assignment_status === "employee_self_review" ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input value={goalDescription} onChange={(event) => setGoalDescription(event.target.value)} placeholder={t("goalDescription")} />
              <Input value={goalTarget} onChange={(event) => setGoalTarget(event.target.value)} placeholder={t("goalTarget")} />
              <Input value={goalUnit} onChange={(event) => setGoalUnit(event.target.value)} placeholder={t("goalUnit")} />
              <Input className="w-24" type="number" min="0.0001" max="100" step="0.0001" value={goalWeight} onChange={(event) => setGoalWeight(event.target.value)} aria-label={t("weight")} />
              <Button disabled={pending || !goalDescription.trim() || !goalWeight} onClick={() => startTransition(async () => {
                setError(null);
                try {
                  const updated = await createAppraisalGoalAction({
                    assignmentId: assignment.id,
                    description: goalDescription,
                    targetText: goalTarget || undefined,
                    measureUnit: goalUnit || undefined,
                    weight: goalWeight,
                  });
                  setGoals(updated);
                  setGoalDescription(""); setGoalTarget(""); setGoalUnit(""); setGoalWeight("");
                  setMessage(t("goalCreated"));
                } catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
              })}>{t("addGoal")}</Button>
            </div>
          ) : null}
          {goals.length === 0 ? <p className="text-sm text-text-secondary">{t("noGoals")}</p> : (
            <ul className="space-y-3">
              {goals.map((goal) => (
                <li key={goal.id} className="border-t border-border pt-3 text-sm">
                  <p className="font-medium">{goal.description} · {t("weight")}: {String(goal.weight)}</p>
                  {goal.target_text ? <p className="text-text-secondary">{goal.target_text}{goal.measure_unit ? ` (${goal.measure_unit})` : ""}</p> : null}
                  {isEmployee && assignment.assignment_status === "employee_self_review" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input value={employeeGoalComments[goal.id] ?? ""} onChange={(event) => setEmployeeGoalComments((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder={t("employeeGoalComment")} />
                      <Button size="sm" disabled={pending} onClick={() => startTransition(async () => {
                        setError(null);
                        try {
                          setGoals(await updateEmployeeGoalAction({ goalId: goal.id, assignmentId: assignment.id, employeeComment: employeeGoalComments[goal.id] ?? "" }));
                          setMessage(t("goalUpdated"));
                        } catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
                      })}>{t("saveGoal")}</Button>
                    </div>
                  ) : null}
                  {isManager && ["self_submitted", "manager_review"].includes(assignment.assignment_status) ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Input className="w-24" type="number" min="0" value={managerGoalRatings[goal.id] ?? ""} onChange={(event) => setManagerGoalRatings((current) => ({ ...current, [goal.id]: event.target.value }))} aria-label={t("managerGoalRating")} />
                      <Input value={managerGoalComments[goal.id] ?? ""} onChange={(event) => setManagerGoalComments((current) => ({ ...current, [goal.id]: event.target.value }))} placeholder={t("managerComment")} />
                      <Button size="sm" disabled={pending || managerGoalRatings[goal.id] === ""} onClick={() => startTransition(async () => {
                        setError(null);
                        try {
                          setGoals(await updateManagerGoalAction({
                            goalId: goal.id,
                            assignmentId: assignment.id,
                            managerRating: managerGoalRatings[goal.id],
                            managerComment: managerGoalComments[goal.id] || undefined,
                          }));
                          setMessage(t("goalUpdated"));
                        } catch (err) { setError(err instanceof Error ? err.message : t("actionError")); }
                      })}>{t("saveGoal")}</Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {criteria.map((c) => {
          const rating = ratings.find((r) => r.criterion_id === c.id);
          return (
            <Card key={c.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {pickLocalized(locale, c.name_en, c.name_ar)}
                  <span className="ms-2 text-sm font-normal text-text-secondary">
                    {t("weight")}: {String(c.weight)} · {t("maxScale")}: {c.max_scale}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">{t("selfRating")}</label>
                  <Input
                    type="number"
                    min={0}
                    max={c.max_scale}
                    disabled={!isEmployee || assignment.assignment_status !== "employee_self_review"}
                    value={rating?.self_rating ?? ""}
                    onChange={(e) => updateLocal(c.id, "self_rating", e.target.value)}
                  />
                  <Input
                    placeholder={t("selfComment")}
                    disabled={!isEmployee || assignment.assignment_status !== "employee_self_review"}
                    value={rating?.self_comment ?? ""}
                    onChange={(e) => updateLocal(c.id, "self_comment", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">{t("managerRating")}</label>
                  <Input
                    type="number"
                    min={0}
                    max={c.max_scale}
                    disabled={
                      !isManager ||
                      !["self_submitted", "manager_review"].includes(assignment.assignment_status)
                    }
                    value={rating?.manager_rating ?? ""}
                    onChange={(e) => updateLocal(c.id, "manager_rating", e.target.value)}
                  />
                  <Input
                    placeholder={t("managerComment")}
                    disabled={
                      !isManager ||
                      !["self_submitted", "manager_review"].includes(assignment.assignment_status)
                    }
                    value={rating?.manager_comment ?? ""}
                    onChange={(e) => updateLocal(c.id, "manager_comment", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-text-secondary">{t("calibratedRating")}</label>
                  <Input
                    type="number"
                    min={0}
                    max={c.max_scale}
                    disabled={!isReviewer || assignment.assignment_status !== "reviewer_review"}
                    value={rating?.calibrated_rating ?? ""}
                    onChange={(e) => updateLocal(c.id, "calibrated_rating", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {isEmployee && assignment.assignment_status === "employee_self_review" ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const updated = await selfSubmitAppraisalAction({
                    assignmentId: assignment.id,
                    ratings: ratings.map((r) => ({
                      criterion_id: r.criterion_id,
                      self_rating: r.self_rating ?? undefined,
                      self_comment: r.self_comment ?? undefined,
                    })),
                  });
                  setAssignment(updated);
                  setMessage(t("selfSubmitted"));
                } catch (err) {
                  setError(err instanceof Error ? err.message : t("actionError"));
                }
              })
            }
          >
            {t("selfSubmit")}
          </Button>
        ) : null}

        {isManager &&
        ["self_submitted", "manager_review"].includes(assignment.assignment_status) ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const updated = await managerSubmitAppraisalAction({
                    assignmentId: assignment.id,
                    ratings: ratings.map((r) => ({
                      criterion_id: r.criterion_id,
                      manager_rating: r.manager_rating ?? undefined,
                      manager_comment: r.manager_comment ?? undefined,
                    })),
                  });
                  setAssignment(updated);
                  setMessage(t("managerSubmitted"));
                } catch (err) {
                  setError(err instanceof Error ? err.message : t("actionError"));
                }
              })
            }
          >
            {t("managerSubmit")}
          </Button>
        ) : null}

        {isReviewer && assignment.assignment_status === "reviewer_review" ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const updated = await reviewerSubmitAppraisalAction({
                    assignmentId: assignment.id,
                    ratings: ratings.map((rating) => ({
                      criterion_id: rating.criterion_id,
                      calibrated_rating: rating.calibrated_rating ?? undefined,
                    })),
                  });
                  setAssignment(updated);
                  setMessage(t("reviewerSubmitted"));
                } catch (err) {
                  setError(err instanceof Error ? err.message : t("actionError"));
                }
              })
            }
          >
            {t("reviewerSubmit")}
          </Button>
        ) : null}

        {canManage && !isParticipant && assignment.assignment_status === "manager_submitted" ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const updated = await finalizeAppraisalAction(assignment.id);
                  setAssignment(updated);
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

        {isEmployee && assignment.assignment_status === "finalized" ? (
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  const updated = await acknowledgeAppraisalAction({
                    assignmentId: assignment.id,
                  });
                  setAssignment(updated);
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
    </div>
  );
}
