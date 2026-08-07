import { describe, it, expect, beforeAll } from "vitest";
import {
  submitProgress,
  verifyProgress,
  getMilestoneDetail,
} from "@/data/repositories/project-schedule-repository";
import { TEST_USER_IDS } from "@/test/fixtures/users";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const KM_MILESTONE_ID = "ffffffff-ffff-ffff-ffff-ffffffffff01";
const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

describe.skipIf(!hasDb)("project schedule integration", () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }
  });

  it("employee submits progress and approver verifies separately", async () => {
    const employeeDb = await createAuthenticatedTestClient("employee");
    const approverDb = await createAuthenticatedTestClient("approver");

    const submission = await submitProgress(employeeDb, {
      milestoneId: KM_MILESTONE_ID,
      reportedProgress: 72,
      reportedBy: TEST_USER_IDS.employee,
      notes: "Integration test submission",
      evidenceDescription: "Site photo log",
    });

    expect(submission.id).toBeTruthy();

    await expect(
      verifyProgress(employeeDb, {
        progressUpdateId: submission.id,
        verifiedProgress: 72,
        verifiedBy: TEST_USER_IDS.employee,
      }),
    ).rejects.toThrow(/cannot verify own progress/i);

    const verified = await verifyProgress(approverDb, {
      progressUpdateId: submission.id,
      verifiedProgress: 70,
      verifiedBy: TEST_USER_IDS.approver,
    });

    expect(verified.milestone_id).toBe(KM_MILESTONE_ID);

    const detail = await getMilestoneDetail(approverDb, KM_MILESTONE_ID);
    expect(Number(detail.milestone.approved_progress)).toBe(70);
  });
});
