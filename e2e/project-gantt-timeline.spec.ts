import { test, expect } from "@playwright/test";
import pg from "pg";

const PASSWORD = "Password123!";
const KM_MILESTONE_ID = "ffffffff-ffff-ffff-ffff-ffffffffff01";
const AUTHORITATIVE_PROGRESS = 65;

async function restoreAuthoritativeGanttFixture() {
  const client = new pg.Client({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:56002/postgres",
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "DELETE FROM public.milestone_progress_updates WHERE milestone_id = $1",
      [KM_MILESTONE_ID],
    );
    const result = await client.query<{
      approved_progress: string;
      reported_progress: string;
      approval_status: string;
    }>(
      `UPDATE public.milestones
          SET approved_progress = $1,
              reported_progress = $1,
              approval_status = 'approved'
        WHERE id = $2
      RETURNING approved_progress, reported_progress, approval_status`,
      [AUTHORITATIVE_PROGRESS, KM_MILESTONE_ID],
    );
    if (
      result.rowCount !== 1 ||
      Number(result.rows[0].approved_progress) !== AUTHORITATIVE_PROGRESS ||
      Number(result.rows[0].reported_progress) !== AUTHORITATIVE_PROGRESS ||
      result.rows[0].approval_status !== "approved"
    ) {
      throw new Error(`Unable to restore authoritative Gantt fixture ${KM_MILESTONE_ID}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

async function setTheme(page: import("@playwright/test").Page, theme: "Light" | "Dark") {
  await page.getByRole("radio", { name: theme }).click();
}

test.describe("project gantt timeline", () => {
  test.describe.configure({ retries: 0 });
  test.beforeAll(restoreAuthoritativeGanttFixture);

  test("project overview surfaces an authoritative schedule preview", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/projects/cs-khamis-hospital");

    const preview = page.getByTestId("project-schedule-preview");
    await expect(preview).toBeVisible();
    await expect(preview.locator("h2")).toHaveText(/Project schedule/i);
    await expect(page.getByTestId("schedule-kpis")).toBeVisible();
    await expect(page.getByTestId("view-full-timeline")).toHaveAttribute(
      "href",
      "/en/projects/cs-khamis-hospital/timeline",
    );

    const gantt = page.getByTestId("gantt-timeline-preview");
    const phase = gantt.locator('[data-gantt-label="Structural Works"]');
    const task = gantt.locator('[data-gantt-label="Site Excavation"]');
    const milestone = gantt.locator(
      '[data-gantt-label="Foundation Completed and Approved"]',
    );
    await expect(gantt).toBeVisible();
    await expect(phase).toBeVisible();
    await expect(task).toBeVisible();
    await expect(milestone).toBeVisible();
    await expect(phase.getByTestId("gantt-baseline-bar")).toHaveAttribute(
      "title",
      "Baseline: 2027-04-01 → 2027-12-31",
    );
    await expect(phase.getByTestId("gantt-forecast-bar")).toHaveCount(0);
    await expect(task.getByTestId("gantt-progress-fill")).toHaveAttribute(
      "data-progress-basis",
      "baseline",
    );
    await expect(milestone.getByTestId("gantt-milestone-marker")).toHaveAttribute(
      "data-marker-date",
      "2027-09-15",
    );
    await expect(gantt.getByTestId("gantt-calendar-header")).toBeVisible();
  });

  test("full timeline maps baseline, forecast, progress, and milestone records", async ({
    page,
  }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/en/projects/cs-khamis-hospital/timeline");

    await expect(page.getByTestId("project-timeline-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/timeline/i);

    const gantt = page.getByTestId("gantt-timeline");
    const phase = gantt.locator('[data-gantt-label="Structural Works"]');
    const workPackage = gantt.locator('[data-gantt-label="Foundation Works"]');
    const excavation = gantt.locator('[data-gantt-label="Site Excavation"]');
    const rebar = gantt.locator('[data-gantt-label="Rebar Installation"]');
    const concrete = gantt.locator('[data-gantt-label="Concrete Pour"]');
    const milestone = gantt.locator(
      '[data-gantt-label="Foundation Completed and Approved"]',
    );

    await expect(gantt).toBeVisible();
    await expect(gantt.getByTestId("gantt-calendar-header")).toBeVisible();
    await expect(phase).toBeVisible();
    await expect(workPackage).toContainText("Foundation Works");
    await expect(excavation).toContainText("Site Excavation");
    await expect(rebar).toContainText("Rebar Installation");
    await expect(concrete).toContainText("Concrete Pour");
    await expect(milestone).toContainText("Foundation Completed and Approved");

    await expect(phase.getByTestId("gantt-baseline-bar")).toHaveAttribute(
      "title",
      "Baseline: 2027-04-01 → 2027-12-31",
    );
    await expect(phase.getByTestId("gantt-forecast-bar")).toHaveCount(0);
    await expect(workPackage.getByTestId("gantt-no-dates")).toContainText("No dates");
    await expect(excavation.getByTestId("gantt-baseline-bar")).toHaveAttribute(
      "title",
      "Baseline: 2027-04-01 → 2027-05-15",
    );
    await expect(excavation.getByTestId("gantt-forecast-bar")).toHaveCount(0);
    await expect(excavation.getByTestId("gantt-progress-fill")).toHaveAttribute(
      "data-progress-basis",
      "baseline",
    );
    await expect(excavation.getByTestId("gantt-progress-fill")).toHaveAttribute(
      "title",
      "Progress: 100%",
    );
    await expect(rebar).toContainText("In progress");
    await expect(rebar.getByTestId("gantt-forecast-bar")).toHaveCount(0);
    await expect(rebar.getByTestId("gantt-progress-fill")).toHaveAttribute(
      "title",
      "Progress: 80%",
    );
    await expect(concrete).toContainText("Not started");
    await expect(concrete.getByTestId("gantt-forecast-bar")).toHaveCount(0);

    const marker = milestone.getByTestId("gantt-milestone-marker");
    await expect(marker).toHaveAttribute("data-marker-date", "2027-09-15");
    await expect(marker).toHaveAttribute("data-marker-basis", "forecast");
    await expect(marker).toHaveAttribute("aria-label", /Baseline: 2027-08-30/);
    await expect(marker).toHaveAttribute("aria-label", /Forecast: 2027-09-15/);
    await expect(marker).toHaveAttribute("aria-label", /Actual: —/);
    await expect(marker).toHaveAttribute("aria-label", /Progress: 65%/);
    await expect(marker).toHaveAttribute("aria-label", /Status: Approved/);
    await expect(gantt.getByTestId("gantt-legend")).toContainText("Baseline");
    await expect(gantt.getByTestId("gantt-legend")).toContainText("Today");

    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      const timeline = document.querySelector<HTMLElement>('[data-testid="gantt-timeline"]');
      return {
        documentOverflows: root.scrollWidth > root.clientWidth + 2,
        timelineContainsScroll:
          Boolean(timeline) && timeline!.scrollWidth > timeline!.clientWidth + 2,
      };
    });
    expect(overflow).toEqual({ documentOverflows: false, timelineContainsScroll: true });
  });

  test("mobile widths use the authoritative chronological fallback", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/en/projects/cs-khamis-hospital/timeline");

      const chronology = page.getByTestId("compact-chronology");
      await expect(chronology).toBeVisible();
      await expect(page.getByTestId("gantt-timeline")).toBeHidden();
      const phase = chronology.locator('[data-gantt-label="Structural Works"]');
      const task = chronology.locator('[data-gantt-label="Rebar Installation"]');
      const milestone = chronology.locator(
        '[data-gantt-label="Foundation Completed and Approved"]',
      );
      await expect(phase).toContainText("2027-04-01 → 2027-12-31");
      await expect(phase).toContainText("Forecast— → —");
      await expect(task).toContainText("80%");
      await expect(task).toContainText("In progress");
      await expect(milestone).toContainText("2027-08-30");
      await expect(milestone).toContainText("2027-09-15");
      const docOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      );
      expect(docOverflow).toBe(false);
    }
  });

  test("Arabic timeline localizes statuses and preserves RTL chrome", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/ar/projects/cs-khamis-hospital/timeline");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const gantt = page.getByTestId("gantt-timeline");
    await expect(gantt).toBeVisible();
    await expect(gantt.getByTestId("gantt-legend")).toContainText("اليوم");
    await expect(gantt.getByTestId("gantt-legend")).toContainText("خط الأساس");
    await expect(page.getByText("الأعمال الإنشائية").first()).toBeVisible();
    await expect(page.getByText("حفر الموقع").first()).toBeVisible();
    await expect(gantt.locator('[data-gantt-label="تركيب الحديد"]')).toContainText(
      "قيد التنفيذ",
    );
    await expect(gantt.locator('[data-gantt-label="صب الخرسانة"]')).toContainText("لم يبدأ");
    await expect(
      gantt.locator(
        '[data-gantt-label="اكتمال واعتماد الأساسات"] [data-testid="gantt-milestone-marker"]',
      ),
    ).toHaveAttribute("aria-label", /معتمد/);
    await expect(page.getByText("in progress", { exact: true })).toHaveCount(0);
    await expect(page.getByText("not started", { exact: true })).toHaveCount(0);
  });

  test("light and dark themes preserve authoritative timeline content", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/projects/cs-khamis-hospital/timeline");
    const gantt = page.getByTestId("gantt-timeline");
    const excavation = gantt.locator('[data-gantt-label="Site Excavation"]');
    const marker = gantt.locator(
      '[data-gantt-label="Foundation Completed and Approved"] [data-testid="gantt-milestone-marker"]',
    );

    await setTheme(page, "Light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(excavation).toContainText("Site Excavation");
    await expect(marker).toHaveAttribute("data-marker-date", "2027-09-15");

    await setTheme(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(excavation).toContainText("Site Excavation");
    await expect(excavation.getByTestId("gantt-baseline-bar")).toHaveAttribute(
      "title",
      "Baseline: 2027-04-01 → 2027-05-15",
    );
    await expect(marker).toHaveAttribute("data-marker-date", "2027-09-15");
  });
});
