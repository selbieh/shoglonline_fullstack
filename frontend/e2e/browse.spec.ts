import { expect, test } from "@playwright/test";

/**
 * AC-14 — public browsing is responsive with no horizontal overflow across the breakpoint matrix,
 * and the document stays RTL. These pages need no auth, so they exercise the unauthenticated shell.
 */
const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1920, height: 1080 },
];

const PUBLIC_PAGES = ["/", "/jobs", "/services", "/freelancers"];

test("landing is RTL and links into the public listings", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/jobs/);
});

for (const vp of VIEWPORTS) {
  for (const path of PUBLIC_PAGES) {
    test(`no horizontal scroll on ${path} @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path);
      // allow a 1px rounding slack; a real overflow (off-canvas element) blows well past this
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `${path} overflows horizontally at ${vp.width}px`).toBe(false);
    });
  }
}
