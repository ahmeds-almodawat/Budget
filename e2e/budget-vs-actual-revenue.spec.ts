import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("budget vs actual revenue semantics", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "finance@modawat.local");
  });

  test("English budget vs actual workspace loads", async ({ page }) => {
    await page.goto("/en/cost-control");
    await expect(page.getByRole("heading", { name: "Budget vs Actual", level: 1 })).toBeVisible();
    await expect(page.getByTestId("budget-vs-actual-workspace")).toBeVisible();
    await expect(page.getByRole("button", { name: "Revenue", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expenses" })).toBeVisible();
  });

  test("Arabic RTL budget vs actual workspace", async ({ page }) => {
    await page.goto("/ar/cost-control");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الميزانية مقابل الفعلي", exact: true })).toBeVisible();
  });

  test("revenue and expense tabs show different sections", async ({ page }) => {
    await page.goto("/en/cost-control");
    await page.getByRole("button", { name: "Revenue", exact: true }).click();
    await expect(page.getByText("Revenue detail")).toBeVisible();
    await page.getByRole("button", { name: "Expenses" }).click();
    await expect(page.getByText("Expense detail")).toBeVisible();
    await page.getByRole("button", { name: "Profitability", exact: true }).click();
    await expect(page.getByTestId("profitability-section")).toBeVisible();
  });
});
