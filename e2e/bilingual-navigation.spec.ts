import { test, expect } from "@playwright/test";

test.describe("bilingual navigation", () => {
  test("English home loads with navigation", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Executive Dashboard" })).toBeVisible();
  });

  test("Arabic RTL layout", async ({ page }) => {
    await page.goto("/ar");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(html).toHaveAttribute("lang", "ar");
  });

  test("executive dashboard shows KPI cards", async ({ page }) => {
    await page.goto("/en/dashboard/executive");
    await expect(page.getByRole("heading", { name: "Executive Dashboard" })).toBeVisible();
  });
});
