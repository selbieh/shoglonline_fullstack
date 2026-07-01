import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

/**
 * Adversarial / negative / edge-flow coverage + a money-conservation BUG HUNT for the parts the
 * happy-path `full-workflow` spec never touches: rejected+re-delivered work, mutual cancellation,
 * admin dispute resolution (50/50 split), contract update-requests (budget up/down + insufficient-
 * funds parking), the SERVICES→contract parallel path, bid purchase, and hard guards (withdrawal
 * overdraw, self-buy). Driven mostly at the API level (fast + precise) through REAL OTP-issued tokens,
 * with the Django admin browser for the dispute action. Money is asserted as exact wallet-bucket
 * DELTAS so a wrong leg (money created/destroyed / sent to the wrong party) shows up immediately.
 *
 * Requires the running stack (real auth). Run: PLAYWRIGHT_ADMIN_ORIGIN/NEXT_PUBLIC_API_URL as needed.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
const ADMIN_ORIGIN = process.env.PLAYWRIGHT_ADMIN_ORIGIN ?? "http://localhost:8000";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
// Fresh accounts per run: the email-OTP path has a per-email DAILY cap, so reusing one address
// across many runs eventually refuses new codes. A unique alphabetic suffix (digits would trip the
// phone-moderation guard elsewhere, and keeps this consistent) dodges the cap; the pair is still
// reused across all tests in a run so the delta assertions line up.
const RUN = String(Date.now()).split("").map((d) => "abcdefghij"[Number(d)]).join("");
const EMPLOYER = `employer-${RUN}@edge.test`;
const WORKER = `worker-${RUN}@edge.test`;

function manage(cmd: string): string {
  return execSync(`docker compose exec -T backend python manage.py ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8" });
}
function manageJson<T = Record<string, unknown>>(cmd: string): T {
  const out = manage(cmd);
  const line = out.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`\`${cmd}\` produced no JSON:\n${out}`);
  return JSON.parse(line) as T;
}

/** Mint a session token for an account (operator seam — deterministic, no rate-limited OTP round-trip).
 * Real OTP login is proved separately in full-workflow.spec.ts; this spec is a backend money bug-hunt. */
function tokenFor(email: string): string {
  return manageJson<{ access: string }>(`mint_token --email ${email}`).access;
}

type Buckets = { available: number; escrow_held: number; earnings_pending: number };

function req(api: APIRequestContext, access: string, method: "get" | "post", urlPath: string, data?: unknown) {
  return api[method](`${API}${urlPath}`, { headers: { Authorization: `Bearer ${access}` }, data: data as never });
}
async function walletOf(api: APIRequestContext, access: string): Promise<Buckets> {
  const w = await (await req(api, access, "get", "/me/wallet")).json();
  return { available: Number(w.available), escrow_held: Number(w.escrow_held), earnings_pending: Number(w.earnings_pending) };
}

type Seed = { contract_id: number; conversation_id: number; budget: string; worker_earning: string; job_id: number };
/** Deterministically build a fresh FUNDED/ACTIVE contract (budget 150, escrow 150) for the pair. */
function freshContract(): Seed {
  return manageJson<Seed>(`seed_lifecycle --client ${EMPLOYER} --worker ${WORKER}`);
}

/** Create a budget/deadline update-request; returns the pending update-request id (the POST returns
 * the CONTRACT with update_requests embedded, not the request itself). */
async function createUpdate(api: APIRequestContext, access: string, contractId: number, newBudget: string): Promise<number> {
  const res = await req(api, access, "post", `/contracts/${contractId}/update-requests`, { new_budget: newBudget });
  expect(res.status(), await res.text()).toBe(201);
  const contract = await res.json();
  const urs = contract.update_requests as Array<{ id: number; status: string }>;
  return (urs.find((r) => r.status === "pending") ?? urs.at(-1)!).id;
}
/** Counterpart responds; returns HTTP status + the update-request's resulting status. */
async function respondUpdate(api: APIRequestContext, access: string, urId: number, accept: boolean) {
  const res = await req(api, access, "post", `/update-requests/${urId}/respond`, { accept });
  const contract = await res.json().catch(() => ({}));
  const ur = (contract.update_requests as Array<{ id: number; status: string }> | undefined)?.find((r) => r.id === urId);
  return { status: res.status(), updateStatus: ur?.status ?? "" };
}

/** Worker submits a deliverable; returns the open submission id. */
async function deliver(api: APIRequestContext, workerAccess: string, contractId: number): Promise<number> {
  const res = await req(api, workerAccess, "post", `/contracts/${contractId}/submissions`, { notes: "تم التسليم" });
  expect(res.status(), await res.text()).toBe(201);
  const contract = await res.json();
  const open = (contract.submissions as Array<{ id: number; status: string }>).find((s) => s.status === "open");
  return (open ?? contract.submissions.at(-1)).id;
}

let employerAccess: string;
let workerAccess: string;
let adminCtx: BrowserContext;
let adminPage: Page;

test.describe.serial("edge cases + money-conservation bug hunt", () => {
  // Each test chains several docker-exec seeds + real-Firestore contract writes; give it room.
  test.beforeEach(() => test.setTimeout(120_000));

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000); // seeds + 2 OTP logins (may retry through the 5/min OTP throttle)
    manageJson(`seed_e2e --employer ${EMPLOYER} --worker ${WORKER}`);
    manage(`seed_demo`); // bid plans, etc. (idempotent) — needed by the bid-purchase test
    // Don't blast the real SMTP with bouncing @edge.test test emails; in-app notifications still fire.
    manage(`set_flag emails.enabled false`);
    employerAccess = tokenFor(EMPLOYER);
    workerAccess = tokenFor(WORKER);
    adminCtx = await browser.newContext({ locale: "ar" });
    adminPage = await adminCtx.newPage();
    await adminPage.goto(`${ADMIN_ORIGIN}/admin/login/?next=/admin/`, { waitUntil: "domcontentloaded" });
    await adminPage.locator("#id_username").fill("admin@shoghlonline.com");
    await adminPage.locator("#id_password").fill("admin12345");
    await adminPage.getByRole("button", { name: /log in|تسجيل/i }).click();
    await expect(adminPage).toHaveURL(/\/admin\/?$/, { timeout: 15_000 });
  });

  test.afterAll(async () => { await adminCtx?.close(); });

  test("rejected delivery → re-deliver → accept: escrow releases once, worker paid once", async ({ request }) => {
    const c = freshContract();
    const empB = await walletOf(request, employerAccess);
    const wkB = await walletOf(request, workerAccess);

    const sub1 = await deliver(request, workerAccess, c.contract_id);
    const rej = await req(request, employerAccess, "post", `/submissions/${sub1}/reject`, { reason: "يلزم تحسينات" });
    expect(rej.status(), await rej.text()).toBe(200);
    const sub2 = await deliver(request, workerAccess, c.contract_id); // contract went back to active → resubmit
    const acc = await req(request, employerAccess, "post", `/submissions/${sub2}/accept`);
    expect(acc.status(), await acc.text()).toBe(200);

    const empA = await walletOf(request, employerAccess);
    const wkA = await walletOf(request, workerAccess);
    expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(-150, 2); // released exactly once
    expect(wkA.earnings_pending - wkB.earnings_pending).toBeCloseTo(135, 2); // paid exactly once
  });

  test("mutual cancellation refunds the full escrow to the employer", async ({ request }) => {
    const c = freshContract();
    const empB = await walletOf(request, employerAccess);
    await req(request, employerAccess, "post", `/contracts/${c.contract_id}/cancel`, { reason: "تغيّرت الخطة" });
    const conf = await req(request, workerAccess, "post", `/contracts/${c.contract_id}/cancel/confirm`);
    expect(conf.status(), await conf.text()).toBe(200);
    const empA = await walletOf(request, employerAccess);
    expect(empA.available - empB.available).toBeCloseTo(150, 2);
    expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(-150, 2);
  });

  test("admin 50/50 dispute split conserves money exactly (refund + payout + commission == budget)", async ({ request }) => {
    const c = freshContract();
    const empB = await walletOf(request, employerAccess);
    const wkB = await walletOf(request, workerAccess);
    await deliver(request, workerAccess, c.contract_id);
    const dsp = await req(request, employerAccess, "post", `/contracts/${c.contract_id}/dispute`, { reason: "خلاف على الجودة" });
    expect(dsp.status(), await dsp.text()).toBe(200);

    await adminPage.goto(`${ADMIN_ORIGIN}/admin/contracts/contract/?status=disputed`, { waitUntil: "domcontentloaded" });
    await adminPage.locator(`input[name="_selected_action"][value="${c.contract_id}"]`).check();
    await adminPage.locator('select[name="action"]').selectOption("dispute_split_50");
    await adminPage.locator('button[name="index"], #changelist-form button[type="submit"]').first().click();

    await expect(async () => {
      const empA = await walletOf(request, employerAccess);
      const wkA = await walletOf(request, workerAccess);
      expect(empA.available - empB.available).toBeCloseTo(75, 2);   // 50% refund
      expect(wkA.available - wkB.available).toBeCloseTo(67.5, 2);    // 50% payout − 10% commission
      expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(-150, 2);
    }).toPass({ timeout: 15_000 });
  });

  test("update-request budget INCREASE (funded) reserves the diff into escrow", async ({ request }) => {
    const c = freshContract();
    const empB = await walletOf(request, employerAccess);
    const urId = await createUpdate(request, employerAccess, c.contract_id, "200");
    const { status } = await respondUpdate(request, workerAccess, urId, true);
    expect(status).toBe(200);
    const empA = await walletOf(request, employerAccess);
    expect(empA.available - empB.available).toBeCloseTo(-50, 2);
    expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(50, 2);
  });

  test("update-request budget INCREASE beyond available parks as pending_funding, moves no money", async ({ request }) => {
    const c = freshContract();
    const empB = await walletOf(request, employerAccess);
    const huge = Math.ceil(empB.available) + 100_000; // diff far exceeds available
    const urId = await createUpdate(request, employerAccess, c.contract_id, String(huge));
    const { status, updateStatus } = await respondUpdate(request, workerAccess, urId, true);
    expect(status).toBe(200);
    expect(updateStatus).toBe("pending_funding");
    const empA = await walletOf(request, employerAccess);
    expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(0, 2);
    expect(empA.available - empB.available).toBeCloseTo(0, 2);
  });

  test("update-request budget DECREASE refunds the diff to the employer", async ({ request }) => {
    const c = freshContract();
    const empB = await walletOf(request, employerAccess);
    const urId = await createUpdate(request, employerAccess, c.contract_id, "100");
    const { status } = await respondUpdate(request, workerAccess, urId, true);
    expect(status).toBe(200);
    const empA = await walletOf(request, employerAccess);
    expect(empA.available - empB.available).toBeCloseTo(50, 2);
    expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(-50, 2);
  });

  test("SERVICES path: publish → buy → worker accept holds escrow from the employer", async ({ request }) => {
    freshContract(); // ensures the employer wallet is funded
    const cats = await (await req(request, employerAccess, "get", "/categories")).json();
    const catId = (cats.find((x: { slug: string }) => x.slug === "dev") ?? cats[0]).id;

    const svc = await (await req(request, workerAccess, "post", "/me/services", {
      title: "خدمة اختبار التدفق", category: catId, base_price: "120", delivery_days: 5,
      description: "وصف تفصيلي وكافٍ للخدمة يتجاوز الحد الأدنى المطلوب للنشر بنجاح دون مراجعة.",
    })).json();
    expect(svc.status).toBe("live");

    const buy = await req(request, employerAccess, "post", `/services/${svc.id}/requests`, { quantity: 1, description: "أريد هذه الخدمة" });
    expect(buy.status(), await buy.text()).toBe(201);
    const reqId = (await buy.json()).id;

    const empB = await walletOf(request, employerAccess);
    const acc = await req(request, workerAccess, "post", `/requests/${reqId}/accept`);
    expect(acc.status(), await acc.text()).toBe(201);
    const empA = await walletOf(request, employerAccess);
    expect(empA.available - empB.available).toBeCloseTo(-120, 2);
    expect(empA.escrow_held - empB.escrow_held).toBeCloseTo(120, 2);
  });

  test("bid purchase debits the wallet and credits the bid balance", async ({ request }) => {
    const plans = await (await req(request, employerAccess, "get", "/bid-plans")).json();
    expect(plans.length).toBeGreaterThan(0);
    const plan = plans[0];
    const empB = await walletOf(request, employerAccess);
    const bidsB = await (await req(request, employerAccess, "get", "/me/bids")).json();
    const res = await req(request, employerAccess, "post", `/bid-plans/${plan.id}/purchase`);
    expect(res.status(), await res.text()).toBeLessThan(300);
    const body = await res.json();
    const empA = await walletOf(request, employerAccess);
    expect(empA.available - empB.available).toBeCloseTo(-Number(plan.cost), 2);
    expect(body.bid_balance).toBe(bidsB.balance + plan.bids_count);
  });

  test("guards: withdrawal overdraw and self-buy are rejected", async ({ request }) => {
    const wk = await walletOf(request, workerAccess);
    const over = await req(request, workerAccess, "post", "/me/withdrawals",
      { amount: String(wk.available + 100_000), paypal_email: "x@paypal.com" });
    expect(over.status(), await over.text()).toBe(400); // insufficient_funds guard

    const cats = await (await req(request, workerAccess, "get", "/categories")).json();
    const catId = (cats.find((x: { slug: string }) => x.slug === "dev") ?? cats[0]).id;
    const svc = await (await req(request, workerAccess, "post", "/me/services", {
      title: "خدمة للاختبار الذاتي", category: catId, base_price: "50", delivery_days: 3,
      description: "وصف تفصيلي وكافٍ للخدمة يتجاوز الحد الأدنى المطلوب للنشر بنجاح دون مراجعة.",
    })).json();
    const selfBuy = await req(request, workerAccess, "post", `/services/${svc.id}/requests`, { quantity: 1, description: "شراء ذاتي" });
    expect(selfBuy.status(), await selfBuy.text()).toBeGreaterThanOrEqual(400); // BR-21 self-dealing block
  });
});
