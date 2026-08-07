import { expect, test, type Page } from "@playwright/test";
import { PRIMARY_ROUTE_PATHS } from "../src/config/route-inventory";

const PASSWORD = "Password123!";

const PERSONAS = {
  viewer: "viewer@modawat.local",
  finance: "finance@modawat.local",
  budgetOwner: "budget.owner@modawat.local",
  projectManager: "pm@modawat.local",
  auditor: "auditor@modawat.local",
  administrator: "group.admin@modawat.local",
} as const;

async function signIn(page: Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en\/?$/);
}

async function expectAuthorized(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
  await expect(page.getByTestId("route-access-denied")).toHaveCount(0);
  await expect(page.locator("h1").first(), `authorized heading for ${path}`).toBeVisible();
}

async function expectDenied(page: Page, path: string, locale: "en" | "ar" = "en") {
  const localizedPath = path.replace(/^\/(en|ar)/, `/${locale}`);
  const response = await page.goto(localizedPath);
  expect(response?.status(), `controlled denial status for ${localizedPath}`).toBeLessThan(400);
  await expect(page).toHaveURL(new RegExp(`/${locale}/auth/access-denied$`));
  await expect(page.getByTestId("route-access-denied")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: locale === "ar" ? "تم رفض الوصول" : "Access denied",
    }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", locale === "ar" ? "rtl" : "ltr");
}

const ACCESS_MATRIX = [
  {
    name: "viewer",
    email: PERSONAS.viewer,
    allowed: ["/en/budgets", "/en/projects", "/en/reports", "/en/requisitions"],
    denied: ["/en/actuals", "/en/imports", "/en/audit", "/en/administration", "/en/forecasts"],
  },
  {
    name: "finance",
    email: PERSONAS.finance,
    allowed: ["/en/actuals", "/en/imports", "/en/forecasts", "/en/reports", "/en/purchase-orders"],
    denied: ["/en/projects", "/en/milestones", "/en/audit", "/en/administration"],
  },
  {
    name: "budget owner",
    email: PERSONAS.budgetOwner,
    allowed: ["/en/budgets", "/en/forecasts", "/en/requisitions"],
    denied: ["/en/actuals", "/en/imports", "/en/projects", "/en/audit", "/en/administration"],
  },
  {
    name: "project manager",
    email: PERSONAS.projectManager,
    allowed: ["/en/projects", "/en/milestones", "/en/tasks", "/en/changes", "/en/actuals", "/en/forecasts", "/en/reports"],
    denied: ["/en/budgets", "/en/imports", "/en/audit", "/en/administration"],
  },
  {
    name: "auditor",
    email: PERSONAS.auditor,
    allowed: ["/en/budgets", "/en/actuals", "/en/projects", "/en/audit", "/en/reports", "/en/requisitions"],
    denied: ["/en/milestones", "/en/tasks", "/en/forecasts", "/en/imports", "/en/administration"],
  },
  {
    name: "group administrator",
    email: PERSONAS.administrator,
    allowed: ["/en/administration", "/en/audit", "/en/budgets", "/en/projects", "/en/purchase-orders"],
    denied: [],
  },
] as const;

test.describe("direct-route authorization closure", () => {
  for (const persona of ACCESS_MATRIX) {
    test(`${persona.name} route and navigation matrix`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await signIn(page, persona.email);

      for (const path of persona.allowed) {
        await expectAuthorized(page, path);
      }

      for (const path of persona.denied) {
        await page.goto("/en");
        await expect(
          page.getByTestId("app-sidebar").locator(`a[href='${path}']`),
        ).toHaveCount(0);
        await expectDenied(page, path);
      }

      expect(errors, `${persona.name} browser errors`).toEqual([]);
    });
  }

  test("localized denial preserves light and dark themes", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await signIn(page, PERSONAS.viewer);
    await page.getByTestId("theme-dark").click();
    await expectDenied(page, "/en/actuals", "en");
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.goto("/en");
    await page.getByTestId("theme-light").click();
    await expectDenied(page, "/en/actuals", "ar");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    expect(errors).toEqual([]);
  });
});

test.describe("live primary route closure", () => {
  test("every deterministic primary route is functional and non-placeholder", async ({ page }) => {
    test.setTimeout(240_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await signIn(page, PERSONAS.administrator);
    for (const route of PRIMARY_ROUTE_PATHS) {
      const path = `/en${route === "/" ? "" : route}`;
      const response = await page.goto(path);
      expect(response?.status(), `HTTP status for ${path}`).toBeLessThan(400);
      await expect(page.getByTestId("route-access-denied"), `authorization for ${path}`).toHaveCount(0);
      await expect(page.locator("body"), `placeholder copy on ${path}`).not.toContainText(
        /Module coming soon|Coming soon|In development/i,
      );
      await expect(page.locator("h1").first(), `functional heading on ${path}`).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("every advertised report executes against the active legal entity", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));

    await signIn(page, PERSONAS.administrator);
    await page.goto("/en/reports");
    for (const type of [
      "budget_vs_actual",
      "budget_actual_commitments",
      "forecast_at_completion",
      "monthly_cash_flow",
      "milestone_performance",
      "restaurant_operational",
      "project_cost_phase_category",
      "team_milestone_performance",
      "variance_explanations",
      "unmapped_actuals",
      "audit_history",
      "procurement_pipeline",
      "invoice_match_exceptions",
      "period_close_readiness",
      "appraisal_cycle_completion",
    ]) {
      const button = page.getByTestId(`report-type-${type}`);
      await button.click();
      await expect(button, `${type} finished loading`).toBeEnabled();
    }
    expect(errors).toEqual([]);
  });
});
