import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/, { timeout: 30_000 });
}

async function signOut(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Sign Out" }).click();
  await page.waitForURL(/\/en\/auth\/sign-in/, { timeout: 30_000 });
}

test.describe("appraisal lifecycle", () => {
  test("employee sees own appraisal; manager sees team appraisal; viewer denied", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page, "employee@modawat.local");
    await page.goto("/en/performance");
    await expect(page.getByRole("heading", { name: /Employee|Performance|أداء/i, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /my|تقييماتي/i }).click();
    await expect(page.getByText(/FY2027|Mid-Year|منتصف/i).first()).toBeVisible({ timeout: 20_000 });

    await signOut(page);
    await signIn(page, "pm@modawat.local");
    await page.goto("/en/performance");
    await page.getByRole("button", { name: /team|الفريق/i }).click();
    await expect(
      page.getByText(/Employee User|الموظف|employee@modawat\.local|employee_self_review/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: /Employee User|الموظف|aaaaaaaa/i }).first()).toBeVisible();

    await signOut(page);
    await signIn(page, "viewer@modawat.local");
    await page.goto("/en/performance");
    const denied = page.getByTestId("route-access-denied");
    if (await denied.count()) {
      await expect(denied).toBeVisible();
    } else {
      await page.getByRole("button", { name: /my|تقييماتي/i }).click();
      await expect(page.getByText(/FY2027 Mid-Year Appraisal/i)).toHaveCount(0);
    }
  });
});
