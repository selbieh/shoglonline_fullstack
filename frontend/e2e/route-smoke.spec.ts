import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Route smoke crawl (QA plan §9) — the "renders but is actually broken" catcher.
 *
 * browse.spec covers responsiveness and authed-smoke covers "a heading rendered", but neither
 * notices a page that throws an uncaught exception, trips the error boundary, or 500s the
 * document — the exact class of bug QA files as "white screen / console is full of red". This
 * crawl loads every public route and fails on:
 *   • an uncaught runtime exception (`pageerror`),
 *   • the Next error overlay / a rendered error boundary,
 *   • a 5xx for the document itself.
 *
 * Console errors are noisy on a dev server (React dev warnings, stubbed third-party beacons), so
 * by default they're reported as annotations, not failures. Set STRICT_CONSOLE=1 to promote any
 * non-allow-listed console error to a failure (mirrors the backend preflight `--strict` gate).
 *
 * Public-only: no login needed, so it never depends on the auth stub. A route that redirects to
 * /signin is fine — this asserts "did not crash", not "auth held" (that's authed-smoke's job).
 */

const PUBLIC_ROUTES = [
  "/",
  "/jobs",
  "/services",
  "/freelancers",
  "/gallery",
  "/support",
  "/signin",
  "/subscriptions",
];

// Console noise that is NOT an app bug: dev-only React warnings, and stubbed/absent third parties
// (Firebase, PayPal, GA, favicon) whose beacons legitimately fail in the E2E environment.
const BENIGN_CONSOLE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /Warning: .*(hydrat|did not match)/i, // dev hydration notices — reported, not failed here
  /favicon\.ico/i,
  /firebase|firestore|installations/i,
  /paypal/i,
  /google-analytics|googletagmanager|gtag/i,
  /net::ERR_|Failed to load resource/i, // stubbed-backend optional endpoints
];

const strict = process.env.STRICT_CONSOLE === "1";

function isRealConsoleError(msg: ConsoleMessage): boolean {
  if (msg.type() !== "error") return false;
  const text = msg.text();
  return !BENIGN_CONSOLE.some((re) => re.test(text));
}

async function assertNoErrorBoundary(page: Page, route: string) {
  // Next's dev error overlay lives in a <nextjs-portal>; the prod default boundary prints this copy.
  const overlay = page.locator("nextjs-portal");
  if (await overlay.count()) {
    expect(await overlay.first().isVisible(), `${route}: Next error overlay is showing`).toBe(false);
  }
  const body = (await page.locator("body").innerText()).slice(0, 4000);
  expect(body, `${route}: rendered a client error boundary`).not.toMatch(
    /Unhandled Runtime Error|Application error: a client-side exception/i,
  );
}

for (const route of PUBLIC_ROUTES) {
  test(`route smoke: ${route}`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(`${err.name}: ${err.message}`));
    page.on("console", (msg) => {
      if (isRealConsoleError(msg)) consoleErrors.push(msg.text());
    });

    const resp = await page.goto(route, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined); // let late chunks/XHRs settle

    // The document itself must not be a server error.
    const status = resp?.status() ?? 0;
    expect(status, `${route}: document HTTP ${status}`).toBeLessThan(500);

    // Uncaught runtime exceptions are always real bugs.
    expect(pageErrors, `${route}: uncaught exception(s)\n${pageErrors.join("\n")}`).toEqual([]);

    await assertNoErrorBoundary(page, route);

    if (consoleErrors.length) {
      testInfo.annotations.push({ type: "console-error", description: `${route}: ${consoleErrors.join(" | ")}` });
    }
    if (strict) {
      expect(consoleErrors, `${route}: console errors (STRICT_CONSOLE)\n${consoleErrors.join("\n")}`).toEqual([]);
    }
  });
}
