import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import type { Job } from "@/lib/types";
import { server } from "@/test/msw/server";
import { render, screen, waitFor } from "@/test/utils/render";

import ProposalForm from "@/app/jobs/[slug]/ProposalForm";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

const job = { id: 5, screening_questions: [] } as unknown as Job;
// A job with an explicit budget band — used by the range-validation cases (P2-09).
const rangedJob = {
  id: 5,
  budget_min: "100",
  budget_max: "200",
  screening_questions: [],
} as unknown as Job;

beforeEach(() => {
  nav.push.mockClear();
  localStorage.setItem("sh_access", "tok");
});

describe("ProposalForm — bids ON (default)", () => {
  it("shows the bid-cost banner and deducting button label", async () => {
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": true })),
      http.get(`${API_URL}/me/bids`, () => HttpResponse.json({ balance: 5, ledger: [] })),
    );
    render(<ProposalForm job={job} />);

    expect(await screen.findByText(/سيُخصم عرض واحد/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /يُخصم 1 من رصيدك/ })).toBeInTheDocument();
  });
});

describe("ProposalForm — bids OFF", () => {
  it("hides bid cost, never calls /me/bids, and submits free", async () => {
    // NOTE: deliberately NO /me/bids handler — if the form fetches it, onUnhandledRequest:'error' fails.
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
      http.post(`${API_URL}/jobs/5/proposals`, () => HttpResponse.json({ id: 9 }, { status: 201 })),
    );
    const { user } = render(<ProposalForm job={job} />);

    // neutral button label, no bid banner
    const submit = await screen.findByRole("button", { name: "إرسال العرض" });
    expect(screen.queryByText(/سيُخصم عرض واحد/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/قيمة العرض/), "150");
    await user.type(screen.getByLabelText(/تفاصيل العرض/), "خطة العمل");
    await user.click(submit);

    // success message without any bid-deduction wording
    const ok = await screen.findByText(/تم إرسال عرضك/);
    expect(ok.textContent).not.toMatch(/خُصم عرض/);
  });
});

describe("ProposalForm — owner can't bid on their own job (BR-21)", () => {
  it("shows a manage-job notice instead of the form when the signed-in user owns the job", async () => {
    const ownedJob = { id: 5, employer: 7, screening_questions: [] } as unknown as Job;
    server.use(
      http.get(`${API_URL}/auth/me`, () => HttpResponse.json({ id: 7 })),
      http.get(`${API_URL}/me/bids`, () => HttpResponse.json({ balance: 5, ledger: [] })),
      http.get(`${API_URL}/me/proposals`, () => HttpResponse.json({ results: [] })),
    );
    render(<ProposalForm job={ownedJob} />);

    expect(await screen.findByText("هذه وظيفتك")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "العروض الواردة" })).toHaveAttribute(
      "href",
      "/me/jobs/5/proposals",
    );
    // the bid form never appears
    expect(screen.queryByLabelText(/قيمة العرض/)).not.toBeInTheDocument();
  });
});

describe("ProposalForm — success state", () => {
  it("replaces the form with a success card linking to my proposals", async () => {
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
      http.post(`${API_URL}/jobs/5/proposals`, () => HttpResponse.json({ id: 9 }, { status: 201 })),
    );
    const { user } = render(<ProposalForm job={job} />);

    const submit = await screen.findByRole("button", { name: "إرسال العرض" });
    await user.type(screen.getByLabelText(/قيمة العرض/), "150");
    await user.type(screen.getByLabelText(/تفاصيل العرض/), "خطة العمل");
    await user.click(submit);

    // form inputs are gone; a link to /me/proposals takes their place
    const link = await screen.findByRole("link", { name: "عرض عروضي" });
    expect(link).toHaveAttribute("href", "/me/proposals");
    expect(screen.queryByLabelText(/قيمة العرض/)).not.toBeInTheDocument();
  });
});

describe("ProposalForm — client-side budget/delivery validation (P2-09 / P2-08)", () => {
  function bidsOff() {
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
    );
  }

  async function fill(user: ReturnType<typeof render>["user"], budget: string, days?: string) {
    // wait for the loading skeleton to resolve into the actual form before querying inputs
    await screen.findByLabelText(/قيمة العرض/);
    await user.clear(screen.getByLabelText(/قيمة العرض/));
    await user.type(screen.getByLabelText(/قيمة العرض/), budget);
    if (days !== undefined) {
      const d = screen.getByDisplayValue("14");
      await user.clear(d);
      await user.type(d, days);
    }
    await user.type(screen.getByLabelText(/تفاصيل العرض/), "خطة العمل");
  }

  it("blocks a budget below budget_min and never POSTs", async () => {
    bidsOff();
    let posted = false;
    server.use(
      http.post(`${API_URL}/jobs/5/proposals`, () => {
        posted = true;
        return HttpResponse.json({ id: 9 }, { status: 201 });
      }),
    );
    const { user } = render(<ProposalForm job={rangedJob} />);
    await fill(user, "50");
    await user.click(await screen.findByRole("button", { name: "إرسال العرض" }));

    expect(await screen.findByText(/يجب أن تكون ضمن الميزانية/)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it("blocks a budget above budget_max", async () => {
    bidsOff();
    const { user } = render(<ProposalForm job={rangedJob} />);
    await fill(user, "250");
    await user.click(await screen.findByRole("button", { name: "إرسال العرض" }));
    expect(await screen.findByText(/يجب أن تكون ضمن الميزانية/)).toBeInTheDocument();
  });

  it("rejects a budget with more than two decimal places", async () => {
    bidsOff();
    const { user } = render(<ProposalForm job={rangedJob} />);
    await fill(user, "150.999");
    await user.click(await screen.findByRole("button", { name: "إرسال العرض" }));
    expect(await screen.findByText(/منزلتين عشريتين/)).toBeInTheDocument();
  });

  it("rejects a delivery time over 365 days", async () => {
    bidsOff();
    const { user } = render(<ProposalForm job={rangedJob} />);
    await fill(user, "150", "400");
    await user.click(await screen.findByRole("button", { name: "إرسال العرض" }));
    expect(await screen.findByText(/أقصى مدة تسليم 365/)).toBeInTheDocument();
  });

  it("accepts an in-range budget and POSTs", async () => {
    bidsOff();
    let posted = false;
    server.use(
      http.post(`${API_URL}/jobs/5/proposals`, () => {
        posted = true;
        return HttpResponse.json({ id: 9 }, { status: 201 });
      }),
    );
    const { user } = render(<ProposalForm job={rangedJob} />);
    await fill(user, "150");
    await user.click(await screen.findByRole("button", { name: "إرسال العرض" }));
    await waitFor(() => expect(posted).toBe(true));
  });

  it("maps screening_required missing_questions onto the per-question inputs (P2-03)", async () => {
    const q = { id: 42, question: "ما خبرتك؟", is_required: true };
    const screeningJob = {
      id: 5,
      budget_min: "100",
      budget_max: "200",
      screening_questions: [q],
    } as unknown as Job;
    server.use(
      http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
      http.post(`${API_URL}/jobs/5/proposals`, () =>
        HttpResponse.json(
          { code: "screening_required", message_ar: "أجب عن جميع الأسئلة الإلزامية", missing_questions: [42] },
          { status: 400 },
        ),
      ),
    );
    const { user } = render(<ProposalForm job={screeningJob} />);
    // answer the question client-side so the request reaches the server, which then rejects it
    await screen.findByLabelText(/قيمة العرض/);
    await user.type(screen.getByLabelText(/قيمة العرض/), "150");
    await user.type(screen.getByLabelText(/تفاصيل العرض/), "خطة العمل");
    await user.type(screen.getByLabelText(/ما خبرتك؟/), "x");
    await user.click(await screen.findByRole("button", { name: "إرسال العرض" }));

    // the per-question field shows the inline error (not just a global banner)
    expect(await screen.findByText("هذا السؤال إلزامي")).toBeInTheDocument();
  });
});
