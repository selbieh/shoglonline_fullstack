import { http, HttpResponse } from "msw";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export const walletHandlers = [
  http.get(`${API}/me/wallet`, () =>
    HttpResponse.json({
      currency: "USD",
      available: "50.00",
      escrow_held: "100.00",
      earnings_pending: "0.00",
    }),
  ),
  http.post(`${API}/wallet/charge`, () =>
    HttpResponse.json({ order_id: "STUB-1", approval_url: "/wallet?token=STUB-1" }, { status: 201 }),
  ),
];
