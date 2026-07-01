import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * FULL platform business flow through the real browser UI, three isolated sessions
 * (employer + worker + admin). Auth is the REAL passwordless email-OTP login (no auth stub): the code
 * is read from the DB, where it is persisted in plaintext by design (admin-visible). Only the external
 * money/transport edges are stubbed for determinism — PayPal (PAYPAL_STUB), Firestore chat transport
 * (FIRESTORE_STUB) and FCM push (FCM_STUB) — because those need real third-party credentials + human
 * approval; all of the platform's own logic (escrow, ledger, commission, warranty, notifications,
 * status) runs for real. This is the single "does the whole product actually work end-to-end" run:
 * auth → create job → fund wallet → apply → accept (escrow held) → chat both ways → deliver →
 * approve (complete) → mutual reviews → warranty release (archive chat + freeze reviews) →
 * escrow→available → withdrawal → admin approval (Django admin) → notifications → wallet/ledger/
 * status-transition integrity.
 *
 * Every customer-facing step is a genuine click in the Next.js app (create job, apply, accept,
 * chat, deliver, approve, request withdrawal). The two steps with no affordance in the customer app
 * are driven exactly where they live:
 *   • withdrawal approval → a real click in the Django admin (third browser context),
 *   • the 60-day warranty release / chat archive → `manage.py release_warranties` (a browser can't
 *     wait 60 days) — the same seam the backend/lifecycle suites already use.
 * Only the PayPal deposit goes through the app's own charge/confirm endpoints (the PayPal-SDK button
 * on /wallet/charge isn't reliably clickable headlessly); everything else is UI.
 *
 * The baseline (two accounts + published worker + payout method + a category) is seeded once via
 * `manage.py seed_e2e`; the job/proposal/contract/withdrawal are all born from clicks here. Ids are
 * read back from the app (URL after redirect, /me/* API) rather than hardcoded, and money is asserted
 * from API responses (invariant worker_earning + commission == budget) so the run survives config
 * changes. Requires the running stack — locally `make up`, then `make e2e-full` (or `npm run e2e:full`).
 *
 * Under FIRESTORE_STUB chat runs over REST (8s poll); real-time push / read-receipts are Firestore-
 * only and intentionally NOT asserted here.
 */

// ── shared plumbing (inlined: this Node/Playwright combo can't import a local .ts module from a spec) ──
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const ADMIN_ORIGIN = process.env.PLAYWRIGHT_ADMIN_ORIGIN ?? "http://localhost:8000";
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** Shell into the backend container — the same seam CI + the lifecycle spec use for E2E data setup. */
function manage(cmd: string): string {
  return execSync(`docker compose exec -T backend python manage.py ${cmd}`, {
    cwd: REPO_ROOT, encoding: "utf8",
  });
}

/** Run a management command that prints one JSON line on stdout and parse it. */
function manageJson<T = Record<string, unknown>>(cmd: string): T {
  const out = manage(cmd);
  const line = out.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`\`${cmd}\` produced no JSON:\n${out}`);
  return JSON.parse(line) as T;
}

/**
 * REAL passwordless login through the UI: enter email → request a one-time code → read the freshly
 * issued code from the DB (it is persisted in plaintext, admin-visible by design) → type it → verify.
 * No auth stub. Returns the signed-in page plus the access token (read from localStorage, as the app
 * stores it) for the direct-API assertions later in the flow.
 */
async function otpLogin(context: BrowserContext, email: string): Promise<{ page: Page; access: string }> {
  const page = await context.newPage();
  await page.goto("/signin");

  // Request the code; retry through the 5/min-per-IP OTP request throttle (a rejected request stays on
  // the email step — the code input never appears — so re-request until a throttle slot frees).
  const codeInput = page.getByLabel("رمز الدخول");
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.getByLabel("البريد الإلكتروني").fill(email);
    await page.getByRole("button", { name: "إرسال رمز الدخول" }).click();
    try {
      await expect(codeInput).toBeVisible({ timeout: 8_000 });
      break;
    } catch {
      if (attempt === 4) throw new Error(`OTP request never advanced for ${email} (throttled?)`);
      await page.waitForTimeout(16_000); // wait out the throttle window, then re-request
    }
  }

  let code = "";
  await expect(() => {
    const out = manageJson<{ code: string | null }>(`get_login_code --email ${email}`);
    expect(out.code).toBeTruthy();
    code = out.code as string;
  }).toPass({ timeout: 10_000 });

  await codeInput.fill(code); // codes are case-sensitive — type verbatim
  await page.getByRole("button", { name: "تأكيد ودخول" }).click();
  // accounts have active_mode set (seed_e2e) → not first-login → lands on the dashboard
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });

  const access = await page.evaluate(() => localStorage.getItem("sh_access"));
  if (!access) throw new Error(`no access token in localStorage after OTP login for ${email}`);
  return { page, access };
}

/** Authed JSON request reusing an already-minted access token (no extra login round-trip). */
function apiReq(context: BrowserContext, access: string, method: "get" | "post", urlPath: string, data?: unknown) {
  return context.request[method](`${API}${urlPath}`, {
    headers: { Authorization: `Bearer ${access}` },
    data: data as Record<string, unknown> | undefined,
  });
}

/** Log a page into the Django admin via its real session-login form (CSRF handled by the form). */
async function adminLogin(page: Page, email = "admin@shoghlonline.com", password = "admin12345"): Promise<Page> {
  await page.goto(`${ADMIN_ORIGIN}/admin/login/?next=/admin/`, { waitUntil: "domcontentloaded" });
  await page.locator("#id_username").fill(email);
  await page.locator("#id_password").fill(password);
  await page.getByRole("button", { name: /log in|تسجيل/i }).click();
  await expect(page).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
  return page;
}

// A per-run marker keeps this run's job/messages unique so text assertions don't collide with rows
// left by earlier runs (the stack keeps its DB between runs). Must be ALL-ALPHABETIC — a long run of
// digits in a job title/description trips the contact-info (phone-number) moderation guard and diverts
// the post to admin review instead of auto-publishing. Map each timestamp digit to a letter.
const RUN = String(Date.now()).split("").map((d) => "abcdefghij"[Number(d)]).join("");

// Fresh accounts per run: the stack keeps its DB between runs, so reusing one account would accumulate
// wallet balances and break the absolute ledger assertions. A unique pair per run always starts at zero.
const EMPLOYER_EMAIL = `employer-${RUN}@e2e.test`;
const WORKER_EMAIL = `worker-${RUN}@e2e.test`;
const JOB_TITLE = `مشروع اختبار شامل ${RUN}`;
const JOB_DESC = "وصف تفصيلي وكامل لمتطلبات المشروع لأغراض اختبار التدفق الشامل من البداية حتى السحب.";
const PROPOSAL_DESC = `خطة تنفيذ مفصّلة للمشروع رقم ${RUN}: تحليل ثم تصميم ثم تطوير ثم تسليم.`;
const CHAT_FROM_WORKER = `رسالة من المستقل ${RUN}`;
const CHAT_FROM_EMPLOYER = `رد من العميل ${RUN}`;

// Money knobs — job budget wide enough to hold the proposal; deposit covers the escrow with room.
const JOB_BUDGET_MIN = "100";
const JOB_BUDGET_MAX = "300";
const PROPOSAL_BUDGET = "150";
const DEPOSIT = "500";
const COMMISSION_PCT = 10; // pinned by seed_e2e
const WORKER_EARNING = 135; // 150 − 10%
const EMPLOYER_AVAILABLE_AFTER = 350; // 500 deposit − 150 escrow

type Baseline = {
  employer_email: string; worker_email: string;
  employer_id: number; worker_id: number; category_slug: string;
};

test.describe.serial("full platform workflow (UI · employer + worker + admin)", () => {
  let employerCtx: BrowserContext;
  let workerCtx: BrowserContext;
  let adminCtx: BrowserContext;
  let employerPage: Page;
  let workerPage: Page;
  let adminPage: Page;
  let employerAccess: string;
  let workerAccess: string;

  // captured from the UI as the flow progresses
  let jobSlug: string;
  let jobId: number;
  let contractId: number;
  let conversationId: number;
  let withdrawalId: number;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000); // two real OTP logins may retry through the request throttle
    manageJson<Baseline>(`seed_e2e --employer ${EMPLOYER_EMAIL} --worker ${WORKER_EMAIL}`);

    employerCtx = await browser.newContext({ locale: "ar" });
    workerCtx = await browser.newContext({ locale: "ar" });
    adminCtx = await browser.newContext({ locale: "ar" });

    // real passwordless UI login (no auth stub) for both parties
    const emp = await otpLogin(employerCtx, EMPLOYER_EMAIL);
    const wk = await otpLogin(workerCtx, WORKER_EMAIL);
    employerPage = emp.page;
    workerPage = wk.page;
    employerAccess = emp.access;
    workerAccess = wk.access;
    // The contract actions (accept proposal, accept delivery) use native confirm() dialogs — always
    // accept them so the click goes through.
    employerPage.on("dialog", (d) => d.accept());
    workerPage.on("dialog", (d) => d.accept());

    adminPage = await adminCtx.newPage();
    await adminLogin(adminPage);
  });

  test.afterAll(async () => {
    await employerCtx?.close();
    await workerCtx?.close();
    await adminCtx?.close();
  });

  // 1 ─ everyone is authenticated (employer + worker in the app, admin in Django admin)
  test("1. all three parties are authenticated", async () => {
    await employerPage.goto("/wallet");
    await expect(employerPage.getByRole("heading", { name: "محفظتي" })).toBeVisible({ timeout: 15_000 });
    await workerPage.goto("/wallet");
    await expect(workerPage.getByRole("heading", { name: "محفظتي" })).toBeVisible({ timeout: 15_000 });
    expect(adminPage.url()).toMatch(/\/admin\/?$/);
  });

  // 2 ─ employer creates + publishes a job through the form
  test("2. employer creates and publishes a job", async () => {
    await employerPage.goto("/jobs/new");
    await employerPage.getByLabel(/عنوان الوظيفة/).fill(JOB_TITLE);
    await employerPage.getByLabel(/الفئة/).selectOption({ index: 1 }); // first real category
    await employerPage.getByLabel(/وصف الوظيفة/).fill(JOB_DESC);
    await employerPage.getByRole("textbox", { name: "الميزانية من USD" }).fill(JOB_BUDGET_MIN);
    await employerPage.getByRole("textbox", { name: "إلى USD" }).fill(JOB_BUDGET_MAX);
    await employerPage.getByRole("button", { name: "تأكيد الفئة ونشر الوظيفة" }).click();

    await expect(employerPage.getByRole("heading", { name: /تم النشر بنجاح/ })).toBeVisible({ timeout: 15_000 });
    // the success screen auto-redirects to the live public job page after ~1.6s
    await employerPage.waitForURL(/\/jobs\/(?!new$)[^/]+$/, { timeout: 15_000 });
    jobSlug = decodeURIComponent(new URL(employerPage.url()).pathname.split("/jobs/")[1]);
    await expect(employerPage.getByRole("heading", { name: JOB_TITLE })).toBeVisible({ timeout: 15_000 });

    // resolve the numeric id for the employer's proposals screen later
    const job = await (await apiReq(employerCtx, employerAccess, "get", `/jobs/${encodeURIComponent(jobSlug)}`)).json();
    jobId = job.id;
    expect(jobId).toBeGreaterThan(0);
  });

  // 3 ─ employer funds the wallet (charge + confirm through the app; asserted in the wallet UI)
  test("3. employer funds the wallet", async () => {
    const charge = await apiReq(employerCtx, employerAccess, "post", "/wallet/charge", { amount: DEPOSIT });
    expect(charge.status(), await charge.text()).toBe(201);
    const order = await charge.json();
    const confirm = await apiReq(employerCtx, employerAccess, "post", "/wallet/charge/confirm", { order_id: order.order_id });
    expect(confirm.ok(), await confirm.text()).toBeTruthy();

    await employerPage.goto("/wallet");
    await expect(employerPage.getByText("الرصيد المتاح (القابل للسحب)")).toBeVisible({ timeout: 15_000 });
    await expect(employerPage.getByText(/500\.00/).first()).toBeVisible();
    await expect(employerPage.getByText("إيداع PayPal").first()).toBeVisible(); // deposit ledger row
  });

  // 4 ─ worker applies to the job through the proposal form
  test("4. worker applies to the job", async () => {
    await workerPage.goto(`/jobs/${encodeURIComponent(jobSlug)}`);
    await workerPage.getByLabel(/قيمة العرض/).fill(PROPOSAL_BUDGET);
    await workerPage.getByLabel(/مدة التسليم/).fill("10");
    await workerPage.getByLabel(/تفاصيل العرض/).fill(PROPOSAL_DESC);
    await workerPage.getByRole("button", { name: /إرسال العرض/ }).click();
    await expect(workerPage.getByText("تم إرسال عرضك بنجاح")).toBeVisible({ timeout: 15_000 });

    await workerPage.goto("/me/proposals");
    await expect(workerPage.getByText(JOB_TITLE).first()).toBeVisible({ timeout: 15_000 });
  });

  // 5 ─ employer accepts the proposal → a contract is created + auto-funded (escrow held)
  test("5. employer accepts the proposal and escrow is held", async () => {
    await employerPage.goto(`/me/jobs/${jobId}/proposals`);
    await expect(employerPage.getByText(PROPOSAL_DESC).first()).toBeVisible({ timeout: 15_000 });
    await employerPage.getByRole("button", { name: "قبول" }).click(); // confirm() auto-accepted

    // The accept creates the contract server-side (and auto-funds it); the client then redirects, but
    // that redirect can lag. Resolve the id from the API instead — a fresh employer has exactly one
    // contract — so this step never depends on navigation timing.
    await expect(async () => {
      const list = await (await apiReq(employerCtx, employerAccess, "get", "/me/contracts")).json();
      const rows = list.results ?? list;
      expect(rows.length).toBeGreaterThan(0);
      contractId = rows[0].id;
    }).toPass({ timeout: 20_000 });
    await employerPage.goto(`/contracts/${contractId}`);

    // funded automatically because the wallet already has the deposit; if not, fund from the UI.
    const fundBtn = employerPage.getByRole("button", { name: "تمويل وتفعيل العقد" });
    if (await fundBtn.isVisible().catch(() => false)) await fundBtn.click();
    await expect(employerPage.getByText("نشط", { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // escrow shows in the wallet as budget held (as employer)
    await employerPage.goto("/wallet");
    await expect(employerPage.getByText("محجوز ضمان (كصاحب عمل)")).toBeVisible({ timeout: 15_000 });
    await expect(employerPage.getByText(/150\.00/).first()).toBeVisible();

    // escrow/fund-holding behaviour, precisely (API): the budget moved employer available → escrow,
    // and nothing has reached the worker yet.
    const ew = await (await apiReq(employerCtx, employerAccess, "get", "/me/wallet")).json();
    expect(Number(ew.available)).toBeCloseTo(EMPLOYER_AVAILABLE_AFTER, 2); // 500 − 150
    expect(Number(ew.escrow_held)).toBeCloseTo(Number(PROPOSAL_BUDGET), 2); // 150 held
    const ww = await (await apiReq(workerCtx, workerAccess, "get", "/me/wallet")).json();
    expect(Number(ww.available)).toBeCloseTo(0, 2);
    expect(Number(ww.earnings_pending)).toBeCloseTo(0, 2);
  });

  // 6 ─ both parties open the auto-created conversation and chat both directions
  test("6. chat round-trips both directions through the composer", async () => {
    await employerPage.goto(`/contracts/${contractId}`);
    await employerPage.getByRole("button", { name: /محادثة الطرف الآخر/ }).click();
    // the conversation was auto-opened when the contract funded; resolve its id from the API rather
    // than the (lag-prone) client redirect. A fresh employer has exactly one conversation.
    await expect(async () => {
      const convs = await (await apiReq(employerCtx, employerAccess, "get", "/me/conversations")).json();
      const rows = convs.results ?? convs;
      expect(rows.length).toBeGreaterThan(0);
      conversationId = rows[0].id;
    }).toPass({ timeout: 20_000 });

    const convUrl = `/messages/${conversationId}`;
    const bubble = (page: Page, text: string) => page.locator("p", { hasText: text }).first();
    const openThread = (page: Page) => page.goto(convUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });

    const openAndSend = async (page: Page, text: string) => {
      await openThread(page);
      const input = page.getByPlaceholder("اكتب رسالتك..");
      await expect(input).toBeVisible({ timeout: 15_000 });
      await input.fill(text);
      await page.getByRole("button", { name: "إرسال" }).click();
      await expect(bubble(page, text)).toBeVisible({ timeout: 10_000 });
    };
    // re-open (each open re-fetches over REST) until the incoming bubble appears — the per-attempt
    // 9s wait covers the page's 8s background poll.
    const expectIncoming = async (page: Page, text: string) => {
      for (let attempt = 0; attempt < 4; attempt++) {
        await openThread(page);
        try {
          await expect(bubble(page, text)).toBeVisible({ timeout: 9_000 });
          return;
        } catch { /* retry with a fresh fetch */ }
      }
      await expect(bubble(page, text)).toBeVisible({ timeout: 9_000 });
    };

    await openAndSend(workerPage, CHAT_FROM_WORKER); // worker → employer
    await expectIncoming(employerPage, CHAT_FROM_WORKER);
    await openAndSend(employerPage, CHAT_FROM_EMPLOYER); // employer → worker
    await expectIncoming(workerPage, CHAT_FROM_EMPLOYER);
  });

  // 7 ─ worker delivers the work
  test("7. worker delivers the work", async () => {
    await workerPage.goto(`/contracts/${contractId}`);
    const notes = workerPage.getByPlaceholder("ملاحظات التسليم (روابط الملفات، شرح، إلخ)");
    await expect(notes).toBeVisible({ timeout: 15_000 });
    await notes.fill("تم تسليم العمل كاملًا مع جميع المخرجات المطلوبة.");
    await workerPage.getByRole("button", { name: "إرسال التسليم" }).click();
    await expect(workerPage.getByText(/أُرسل التسليم/)).toBeVisible({ timeout: 15_000 });
  });

  // 8 ─ employer approves the delivery → contract completes, warranty starts
  test("8. employer approves the delivery and the contract completes", async () => {
    await employerPage.goto(`/contracts/${contractId}`);
    await employerPage.getByRole("button", { name: /قبول التسليم/ }).click(); // confirm() auto-accepted
    await expect(employerPage.getByText(/قُبل التسليم/).first()).toBeVisible({ timeout: 15_000 });
    await expect(employerPage.getByText("مكتمل", { exact: false }).first()).toBeVisible({ timeout: 15_000 });

    // BR-24 invariant, read from the API: budget splits with no remainder
    const c = await (await apiReq(employerCtx, employerAccess, "get", `/contracts/${contractId}`)).json();
    expect(Number(c.commission_pct)).toBe(COMMISSION_PCT);
    expect(Number(c.worker_earning) + Number(c.commission_amount)).toBeCloseTo(Number(c.budget), 2);
    expect(Number(c.worker_earning)).toBeCloseTo(WORKER_EARNING, 2);
  });

  // 9 ─ both parties leave a mutual review (allowed after completion, before the warranty lock)
  test("9. both parties leave reviews", async () => {
    const leaveReview = async (page: Page, comment: string) => {
      await page.goto(`/contracts/${contractId}`);
      const section = page.locator("section", { hasText: "التقييمات" });
      await expect(section).toBeVisible({ timeout: 15_000 });
      // the picker is the LAST "5 نجوم" control (any already-shown review renders disabled display stars first)
      await section.getByRole("button", { name: "5 نجوم" }).last().click();
      await section.getByPlaceholder("شارك تجربتك مع الطرف الآخر…").fill(comment);
      await section.getByRole("button", { name: /إرسال التقييم|تحديث التقييم/ }).click();
      await expect(page.getByText("شكرًا لتقييمك")).toBeVisible({ timeout: 15_000 });
    };
    await leaveReview(employerPage, "عمل ممتاز وتسليم في الموعد.");
    await leaveReview(workerPage, "تعامل راقٍ ومتطلبات واضحة.");

    // both reviews now persist on the contract (mutual, one per party — FR-REV-1)
    const reviews = await (await apiReq(employerCtx, employerAccess, "get", `/contracts/${contractId}/reviews`)).json();
    expect(reviews.length).toBe(2);
  });

  // 10 ─ warranty release archives (locks) the conversation to read-only + freezes the reviews
  test("10. warranty release archives the conversation and freezes reviews", async () => {
    manage(`release_warranties --contract ${contractId}`);
    await workerPage.goto(`/messages/${conversationId}`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await expect(workerPage.getByText("هذه المحادثة للقراءة فقط", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(workerPage.getByPlaceholder("اكتب رسالتك..")).toHaveCount(0); // composer gone

    // reviews are frozen at warranty end (BR-13)
    const reviews = await (await apiReq(workerCtx, workerAccess, "get", `/contracts/${contractId}/reviews`)).json();
    expect(reviews.length).toBeGreaterThan(0);
    expect(reviews.every((r: { is_locked: boolean }) => r.is_locked)).toBeTruthy();
  });

  // 11 ─ released escrow lands in the worker's available balance (earnings_pending → available)
  test("11. escrow releases into the worker's available balance", async () => {
    await workerPage.goto("/wallet");
    await expect(workerPage.getByText("الرصيد المتاح (القابل للسحب)")).toBeVisible({ timeout: 15_000 });
    await expect(workerPage.getByText(/135\.00/).first()).toBeVisible();

    const w = await (await apiReq(workerCtx, workerAccess, "get", "/me/wallet")).json();
    expect(Number(w.available)).toBeCloseTo(WORKER_EARNING, 2);
    expect(Number(w.earnings_pending)).toBeCloseTo(0, 2);
  });

  // 12 ─ worker requests a withdrawal (instant hold on available)
  test("12. worker requests a withdrawal", async () => {
    await workerPage.goto("/wallet");
    await workerPage.getByLabel(/وسيلة الاستلام/).selectOption({ index: 1 }); // the seeded PayPal method
    await workerPage.getByPlaceholder("المبلغ").fill(String(WORKER_EARNING));
    await workerPage.getByRole("button", { name: "طلب سحب" }).click();
    await expect(workerPage.getByText(/سُجّل طلب السحب/)).toBeVisible({ timeout: 15_000 });
    await expect(workerPage.getByText(/بانتظار المعالجة/).first()).toBeVisible({ timeout: 15_000 });

    const rows = await (await apiReq(workerCtx, workerAccess, "get", "/me/withdrawals")).json();
    withdrawalId = rows[0].id; // newest first
    expect(rows[0].status).toBe("requested");

    // available drops to 0 (held)
    const w = await (await apiReq(workerCtx, workerAccess, "get", "/me/wallet")).json();
    expect(Number(w.available)).toBeCloseTo(0, 2);
  });

  // 13 ─ admin approves + processes the withdrawal via the Django admin action
  test("13. admin marks the withdrawal paid in Django admin", async () => {
    await adminPage.goto(
      `${ADMIN_ORIGIN}/admin/payments/withdrawalrequest/?q=${encodeURIComponent(WORKER_EMAIL)}`,
      { waitUntil: "domcontentloaded" },
    );
    await adminPage.locator(`input[name="_selected_action"][value="${withdrawalId}"]`).check();
    await adminPage.locator('select[name="action"]').selectOption("mark_paid");
    await adminPage
      .locator('button[name="index"], input[name="index"], #changelist-form button[type="submit"]')
      .first()
      .click();

    // status flips to PAID (assert via API + the worker's wallet UI)
    await expect(async () => {
      const rows = await (await apiReq(workerCtx, workerAccess, "get", "/me/withdrawals")).json();
      const row = rows.find((r: { id: number }) => r.id === withdrawalId);
      expect(row.status).toBe("paid");
    }).toPass({ timeout: 15_000 });

    await workerPage.goto("/wallet");
    await expect(workerPage.getByText("سُدّد السحب").first()).toBeVisible({ timeout: 15_000 }); // paid ledger row
  });

  // 14 ─ notifications were generated + received by BOTH parties at every milestone (in-app)
  test("14. notifications are generated and received", async () => {
    type Note = { kind: string; title: string };
    const employerNotes: Note[] = (await (await apiReq(employerCtx, employerAccess, "get", "/me/notifications")).json()).results;
    const workerNotes: Note[] = (await (await apiReq(workerCtx, workerAccess, "get", "/me/notifications")).json()).results;
    const has = (notes: Note[], title: string) => notes.some((n) => (n.title ?? "").includes(title));

    // both parties are notified at every contract milestone (notify_both, kind=contract)
    for (const notes of [employerNotes, workerNotes]) {
      expect(has(notes, "تم تمويل العقد")).toBeTruthy();     // funded / active
      expect(has(notes, "تم تسليم العمل")).toBeTruthy();      // delivered
      expect(has(notes, "قُبل التسليم")).toBeTruthy();         // accepted
      expect(has(notes, "حُرّرت أرباح العقد")).toBeTruthy();   // warranty release
    }
    // the worker additionally gets the withdrawal-paid payment notification
    expect(workerNotes.some((n) => n.kind === "payment" && n.title.includes("تم تنفيذ طلب السحب"))).toBeTruthy();

    // and they render in the worker's notifications UI
    await workerPage.goto("/notifications");
    await expect(workerPage.getByRole("heading", { name: "الإشعارات" })).toBeVisible({ timeout: 15_000 });
    await expect(workerPage.getByText("لا إشعارات بعد")).toHaveCount(0);
    await expect(workerPage.getByText("تم تنفيذ طلب السحب").first()).toBeVisible({ timeout: 15_000 });
  });

  // 15 ─ final consolidated wallet / ledger / status-transition integrity
  test("15. wallet balances, ledger records and status transitions are consistent", async () => {
    // employer wallet: deposit 500, 150 held then released on acceptance → 350 available, 0 escrow
    const ew = await (await apiReq(employerCtx, employerAccess, "get", "/me/wallet")).json();
    expect(Number(ew.escrow_held)).toBeCloseTo(0, 2);
    expect(Number(ew.available)).toBeCloseTo(EMPLOYER_AVAILABLE_AFTER, 2);

    // worker wallet: earned 135, withdrew 135 → 0 available, 0 pending
    const ww = await (await apiReq(workerCtx, workerAccess, "get", "/me/wallet")).json();
    expect(Number(ww.available)).toBeCloseTo(0, 2);
    expect(Number(ww.earnings_pending)).toBeCloseTo(0, 2);

    // transaction records: the expected double-entry ledger rows exist on each side
    const ledgerTypes = async (ctx: BrowserContext, access: string) =>
      new Set(((await (await apiReq(ctx, access, "get", "/me/transactions")).json()).results as { type: string }[]).map((t) => t.type));
    const empTypes = await ledgerTypes(employerCtx, employerAccess);
    for (const t of ["deposit", "contract_hold"]) expect(empTypes).toContain(t);
    const wkTypes = await ledgerTypes(workerCtx, workerAccess);
    for (const t of ["earning", "contract_release", "withdrawal_hold", "withdrawal_paid"]) expect(wkTypes).toContain(t);

    // status transitions land where they should, end-to-end
    const contract = await (await apiReq(employerCtx, employerAccess, "get", `/contracts/${contractId}`)).json();
    expect(contract.status).toBe("completed");
    const job = await (await apiReq(employerCtx, employerAccess, "get", `/me/jobs/${jobId}`)).json();
    expect(job.status).toBe("completed");
    const proposals = (await (await apiReq(workerCtx, workerAccess, "get", "/me/proposals")).json()).results;
    expect(proposals.some((p: { status: string }) => p.status === "accepted")).toBeTruthy();
    const withdrawals = await (await apiReq(workerCtx, workerAccess, "get", "/me/withdrawals")).json();
    expect(withdrawals.find((w: { id: number }) => w.id === withdrawalId)?.status).toBe("paid");
  });
});
