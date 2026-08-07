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
    const revenueKpi = page.getByRole("article", { name: "Net revenue" });
    await expect(revenueKpi).toContainText("SAR 157K");
    await expect(page.getByRole("article", { name: "CAPEX" })).toContainText("SAR 0.00");
    const revenueChart = page.getByTestId("financial-trend-chart").first();
    await expect(
      revenueChart.getByRole("row", { name: /P3 SAR .* SAR 157,000\.00/ }),
    ).toBeAttached();

    const before = await revenueKpi.innerText();
    await setTheme(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    const afterDark = await revenueKpi.innerText();
    expect(afterDark.replace(/\s+/g, " ")).toBe(before.replace(/\s+/g, " "));

    await setTheme(page, "Light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("Arabic executive dashboard is RTL", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/ar/dashboard/executive");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByTestId("executive-analytics")).toBeVisible();
    await expect(page.getByRole("article", { name: "النفقات الرأسمالية" })).toContainText(
      "منفصلة عن المساهمة التشغيلية",
    );
    await expect(page.getByText("Separate from operating contribution")).toHaveCount(0);
  });

  test("budget vs actual and operational dashboards render analytics", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/cost-control");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Module coming soon")).toHaveCount(0);
    await expect(
      page.getByRole("row", { name: /P3 SAR .* SAR 157,000\.00/ }).first(),
    ).toBeAttached();

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
    const gantt = page.getByTestId("gantt-timeline");
    await expect(gantt).toBeVisible();
    await expect(gantt.getByText("Site Excavation")).toBeVisible();
    await expect(gantt.getByTestId("gantt-milestone-marker").first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("compact-chronology")).toBeVisible();
    await expect(page.getByTestId("gantt-timeline")).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto("/ar/projects/cs-khamis-hospital/timeline");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByText("قيد التنفيذ").first()).toBeVisible();
    await expect(page.getByTestId("gantt-legend")).toContainText("اليوم");

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

    await page.goto("/en/reports");
    await page.getByTestId("report-type-budget_vs_actual").click();
    const reportPreview = page.getByTestId("report-visual-preview");
    await expect(reportPreview).toBeVisible();
    await expect(
      reportPreview.getByRole("row", { name: /Revenue SAR .* SAR 162,000\.00/ }),
    ).toBeAttached();
  });
});
