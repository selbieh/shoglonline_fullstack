import { http, HttpResponse } from "msw";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Defaults for incidental calls made by shared components (e.g. the NotificationsBell poll) so
 * page tests don't each have to stub them. Page-specific tests override via server.use(). */
export const commonHandlers = [
  http.get(`${API}/me/notifications/unread-count`, () => HttpResponse.json({ unread: 0 })),
  // public feature flags — default everything on; flag-off tests override via server.use()
  http.get(`${API}/settings/public`, () => HttpResponse.json({ "bids.enabled": true })),
  // DashboardShell paints the header from /auth/me and polls /me/conversations for the unread
  // badge — incidental to most page tests, so default them here (page tests override via server.use()).
  http.get(`${API}/auth/me`, () =>
    HttpResponse.json({
      id: 1,
      email: "user@example.com",
      first_name: "مستخدم",
      last_name: "",
      avatar_url: "",
      active_mode: "worker",
      status: "active",
      email_verified: true,
      phone_verified: false,
    }),
  ),
  http.get(`${API}/me/conversations`, () => HttpResponse.json({ results: [] })),
];
