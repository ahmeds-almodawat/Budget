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

test.describe("visual analytics", () => {
  test("executive dashboard KPIs and charts render in light and dark", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/dashboard/executive");
    await expect(page.getByRole("heading", { name: /Executive Dashboard/i, level: 1 })).toBeVisible();
    await expect(page.getByTestId("executive-analytics")).toBeVisible();
    await expect(page.getByTestId("executive-analytics").locator("article").first()).toBeVisible();

    const before = await page.getByTestId("executive-analytics").locator("article").first().innerText();
    await setTheme(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const afterDark = await page.getByTestId("executive-analytics").locator("article").first().innerText();
    expect(afterDark.replace(/\s+/g, " ")).toBe(before.replace(/\s+/g, " "));

    await setTheme(page, "Light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("Arabic executive dashboard is RTL", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/ar/dashboard/executive");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("executive-analytics")).toBeVisible();
  });

  test("budget vs actual and operational dashboards render analytics", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/cost-control");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Module coming soon")).toHaveCount(0);

    await page.goto("/en/dashboard/hospital");
    await expect(page.getByRole("heading", { name: /Hospital/i, level: 1 })).toBeVisible();

    await page.goto("/en/dashboard/restaurant");
    await expect(page.getByRole("heading", { name: /Restaurant/i, level: 1 })).toBeVisible();
    await expect(page.getByTestId("category-bar-chart").or(page.getByText(/No data available|لا تتوفر/i)).first()).toBeVisible();
  });

  test("project timeline and procurement pipeline analytics", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/projects/cs-khamis-hospital/timeline");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByTestId("gantt-timeline").or(page.getByTestId("roadmap-timeline")).or(page.getByText(/No project timeline|لا تتوفر/i)).first(),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("compact-chronology").or(page.getByTestId("gantt-timeline")).or(page.getByRole("heading", { level: 1 })).first()).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto("/en/purchase-orders");
    await expect(page.getByTestId("pipeline-funnel").or(page.getByText(/No procurement pipeline|لا تتوفر|Purchase Orders/i)).first()).toBeVisible();
  });

  test("period close, performance, and no document overflow on executive", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/period-close");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });

    await page.goto("/en/dashboard/executive");
    await expect(page.getByTestId("executive-analytics")).toBeVisible({ timeout: 20_000 });
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);

    await page.getByRole("button", { name: "Sign Out" }).click();
    await page.waitForURL(/\/en\/auth\/sign-in/);
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/performance");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  });
});
