import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("dual theme platform", () => {
  test.beforeEach(async ({ page }) => {
    // Clear once per test via evaluate on first navigation — do not use
    // addInitScript, which would wipe preference again on reload.
    await page.goto("/en/auth/sign-in");
    await page.evaluate(() => localStorage.removeItem("almodawat-theme"));
  });

  test("sign-in supports theme toggle and dark class", async ({ page }) => {
    await page.goto("/en/auth/sign-in");
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("authenticated shell switches light and dark with light sidebar", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/dashboard/executive");
    await page.getByTestId("theme-light").click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    const sidebarBg = await page.getByTestId("app-sidebar").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sidebarBg).not.toBe("rgb(10, 16, 28)");

    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("theme preference persists across reload", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-dark").click();
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "dark");
  });

  test("system preference is selectable", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-system").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
  });

  test("budget vs actual and revenue form remain usable in both themes", async ({ page }) => {
    await signIn(page, "budget.owner@modawat.local");
    await page.goto("/en/cost-control");
    await page.getByTestId("theme-dark").click();
    await expect(page.getByTestId("budget-vs-actual-workspace")).toBeVisible();
    await page.getByTestId("theme-light").click();
    await expect(page.getByTestId("budget-vs-actual-workspace")).toBeVisible();

    await page.goto("/en/budgets");
    await page.getByTestId("net-quantity").fill("999");
    await page.getByTestId("theme-dark").click();
    await expect(page.getByTestId("net-quantity")).toHaveValue("999");
    await expect(page.getByTestId("revenue-budget-workflow")).toBeVisible();
  });

  test("Arabic RTL works in light and dark", async ({ page }) => {
    await page.goto("/ar/auth/sign-in");
    await page.getByLabel("البريد الإلكتروني").fill("finance@modawat.local");
    await page.getByLabel("كلمة المرور").fill(PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();
    await page.waitForURL(/\/ar(\/)?$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByTestId("theme-light").click();
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("mobile navigation opens in both themes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-light").click();
    await page.getByTestId("mobile-nav-toggle").click();
    await expect(page.getByTestId("app-sidebar-mobile")).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
    await page.getByTestId("theme-dark").click();
    await page.getByTestId("mobile-nav-toggle").click();
    await expect(page.getByTestId("app-sidebar-mobile")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("viewer permissions unchanged under theme switch", async ({ page }) => {
    await signIn(page, "viewer@modawat.local");
    await page.goto("/en/budgets");
    await page.getByTestId("theme-dark").click();
    await expect(page.getByTestId("save-revenue-draft")).toBeDisabled();
  });

  test("representative routes have no document-level horizontal overflow", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    const routes = ["/en", "/en/cost-control", "/en/budgets", "/en/requisitions", "/en/administration"];
    for (const route of routes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(overflow, `overflow on ${route}`).toBe(false);
    }
  });
});
