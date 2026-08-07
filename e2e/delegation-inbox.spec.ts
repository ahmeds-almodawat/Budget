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

test.describe("delegation inbox", () => {
  test("finance sees active delegation; cost controller opens delegated approvals tab", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/delegations");
    await expect(page.getByRole("heading", { name: "Delegated Approvals", level: 1 })).toBeVisible();
    await expect(page.getByTestId("delegation-card").first()).toBeVisible();
    await expect(page.getByText(/active|نشط/i).first()).toBeVisible();

    await signOut(page);
    await signIn(page, "cost.controller@modawat.local");
    await page.goto("/en/approvals");
    await expect(page.getByRole("heading", { name: /Approvals|الاعتمادات/i, level: 1 })).toBeVisible();
    const delegatedTab = page.getByRole("button", { name: /delegated|مفوض/i });
    await expect(delegatedTab).toBeVisible();
    await delegatedTab.click();
    await expect(delegatedTab).toBeEnabled();
  });
});
