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

test.describe("period close checklist", () => {
  test("loads period close workspace with readiness and checklist controls", async ({ page }) => {
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/period-close");
    await expect(page.getByRole("heading", { name: "Period Calendar & Close", level: 1 })).toBeVisible();
    const closeModuleSelect = page.locator("select").first();
    await expect(closeModuleSelect).toBeVisible();
    await expect(closeModuleSelect.locator('option[value="actuals"]')).toHaveCount(1);
    await expect(page.getByText("Module coming soon")).toHaveCount(0);
  });
});
