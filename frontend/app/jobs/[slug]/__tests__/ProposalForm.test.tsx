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
    expect(screen.getByRole("button", { name: /يُخصم ١ من رصيدك/ })).toBeInTheDocument();
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
