import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { API_URL } from "@/lib/api";
import { server } from "@/test/msw/server";
import { render, screen } from "@/test/utils/render";

import PrivateJobView from "@/app/jobs/[slug]/PrivateJobView";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  nav.push.mockClear();
  localStorage.clear();
  // ProposalForm (rendered inside the body) probes these — keep them quiet.
  server.use(
    http.get(`${API_URL}/settings/public`, () => HttpResponse.json({ "bids.enabled": false })),
    http.get(`${API_URL}/me/proposals`, () => HttpResponse.json({ results: [], count: 0, next: null, previous: null })),
  );
});

describe("PrivateJobView — authenticated re-fetch (FR-JOB-12)", () => {
  it("loads the private job with the viewer's token and renders it", async () => {
    localStorage.setItem("sh_access", "tok");
    server.use(
      http.get(`${API_URL}/jobs/secret-slug`, () =>
        HttpResponse.json({
          id: 9, title: "مهمة سرية", slug: "secret-slug", category_name: "تصميم",
          budget_min: "100", budget_max: "200", location_type: "remote",
          proposals_count: 0, is_private: true, viewer_invited: true, screening_questions: [],
        })),
    );
    render(<PrivateJobView slug="secret-slug" />);
    expect(await screen.findByRole("heading", { name: "مهمة سرية" })).toBeInTheDocument();
    // the invited-worker free-proposal banner proves viewer_invited flowed through
    expect(await screen.findByText(/مجاني/)).toBeInTheDocument();
  });

  it("shows a sign-in CTA when there is no token", async () => {
    render(<PrivateJobView slug="secret-slug" />);
    expect(await screen.findByText(/غير متاحة لك/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تسجيل الدخول/ })).toBeInTheDocument();
  });

  it("shows a not-available message when the authed fetch fails (not invited)", async () => {
    localStorage.setItem("sh_access", "tok");
    server.use(http.get(`${API_URL}/jobs/secret-slug`, () => new HttpResponse(null, { status: 404 })));
    render(<PrivateJobView slug="secret-slug" />);
    expect(await screen.findByText(/غير متاحة لك/)).toBeInTheDocument();
  });
});
