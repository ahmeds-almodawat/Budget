import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "Password123!";

const USERS = {
  budgetOwner: "budget.owner@modawat.local",
  finance: "finance@modawat.local",
  approver: "approver@modawat.local",
};

async function signIn(page: Page, email: string, locale: "en" | "ar" = "en") {
  await page.goto(`/${locale}/auth/sign-in`);
  const emailLabel = locale === "ar" ? "البريد الإلكتروني" : "Email";
  const passwordLabel = locale === "ar" ? "كلمة المرور" : "Password";
  const signInLabel = locale === "ar" ? "تسجيل الدخول" : "Sign In";
  await page.getByLabel(emailLabel).fill(email);
  await page.getByLabel(passwordLabel).fill(PASSWORD);
  await page.getByRole("button", { name: signInLabel }).click();
  await page.waitForURL(new RegExp(`/${locale}(/)?$`));
}

async function signOut(page: Page, locale: "en" | "ar" = "en") {
  const label = locale === "ar" ? "تسجيل الخروج" : "Sign Out";
  await page.getByRole("button", { name: label }).click();
  await page.waitForURL(new RegExp(`/${locale}/auth/sign-in`));
}

function forecastCard(page: Page, versionLabel: string) {
  return page.getByTestId("forecast-version-card").filter({
    has: page.getByRole("heading", {
      name: versionLabel,
      exact: true,
    }),
  });
}

async function clickForecastAction(page: Page, versionLabel: string, buttonName: string) {
  const card = forecastCard(page, versionLabel);

  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible();

  const button = card.getByRole("button", {
    name: buttonName,
    exact: true,
  });

  await expect(button).toHaveCount(1);
  await expect(button).toBeEnabled();
  await button.click();
}

async function waitForForecastCardStatus(
  page: Page,
  versionLabel: string,
  statusLabel: string,
) {
  const card = forecastCard(page, versionLabel);
  await expect(card).toHaveCount(1);
  await expect(card).toBeVisible({ timeout: 15000 });
  await expect(card.getByText(statusLabel, { exact: true })).toBeVisible({ timeout: 15000 });
}

test.describe.configure({ mode: "serial" });

test.describe("forecast governed workflow (English)", () => {
  test("full draft submit review approve supersede path", async ({ browser }) => {
    test.setTimeout(180000);
    const suffix = Date.now();
    const v1 = `E2E-FC1-${suffix}`;
    const v2 = `E2E-FC2-${suffix}`;

    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    await signIn(ownerPage, USERS.budgetOwner);
    await ownerPage.goto("/en/forecasts");
    await expect(ownerPage.getByRole("heading", { name: "Forecasts" })).toBeVisible({ timeout: 15000 });

    await ownerPage.getByLabel("Version label").fill(v1);
    await ownerPage.getByLabel("Forecast amount").fill("42000");
    await ownerPage.getByRole("button", { name: "Create draft" }).click();
    await expect(ownerPage.getByText(/Forecast draft created/i)).toBeVisible({ timeout: 15000 });

    await clickForecastAction(ownerPage, v1, "Submit");
    await expect(ownerPage.getByText(/submitted for review/i)).toBeVisible({ timeout: 15000 });
    await ownerContext.close();

    const financeContext = await browser.newContext();
    const financePage = await financeContext.newPage();
    await signIn(financePage, USERS.finance);
    await financePage.goto("/en/forecasts");
    await waitForForecastCardStatus(financePage, v1, "Submitted");
    await clickForecastAction(financePage, v1, "Start review");
    await expect(financePage.getByText(/review started/i)).toBeVisible({ timeout: 15000 });
    await financeContext.close();

    const approverContext = await browser.newContext();
    const approverPage = await approverContext.newPage();
    await signIn(approverPage, USERS.approver);
    await approverPage.goto("/en/forecasts");
    await waitForForecastCardStatus(approverPage, v1, "Pending");
    await clickForecastAction(approverPage, v1, "Approve");
    await expect(approverPage.getByText(/approved and locked/i)).toBeVisible({ timeout: 15000 });
    await approverContext.close();

    const owner2Context = await browser.newContext();
    const owner2Page = await owner2Context.newPage();
    await signIn(owner2Page, USERS.budgetOwner);
    await owner2Page.goto("/en/forecasts");
    await owner2Page.getByLabel("Version label").fill(v2);
    await owner2Page.getByLabel("Forecast amount").fill("48000");
    await owner2Page.getByRole("button", { name: "Create draft" }).click();
    await expect(owner2Page.getByText(/Forecast draft created/i)).toBeVisible({ timeout: 15000 });
    await clickForecastAction(owner2Page, v2, "Submit");
    await expect(owner2Page.getByText(/submitted for review/i)).toBeVisible({ timeout: 15000 });
    await owner2Context.close();

    const finance2Context = await browser.newContext();
    const finance2Page = await finance2Context.newPage();
    await signIn(finance2Page, USERS.finance);
    await finance2Page.goto("/en/forecasts");
    await waitForForecastCardStatus(finance2Page, v2, "Submitted");
    await clickForecastAction(finance2Page, v2, "Start review");
    await expect(finance2Page.getByText(/review started/i)).toBeVisible({ timeout: 15000 });
    await finance2Context.close();

    const approver2Context = await browser.newContext();
    const approver2Page = await approver2Context.newPage();
    await signIn(approver2Page, USERS.approver);
    await approver2Page.goto("/en/forecasts");
    await expect(approver2Page.getByText("Approve and supersede current forecast")).toBeVisible({
      timeout: 15000,
    });
    await approver2Page.getByLabel("Approver comment").fill("E2E supersede approval");
    await approver2Page.getByRole("button", { name: "Confirm approve and supersede" }).click();
    await approver2Page.getByRole("button", { name: "Confirm" }).click();
    await expect(approver2Page.getByText(/prior version superseded|approved and locked/i)).toBeVisible({
      timeout: 30000,
    });
    await expect(forecastCard(approver2Page, v1).getByText("Superseded")).toBeVisible();
    await approver2Context.close();
  });
});

test.describe("forecast governed workflow (Arabic RTL)", () => {
  test("Arabic forecast create and submit", async ({ page }) => {
    test.setTimeout(90000);
    const versionLabel = `AR-FC-${Date.now()}`;
    await signIn(page, USERS.budgetOwner, "ar");
    await page.goto("/ar/forecasts");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "التوقعات" })).toBeVisible({ timeout: 15000 });
    await page.getByLabel("تسمية الإصدار").fill(versionLabel);
    await page.getByLabel("مبلغ التوقع").fill("35000");
    await page.getByRole("button", { name: "إنشاء مسودة" }).click();
    await expect(page.getByText(/تم إنشاء مسودة التوقع/i)).toBeVisible({ timeout: 15000 });
    await clickForecastAction(page, versionLabel, "إرسال");
    await expect(page.getByText(/تم إرسال التوقع/i)).toBeVisible({ timeout: 15000 });
    await signOut(page, "ar");
  });
});
