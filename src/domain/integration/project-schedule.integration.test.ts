import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  submitProgress,
  verifyProgress,
  getMilestoneDetail,
} from "@/data/repositories/project-schedule-repository";
import { TEST_USER_IDS } from "@/test/fixtures/users";
import { createAuthenticatedTestClient } from "@/test/helpers/supabase-auth";

const KM_MILESTONE_ID = "ffffffff-ffff-ffff-ffff-ffffffffff01";
const hasDb = Boolean(process.env.DATABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

type MilestoneProgressSnapshot = {
  approved_progress: string;
  reported_progress: string;
  approval_status: string;
};

let originalProgress: MilestoneProgressSnapshot | null = null;
let createdUpdateId: string | null = null;

describe.skipIf(!hasDb)("project schedule integration", () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:56001";
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required for integration tests");
    }

    const client = new pg.Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres",
    });
    await client.connect();
    try {
      const result = await client.query<MilestoneProgressSnapshot>(
        `SELECT approved_progress, reported_progress, approval_status
           FROM public.milestones
          WHERE id = $1`,
        [KM_MILESTONE_ID],
      );
      originalProgress = result.rows[0] ?? null;
      if (!originalProgress) {
        throw new Error(`Missing milestone fixture ${KM_MILESTONE_ID}`);
      }
    } finally {
      await client.end();
    }
  });

  afterAll(async () => {
    if (!originalProgress) return;

    const client = new pg.Client({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres",
    });
    await client.connect();
    try {
      await client.query("BEGIN");
      if (createdUpdateId) {
        await client.query(
          "DELETE FROM public.milestone_progress_updates WHERE id = $1",
          [createdUpdateId],
        );
      }
      await client.query(
        `UPDATE public.milestones
            SET approved_progress = $1,
                reported_progress = $2,
                approval_status = $3
          WHERE id = $4`,
        [
          originalProgress.approved_progress,
          originalProgress.reported_progress,
          originalProgress.approval_status,
          KM_MILESTONE_ID,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      await client.end();
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
    createdUpdateId = submission.id;

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
