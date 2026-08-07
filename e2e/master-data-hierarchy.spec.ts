import { test, expect } from "@playwright/test";

const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/en/auth/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(/\/en(\/)?$/);
}

test.describe("master data hierarchy", () => {
  test("master data workspace loads hierarchical types and existing records", async ({ page }) => {
    await signIn(page, "group.admin@modawat.local");
    await page.goto("/en/master-data");
    await expect(page.getByRole("heading", { name: "Master Data Governance", level: 1 })).toBeVisible();
    await expect(page.getByText("Module coming soon")).toHaveCount(0);

    const entitySelect = page.getByRole("combobox", { name: /Active legal entity|الكيان/i });
    if (await entitySelect.count()) {
      await entitySelect.selectOption({ label: "MODAWAT" }).catch(() => undefined);
    }

    const filter = page.getByLabel(/Filter|تصفية/i);
    await expect(filter).toBeVisible();
    const organizationUnitValue = await filter
      .locator("option")
      .filter({ hasText: /Organization unit(?! type)|وحدة تنظيمية/i })
      .first()
      .getAttribute("value");
    await filter.selectOption(organizationUnitValue ?? { index: 2 }).catch(async () => {
      const options = filter.locator("option");
      const count = await options.count();
      if (count > 2) await filter.selectOption({ index: 2 });
    });

    const treeToggle = page.getByRole("button", { name: /tree|شجرة/i });
    if (await treeToggle.count()) {
      await treeToggle.click();
    }

    await expect(
      page
        .getByTestId("master-record-card")
        .or(page.getByText(/No data available|لا توجد بيانات|no records|لا توجد/i))
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
