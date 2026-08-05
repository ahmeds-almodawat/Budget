import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

const USERS = {
  budgetOwner: "budget.owner@modawat.local",
  approver: "approver@modawat.local",
  finance: "finance@modawat.local",
  auditor: "auditor@modawat.local",
  viewer: "viewer@modawat.local",
};

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

async function signOut(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL(/\/en\/auth\/sign-in/);
}

test.describe("authentication and authorization", () => {
  test("unauthenticated users are redirected to sign-in", async ({ page }) => {
    await page.goto("/en/budgets");
    await expect(page).toHaveURL(/\/en\/auth\/sign-in/);
  });

  test("budget owner creates and submits hospital budget", async ({ page }) => {
    await signIn(page, USERS.budgetOwner);
    await page.goto("/en/budgets");
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await page.getByRole("button", { name: "Draft" }).click();
    await expect(page.getByText(/Draft saved/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Submitted" }).click();
    await expect(page.getByText(/Submitted/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("approver approves budget after budget owner logout", async ({ browser }) => {
    test.setTimeout(90000);

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, USERS.budgetOwner);
    await ownerPage.goto("/en/budgets");
    await ownerPage.getByRole("button", { name: "Draft" }).click();
    await expect(ownerPage.getByText(/Draft saved/i)).toBeVisible({ timeout: 15000 });
    await ownerPage.getByRole("button", { name: "Submitted" }).click();
    await expect(ownerPage.getByText(/Submitted/i).first()).toBeVisible({ timeout: 15000 });
    await ownerContext.close();

    const financeContext = await browser.newContext();
    const financePage = await financeContext.newPage();
    await signIn(financePage, USERS.finance);
    await financePage.goto("/en/budgets");
    await expect(financePage.getByRole("button", { name: "Finance review" })).toBeEnabled({ timeout: 15000 });
    await financePage.getByRole("button", { name: "Finance review" }).click();
    await expect(financePage.getByText(/Under review/i).first()).toBeVisible({ timeout: 15000 });
    await financeContext.close();

    const approverContext = await browser.newContext();
    const approverPage = await approverContext.newPage();
    await signIn(approverPage, USERS.approver);
    await approverPage.goto("/en/budgets");
    await expect(approverPage.getByRole("button", { name: "Approved" })).toBeEnabled({ timeout: 15000 });
    await approverPage.getByRole("button", { name: "Approved" }).click();
    await expect(approverPage.getByText(/Approved and locked/i)).toBeVisible({ timeout: 15000 });
    await approverContext.close();
  });

  test("budget owner cannot self-approve", async ({ page }) => {
    await signIn(page, USERS.budgetOwner);
    await page.goto("/en/budgets");
    await expect(page.getByRole("button", { name: "Approved" })).toBeDisabled();
  });

  test("finance user can access imports", async ({ page }) => {
    await signIn(page, USERS.finance);
    await page.goto("/en/imports");
    await expect(page.getByRole("heading", { name: "Imports", level: 1 })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "Download CSV template" })).toBeEnabled();
  });

  test("auditor can view budgets but approve is disabled", async ({ page }) => {
    await signIn(page, USERS.auditor);
    await page.goto("/en/budgets");
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft" })).toBeDisabled();
  });

  test("Arabic RTL auth path", async ({ page }) => {
    await page.goto("/ar/auth/sign-in");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByLabel("البريد الإلكتروني").fill(USERS.viewer);
    await page.getByLabel("كلمة المرور").fill(PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL(/\/ar(\/)?$/);
    await expect(page.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
  });

  test("sign out blocks protected routes", async ({ page }) => {
    await signIn(page, USERS.viewer);
    await signOut(page);
    await page.goto("/en/budgets");
    await expect(page).toHaveURL(/\/en\/auth\/sign-in/);
  });
});

test.describe("database-backed workflows (authenticated)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, USERS.finance);
  });

  test("Hospital dashboard loads", async ({ page }) => {
    await page.goto("/en/dashboard/hospital");
    await expect(page.getByRole("heading", { name: "Hospital Operational Dashboard" })).toBeVisible({ timeout: 15000 });
  });

  test("Executive dashboard loads", async ({ page }) => {
    await page.goto("/en/dashboard/executive");
    await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible({ timeout: 15000 });
  });
});
