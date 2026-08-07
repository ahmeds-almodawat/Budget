import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

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

  test("project overview surfaces schedule preview with real names", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/projects/cs-khamis-hospital");

    const preview = page.getByTestId("project-schedule-preview");
    await expect(preview).toBeVisible();
    await expect(preview.locator("h2")).toHaveText(/Project schedule/i);
    await expect(page.getByTestId("view-full-timeline")).toBeVisible();
    await expect(page.getByTestId("schedule-kpis")).toBeVisible();

    const gantt = page.getByTestId("gantt-timeline-preview");
    await expect(gantt).toBeVisible();
    await expect(gantt.getByText("Structural Works")).toBeVisible();
    await expect(gantt.getByText("Site Excavation")).toBeVisible();
    await expect(gantt.getByText("Foundation Completed and Approved")).toBeVisible();
    await expect(gantt.getByTestId("gantt-baseline-bar").first()).toBeVisible();
    await expect(gantt.getByTestId("gantt-forecast-bar").first()).toBeVisible();
    await expect(gantt.getByTestId("gantt-milestone-marker").first()).toBeVisible();
    await expect(gantt.getByTestId("gantt-calendar-header")).toBeVisible();
  });

  test("full timeline page renders professional gantt content", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/projects/cs-khamis-hospital/timeline");

    await expect(page.getByTestId("project-timeline-page")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/timeline/i);

    const gantt = page.getByTestId("gantt-timeline");
    await expect(gantt).toBeVisible();
    await expect(gantt.getByTestId("gantt-calendar-header")).toBeVisible();
    await expect(gantt.getByText("Structural Works")).toBeVisible();
    await expect(gantt.getByText("Foundation Works")).toBeVisible();
    await expect(gantt.getByText("Site Excavation")).toBeVisible();
    await expect(gantt.getByText("Rebar Installation")).toBeVisible();
    await expect(gantt.getByText("Foundation Completed and Approved")).toBeVisible();

    await expect(gantt.getByTestId("gantt-baseline-bar").first()).toBeVisible();
    await expect(gantt.getByTestId("gantt-forecast-bar").first()).toBeVisible();
    await expect(
      gantt.locator('[data-testid="gantt-progress-fill"][title*="100%"]').first(),
    ).toBeVisible();
    await expect(gantt.getByTestId("gantt-milestone-marker").first()).toBeVisible();
    await expect(gantt.getByTestId("gantt-legend")).toContainText("Baseline");
    await expect(gantt.getByTestId("gantt-legend")).toContainText("Today");

    const docOverflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth > root.clientWidth + 2;
    });
    expect(docOverflow).toBe(false);
  });

  test("mobile uses chronological fallback", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/cs-khamis-hospital/timeline");

    await expect(page.getByTestId("compact-chronology")).toBeVisible();
    await expect(page.getByTestId("gantt-timeline")).toBeHidden();
    await expect(page.getByTestId("chronology-item").first()).toContainText(/Structural|Foundation|Excavation|Milestone/i);
    await expect(page.getByTestId("compact-chronology")).toContainText("Baseline");
    await expect(page.getByTestId("compact-chronology")).toContainText("Forecast");
  });

  test("Arabic timeline controls and RTL chrome", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/ar/projects/cs-khamis-hospital/timeline");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("gantt-timeline")).toBeVisible();
    await expect(page.getByTestId("gantt-legend")).toContainText("اليوم");
    await expect(page.getByTestId("gantt-legend")).toContainText("خط الأساس");
    await expect(page.getByText("الأعمال الإنشائية").first()).toBeVisible();
    await expect(page.getByText("حفر الموقع").first()).toBeVisible();
    await expect(page.getByText("قيد التنفيذ").first()).toBeVisible();
  });

  test("dark theme renders timeline without losing schedule labels", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/projects/cs-khamis-hospital/timeline");
    const gantt = page.getByTestId("gantt-timeline");
    await expect(gantt.getByText("Site Excavation")).toBeVisible();
    const before = await gantt.innerText();

    await setTheme(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(gantt.getByText("Site Excavation")).toBeVisible();
    await expect(gantt.getByTestId("gantt-milestone-marker").first()).toBeVisible();
    const after = await gantt.innerText();
    expect(after).toContain("Site Excavation");
    expect(after.replace(/\s+/g, " ").length).toBeGreaterThan(40);
    expect(before).toContain("Structural Works");
  });
});
