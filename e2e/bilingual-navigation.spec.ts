import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("database-backed workflows", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "finance@modawat.local");
  });

  test("English navigation and budget workflow page", async ({ page }) => {
    await page.goto("/en/budgets");
    await expect(page.getByRole("heading", { name: "Budgets" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Draft", exact: true })).toBeVisible();
  });

  test("Import page loads", async ({ page }) => {
    await page.goto("/en/imports");
    await expect(page.getByRole("heading", { name: "Imports" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download CSV template" })).toBeVisible();
  });

  test("Hospital dashboard handles empty or database state", async ({ page }) => {
    await page.goto("/en/dashboard/hospital");
    await expect(page.getByRole("heading", { name: "Hospital Operational Dashboard" })).toBeVisible();
  });

  test("Arabic RTL navigation", async ({ page }) => {
    await page.goto("/ar/budgets");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "الميزانيات", exact: true })).toBeVisible();
  });

  test("Executive dashboard loads from database layer", async ({ page }) => {
    await page.goto("/en/dashboard/executive");
    await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();
  });
});
