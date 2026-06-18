import { http, HttpResponse } from "msw";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Defaults for incidental calls made by shared components (e.g. the NotificationsBell poll) so
 * page tests don't each have to stub them. Page-specific tests override via server.use(). */
export const commonHandlers = [
  http.get(`${API}/me/notifications/unread-count`, () => HttpResponse.json({ unread: 0 })),
  // public feature flags — default everything on; flag-off tests override via server.use()
  http.get(`${API}/settings/public`, () => HttpResponse.json({ "bids.enabled": true })),
];
