import { expect, test, type Page } from "@playwright/test";

/**
 * Authenticated page-load smoke (Part 11 / QA plan §9).
 *
 * Catches the "white screen / broken page / crashed component / lost auth" class of bugs
 * across every key authenticated route — the cheapest way to know a page still renders.
 * It does NOT assert deep flow behavior (those live in the backend integration suite and
 * the per-flow specs); it asserts: auth held (not bounced to /signin) + the page rendered
 * a heading (no error boundary, no blank body).
 *
 * Requires the stubbed stack (GOOGLE_AUTH_STUB on); Playwright auto-starts `npm run dev`.
 */

async function stubLogin(page: Page) {
  await page.goto("/signin");
  await page.getByRole("button", { name: /دخول تجريبي/ }).click();
  await page.waitForURL(/\/(onboarding\/mode|dashboard)/);
  if (page.url().includes("/onboarding/mode")) {
    await page.getByRole("button", { name: "أبحث عن عمل" }).click();
    await page.waitForURL(/\/dashboard/);
  }
}

// Routes any authenticated user can open regardless of mode (mode is a view-only preference).
const AUTHED_ROUTES = [
  "/dashboard",
  "/me/proposals",
  "/me/services",
  "/me/jobs",
  "/me/portfolio",
  "/contracts",
  "/wallet",
  "/notifications",
  "/messages",
  "/settings",
  "/jobs/new",
];

for (const route of AUTHED_ROUTES) {
  test(`authed page renders: ${route}`, async ({ page }) => {
    await stubLogin(page);
    await page.goto(route);

    // Auth must hold — a redirect to /signin means the session/guard is broken.
    await expect(page).not.toHaveURL(/\/signin/);
    expect(page.url()).toContain(route);

    // The page rendered real content (a heading), not a blank/error boundary.
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
  });
}
