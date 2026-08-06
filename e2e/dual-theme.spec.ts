import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";
const browserErrors = new WeakMap<import("@playwright/test").Page, string[]>();

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("dual theme platform", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    // Clear once per test via evaluate on first navigation — do not use
    // addInitScript, which would wipe preference again on reload.
    await page.goto("/en/auth/sign-in");
    await page.evaluate(() => localStorage.removeItem("almodawat-theme"));
  });

  test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page) ?? []).toEqual([]);
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
    expect(sidebarBg).toBe("rgb(248, 250, 252)");

    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    const darkSidebarBg = await page.getByTestId("app-sidebar").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkSidebarBg).toBe("rgb(10, 16, 28)");
  });

  test("theme preference persists across reload", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-dark").click();
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "dark");
  });

  test("theme preference synchronizes across tabs and survives history navigation", async ({ page, context }) => {
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-light").click();
    const secondPage = await context.newPage();
    await secondPage.goto("/en");
    await expect(secondPage.locator("html")).not.toHaveClass(/dark/);

    await page.getByTestId("theme-dark").click();
    await expect(secondPage.locator("html")).toHaveClass(/dark/);
    await page.goto("/en/cost-control");
    await page.goBack();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await secondPage.close();
  });

  test("system preference follows changes while the page is open", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-system").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("invalid and unavailable storage fall back without breaking theme controls", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("almodawat-theme", "invalid"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");

    await page.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new DOMException("Storage unavailable", "SecurityError");
      };
      Storage.prototype.setItem = () => {
        throw new DOMException("Storage unavailable", "SecurityError");
      };
    });
    await page.goto("/en/auth/sign-in");
    await expect(page.getByTestId("theme-toggle")).toBeVisible();
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "dark");
  });

  test("theme radios support arrow keys and mobile-size targets", async ({ page }) => {
    await page.goto("/en/auth/sign-in");
    const light = page.getByTestId("theme-light");
    await light.click();
    await light.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("theme-dark")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("theme-dark")).toBeFocused();
    const boxes = await page.getByTestId("theme-toggle").getByRole("radio").evaluateAll((radios) =>
      radios.map((radio) => {
        const rect = radio.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );
    for (const box of boxes) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
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

  test("mobile navigation traps and restores focus in both themes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "finance@modawat.local");
    await page.getByTestId("theme-light").click();
    await page.getByTestId("mobile-nav-toggle").click();
    await expect(page.getByTestId("app-sidebar-mobile")).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).click();
    await expect(page.getByTestId("app-sidebar-mobile")).toBeHidden();
    await expect(page.getByTestId("mobile-nav-toggle")).toBeFocused();
    await page.getByTestId("theme-dark").click();
    await page.getByTestId("mobile-nav-toggle").click();
    await expect(page.getByTestId("app-sidebar-mobile")).toBeVisible();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("app-sidebar-mobile")).toBeHidden();
    await expect(page.getByTestId("mobile-nav-toggle")).toBeFocused();
  });

  test("posted fixture allocation debt is visible in the actuals workspace", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/actuals");
    await expect(page.getByTestId("incomplete-allocation")).toHaveCount(6);
    await expect(page.getByText("Incomplete allocation").first()).toBeVisible();
  });

  test("viewer permissions unchanged under theme switch", async ({ page }) => {
    await signIn(page, "viewer@modawat.local");
    await page.goto("/en/budgets");
    await page.getByTestId("theme-dark").click();
    await expect(page.getByTestId("save-revenue-draft")).toBeDisabled();
  });

  test("representative routes have no document-level horizontal overflow", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    const errors = browserErrors.get(page) ?? [];
    await page.waitForTimeout(1_000);
    expect(errors.splice(0), "console errors after sign-in").toEqual([]);
    const routes = ["/en", "/en/cost-control", "/en/budgets", "/en/requisitions", "/en/administration"];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);
      // AppShell resolves entity context through server actions after mount. Let
      // those requests settle before the next full navigation so an aborted
      // request cannot be mistaken for a route failure.
      await page.waitForTimeout(1_000);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(overflow, `overflow on ${route}`).toBe(false);
      expect(errors.splice(0), `console errors on ${route}`).toEqual([]);
    }
  });
});
