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

test.describe("procurement lifecycle", () => {
  test("abbreviated happy path through requisition and downstream workspaces", async ({ page }) => {
    test.setTimeout(180_000);
    const reqNumber = `E2E-REQ-${Date.now()}`;

    await signIn(page, "budget.owner@modawat.local");
    await page.goto("/en/requisitions");
    await expect(page.getByRole("heading", { name: "Purchase Requisitions", level: 1 })).toBeVisible();

    await page.locator("#req-number").fill(reqNumber);
    await page.locator("#req-title-en").fill("E2E Procurement Lifecycle");
    await page.locator("#req-title-ar").fill("اختبار مسار المشتريات");
    await page.getByRole("button", { name: /create requisition|إنشاء طلب/i }).click();
    await expect(page.getByTestId("requisition-card").filter({ hasText: reqNumber })).toBeVisible({
      timeout: 30_000,
    });

    const card = page.getByTestId("requisition-card").filter({ hasText: reqNumber });
    await card.locator("input").nth(0).fill("E2E line item");
    await card.locator("input[type=number]").nth(0).fill("2");
    await card.locator("input[type=number]").nth(1).fill("150");
    await card.getByRole("button", { name: /add line|إضافة سطر/i }).click();
    await expect(card.getByText("E2E line item")).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: /^Submit$|^إرسال$/i }).click();
    await expect(card.getByText(/submitted/i)).toBeVisible({ timeout: 20_000 });

    // DB gate: department_approved requires cost_controller / admin / budget_owner@scope
    await signOut(page);
    await signIn(page, "cost.controller@modawat.local");
    await page.goto("/en/requisitions");
    const controllerCard = page.getByTestId("requisition-card").filter({ hasText: reqNumber });
    await expect(controllerCard).toBeVisible({ timeout: 30_000 });
    const deptBtn = controllerCard.getByRole("button", { name: /department approve|اعتماد القسم/i });
    if (await deptBtn.isVisible()) {
      await deptBtn.click();
      await expect(controllerCard.getByText(/department_approved/i)).toBeVisible({ timeout: 20_000 });
    }

    await signOut(page);
    await signIn(page, "finance@modawat.local");
    await page.goto("/en/requisitions");
    const financeCard = page.getByTestId("requisition-card").filter({ hasText: reqNumber });
    const budgetBtn = financeCard.getByRole("button", { name: /budget check|فحص الميزانية/i });
    if (await budgetBtn.isVisible()) {
      await budgetBtn.click();
      await expect(financeCard.getByText(/budget_checked/i)).toBeVisible({ timeout: 20_000 });
    }

    await signOut(page);
    await signIn(page, "group.admin@modawat.local");
    for (const [path, heading] of [
      ["/en/rfqs", "RFQs"],
      ["/en/quotations", "Quotations"],
      ["/en/evaluations", "Evaluations & Awards"],
      ["/en/purchase-orders", "Purchase Orders"],
      ["/en/receipts", "Goods Receipts"],
      ["/en/supplier-invoices", "Supplier Invoices"],
      ["/en/payment-requests", "Payment Requests"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expect(page.getByText("Module coming soon")).toHaveCount(0);
    }
  });
});
