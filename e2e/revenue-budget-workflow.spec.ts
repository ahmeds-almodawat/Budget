import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("revenue budget workflow", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "budget.owner@modawat.local");
  });

  test("opens revenue budget creation form", async ({ page }) => {
    await page.goto("/en/budgets");
    await expect(page.getByTestId("revenue-budget-workflow")).toBeVisible();
    await expect(page.getByTestId("basis-net-only")).toBeVisible();
  });

  test("net-only basis entry with quantity, rate, amount, and dimensions", async ({ page }) => {
    await page.goto("/en/budgets");
    await page.getByTestId("basis-net-only").click();
    await page.getByTestId("net-quantity").fill("1000");
    await page.getByTestId("net-rate").fill("500");
    await page.getByTestId("net-amount").fill("500000");
    await expect(page.getByTestId("net-only-form")).toBeVisible();
  });

  test("monthly phasing section is visible for reconciliation", async ({ page }) => {
    await page.goto("/en/budgets");
    await expect(page.getByTestId("monthly-phasing")).toBeVisible();
  });

  test("component-based basis with gross and rejection preview", async ({ page }) => {
    await page.goto("/en/budgets");
    await page.getByTestId("basis-component").click();
    await expect(page.getByTestId("component-form")).toBeVisible();
    await expect(page.getByTestId("component-gross_revenue-annual")).toBeVisible();
    await expect(page.getByTestId("component-rejection-annual")).toBeVisible();
    await expect(page.getByTestId("component-preview")).toBeVisible();
    await expect(page.getByTestId("component-preview")).toContainText("1140000");
  });

  test("Arabic RTL revenue budget form layout", async ({ page }) => {
    await page.goto("/ar/budgets");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("revenue-budget-workflow")).toBeVisible();
    await expect(page.getByTestId("basis-net-only")).toBeVisible();
  });
});

test.describe("revenue budget access control", () => {
  test("viewer cannot save revenue budget draft", async ({ page }) => {
    await signIn(page, "viewer@modawat.local");
    await page.goto("/en/budgets");
    await expect(page.getByTestId("revenue-budget-workflow")).toBeVisible();
    await expect(page.getByTestId("save-revenue-draft")).toBeDisabled();
  });

  test("auditor cannot save revenue budget draft", async ({ page }) => {
    await signIn(page, "auditor@modawat.local");
    await page.goto("/en/budgets");
    await expect(page.getByTestId("save-revenue-draft")).toBeDisabled();
  });
});

test.describe("revenue export and reporting", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "finance@modawat.local");
  });

  test("exports filtered revenue report CSV", async ({ page }) => {
    await page.goto("/en/cost-control");
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-bva-csv").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^revenue-detail-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test("internal revenue remains in revenue workspace", async ({ page }) => {
    await page.goto("/en/cost-control");
    await page.getByRole("button", { name: "Revenue" }).click();
    await expect(page.getByTestId("budget-vs-actual-workspace")).toBeVisible();
  });
});
