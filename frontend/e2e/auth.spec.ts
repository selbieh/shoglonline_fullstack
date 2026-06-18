import { expect, test } from "@playwright/test";

/**
 * AC-1 — auth golden journey against the stubbed stack (GOOGLE_AUTH_STUB on):
 * dev stub login → (first-time) mode selection → dashboard → logout.
 * Resilient to reruns: if the stub account already has a mode, it lands on /dashboard directly.
 */
test("stub login → mode select → dashboard → logout", async ({ page }) => {
  await page.goto("/signin");
  await page.getByRole("button", { name: /دخول تجريبي/ }).click();

  await page.waitForURL(/\/(onboarding\/mode|dashboard)/);
  if (page.url().includes("/onboarding/mode")) {
    await page.getByRole("button", { name: "أبحث عن عمل" }).click();
  }
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText(/صباح الخير|مرحبًا/)).toBeVisible();

  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page).toHaveURL(/\/(signin)?$/);
});
