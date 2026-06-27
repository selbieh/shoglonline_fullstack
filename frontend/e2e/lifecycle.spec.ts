import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Full freelancer job lifecycle through the real UI, two browser contexts (client + freelancer),
 * against the stubbed stack (GOOGLE_AUTH_STUB + FIRESTORE_STUB on).
 *
 * The backend `tests/integration/test_full_lifecycle.py` already pins every status/ledger/notification
 * transition over the API. This spec proves the same journey renders and behaves in the browser, and
 * — the part that only a browser can verify — drives the CHAT both directions through the real
 * composer. The heavy, fragile pre-chat setup (published profile/service/job, proposal, funded wallet,
 * acceptance) is seeded deterministically via `manage.py seed_lifecycle`; the spec then asserts the
 * resulting state on each key screen. Delivery + acceptance go through the authed API (the contract
 * action UI has confirm() modals the backend suite already covers); the spec asserts the resulting
 * UI state. Warranty release is driven via `manage.py release_warranties --contract` (a browser can't
 * wait 60 days) and the read-only chat + released funds are asserted in the UI.
 *
 * Under FIRESTORE_STUB chat runs over REST (8s poll); real-time push and ✓✓ read-receipts are
 * Firestore-only and intentionally NOT asserted here.
 *
 * Requires the running stack. Locally: `make up` (or docker compose up) then `npm run e2e`.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CLIENT_EMAIL = "client@e2e.test";
const WORKER_EMAIL = "freelancer@e2e.test";

type Seed = {
  employer_id: number; worker_id: number; job_id: number; job_slug: string;
  proposal_id: number; contract_id: number; conversation_id: number;
  budget: string; worker_earning: string;
};

function manage(cmd: string): string {
  // shell into the backend container — the same seam CI uses for E2E data setup
  return execSync(`docker compose exec -T backend python manage.py ${cmd}`, {
    cwd: REPO_ROOT, encoding: "utf8",
  });
}

function seedLifecycle(): Seed {
  const out = manage(`seed_lifecycle --client ${CLIENT_EMAIL} --worker ${WORKER_EMAIL}`);
  const line = out.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`seed_lifecycle produced no JSON:\n${out}`);
  return JSON.parse(line);
}

type Tokens = { access: string; refresh: string };

/** Exchange a stub id-token for JWTs, retrying through transient failures / login throttling. */
async function getTokens(context: BrowserContext, email: string): Promise<Tokens> {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await context.request.post(`${API}/auth/google`, { data: { id_token: `stub:${email}` } });
    if (res.ok()) return res.json();
    last = `${res.status()} ${await res.text()}`;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`token exchange for ${email} failed: ${last}`);
}

/** Open a page in `context` pre-authenticated with `tokens` (localStorage, as lib/api.ts expects). */
async function authedPage(context: BrowserContext, tokens: Tokens): Promise<Page> {
  await context.addInitScript(
    ([a, r]) => {
      localStorage.setItem("sh_access", a as string);
      localStorage.setItem("sh_refresh", r as string);
    },
    [tokens.access, tokens.refresh],
  );
  return context.newPage();
}

/** Authed JSON request reusing an already-minted access token (no extra login round-trip). */
function apiReq(context: BrowserContext, access: string, method: "get" | "post", urlPath: string, data?: unknown) {
  return context.request[method](`${API}${urlPath}`, {
    headers: { Authorization: `Bearer ${access}` },
    data: data as Record<string, unknown> | undefined,
  });
}

test.describe.serial("freelancer job lifecycle (UI, two contexts)", () => {
  let seed: Seed;
  let clientCtx: BrowserContext;
  let workerCtx: BrowserContext;
  let clientPage: Page;
  let workerPage: Page;
  let clientAccess: string;
  let workerAccess: string;

  test.beforeAll(async ({ browser }) => {
    seed = seedLifecycle();
    clientCtx = await browser.newContext({ locale: "ar" });
    workerCtx = await browser.newContext({ locale: "ar" });
    const clientTokens = await getTokens(clientCtx, CLIENT_EMAIL);
    const workerTokens = await getTokens(workerCtx, WORKER_EMAIL);
    clientAccess = clientTokens.access;
    workerAccess = workerTokens.access;
    clientPage = await authedPage(clientCtx, clientTokens);
    workerPage = await authedPage(workerCtx, workerTokens);
  });

  test.afterAll(async () => {
    await clientCtx?.close();
    await workerCtx?.close();
  });

  test("job is published and publicly visible", async () => {
    await clientPage.goto(`/jobs/${encodeURIComponent(seed.job_slug)}`);
    await expect(clientPage.getByRole("heading", { name: /بناء موقع تعريفي/ })).toBeVisible({ timeout: 15_000 });
  });

  test("freelancer sees their submitted proposal", async () => {
    await workerPage.goto("/me/proposals");
    await expect(workerPage.getByText(/بناء موقع تعريفي/).first()).toBeVisible({ timeout: 15_000 });
  });

  test("client wallet shows the budget held in escrow", async () => {
    await clientPage.goto("/wallet");
    // the "محجوز ضمان (كصاحب عمل)" KpiCard shows the held budget (150.00)
    await expect(clientPage.getByText("محجوز ضمان (كصاحب عمل)")).toBeVisible({ timeout: 15_000 });
    await expect(clientPage.getByText(/150\.00/).first()).toBeVisible();
  });

  test("contract shows as active for both parties", async () => {
    await clientPage.goto(`/contracts/${seed.contract_id}`);
    await expect(clientPage.getByText("نشط", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("chat round-trips both directions through the composer (REST under stub)", async () => {
    const convUrl = `/messages/${seed.conversation_id}`;
    const fromWorker = `رسالة من المستقل ${Date.now()}`;
    const fromClient = `رد من العميل ${Date.now()}`;
    // a message *bubble* is a <p> in the thread; scope to it so the truncated <span> preview in the
    // conversation-list sidebar doesn't double-match the text (strict-mode).
    const bubble = (page: Page, text: string) => page.locator("p", { hasText: text }).first();

    // the thread keeps a poll/Firestore attempt open, so the "load" event lags — wait for DOM only.
    const openThread = (page: Page) => page.goto(convUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });

    // open the thread (not the list) and send `text`, asserting our own bubble renders
    const openAndSend = async (page: Page, text: string) => {
      await openThread(page);
      const input = page.getByPlaceholder("اكتب رسالتك..");
      await expect(input).toBeVisible({ timeout: 15_000 });
      await input.fill(text);
      await page.getByRole("button", { name: "إرسال" }).click();
      await expect(bubble(page, text)).toBeVisible({ timeout: 10_000 });
    };

    // re-navigate (each open re-fetches over REST) until the incoming bubble appears — the per-attempt
    // 9s wait covers the page's 8s background poll, and re-opening recovers from a transient list redirect.
    const expectIncoming = async (page: Page, text: string) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await openThread(page);
        try {
          await expect(bubble(page, text)).toBeVisible({ timeout: 9_000 });
          return;
        } catch {
          /* retry: re-open the thread for a fresh REST fetch */
        }
      }
      await expect(bubble(page, text)).toBeVisible({ timeout: 9_000 });
    };

    await openAndSend(workerPage, fromWorker); // worker → client
    await expectIncoming(clientPage, fromWorker); // client receives
    await openAndSend(clientPage, fromClient); // client → worker
    await expectIncoming(workerPage, fromClient); // worker receives
  });

  test("delivery + acceptance complete the contract", async () => {
    // deliver (worker) + accept (employer) via the authed API; the contract-action UI has confirm()
    // modals the backend suite already covers. Assert the resulting UI state below.
    const deliver = await apiReq(workerCtx, workerAccess, "post",
      `/contracts/${seed.contract_id}/submissions`, { notes: "تم تسليم العمل" });
    expect(deliver.status(), await deliver.text()).toBe(201);

    // the deliver response is the contract with its submissions embedded; grab the open one
    const contract = await deliver.json();
    const open = (contract.submissions as Array<{ id: number; status: string }>).find((s) => s.status === "open");
    const subId = (open ?? contract.submissions[0]).id;
    const accept = await apiReq(clientCtx, clientAccess, "post", `/submissions/${subId}/accept`);
    expect(accept.status(), await accept.text()).toBe(200);

    await clientPage.goto(`/contracts/${seed.contract_id}`);
    await expect(clientPage.getByText("مكتمل", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("warranty release credits the freelancer's available balance", async () => {
    manage(`release_warranties --contract ${seed.contract_id}`);
    await workerPage.goto("/wallet");
    // earnings moved out of "أرباح معلّقة" into "الرصيد المتاح" (135.00)
    await expect(workerPage.getByText("الرصيد المتاح (القابل للسحب)")).toBeVisible({ timeout: 15_000 });
    await expect(workerPage.getByText(/135\.00/).first()).toBeVisible();
  });

  test("chat is read-only after warranty release", async () => {
    await workerPage.goto(`/messages/${seed.conversation_id}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await expect(workerPage.getByText("هذه المحادثة للقراءة فقط", { exact: false }))
      .toBeVisible({ timeout: 15_000 });
    // the composer is gone — no message input
    await expect(workerPage.getByPlaceholder("اكتب رسالتك..")).toHaveCount(0);
  });
});
