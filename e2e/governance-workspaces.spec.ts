import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

const governanceRoutes: { path: string; heading: string }[] = [
  { path: "/en/master-data", heading: "Master Data Governance" },
  { path: "/en/delegations", heading: "Delegated Approvals" },
  { path: "/en/requisitions", heading: "Purchase Requisitions" },
  { path: "/en/purchase-orders", heading: "Purchase Orders" },
  { path: "/en/period-close", heading: "Period Calendar & Close" },
  { path: "/en/approval-rules", heading: "Approval Rules" },
  { path: "/en/cost-control", heading: "Budget vs Actual" },
  { path: "/en/administration", heading: "Administration" },
];

test.describe("governance workspaces", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
  });

  for (const route of governanceRoutes) {
    test(`loads ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading, level: 1 })).toBeVisible();
      await expect(page.getByText("Module coming soon")).toHaveCount(0);
    });
  }

  test("Arabic RTL master data page", async ({ page }) => {
    await page.goto("/ar/master-data");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "حوكمة البيانات الرئيسية", exact: true })).toBeVisible();
  });
});
