import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";
const KM_MILESTONE_ID = "ffffffff-ffff-ffff-ffff-ffffffffff01";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("project schedule workflows", () => {
  test("employee submits progress and approver verifies", async ({ browser }) => {
    test.setTimeout(90000);

    const employeeContext = await browser.newContext();
    const employeePage = await employeeContext.newPage();
    await signIn(employeePage, "employee@modawat.local");
    await employeePage.goto(`/en/milestones/${KM_MILESTONE_ID}`);
    await expect(employeePage.getByRole("heading", { name: /Foundation Completed/i })).toBeVisible({ timeout: 15000 });
    await employeePage.getByRole("button", { name: "Submit" }).click();
    await expect(employeePage.getByText(/Progress submitted/i)).toBeVisible({ timeout: 15000 });
    await employeeContext.close();

    const approverContext = await browser.newContext();
    const approverPage = await approverContext.newPage();
    await signIn(approverPage, "approver@modawat.local");
    await approverPage.goto("/en/milestones/progress-approval");
    await expect(approverPage.getByRole("heading", { name: "Progress approval" })).toBeVisible({ timeout: 15000 });
    await approverPage.getByRole("button", { name: "Verify" }).first().click();
    await expect(approverPage.getByText(/Progress verified/i)).toBeVisible({ timeout: 15000 });
    await approverContext.close();
  });

  test("milestones and tasks pages load", async ({ page }) => {
    await signIn(page, "pm@modawat.local");
    await page.goto("/en/milestones");
    await expect(page.getByRole("heading", { name: "Milestones" })).toBeVisible({ timeout: 15000 });
    await page.goto("/en/tasks");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible({ timeout: 15000 });
    await page.goto("/en/projects/cs-khamis-hospital/timeline");
    await expect(page.getByRole("heading", { name: "Project timeline" })).toBeVisible({ timeout: 15000 });
  });
});
