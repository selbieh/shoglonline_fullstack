/**
 * PayPal browser SDK helpers shared by the wallet top-up flow.
 *
 * The client-id is publishable (it ships in the SDK URL); the secret stays server-side. `stub` lets
 * the UI fall back to the redirect flow in local dev where no real SDK client-id exists.
 */

export type PayPalConfig = { paypal_client_id: string; currency: string; stub: boolean };

// Minimal shape of the PayPal JS SDK Smart Buttons we use — avoids pulling in @paypal/* types.
export type PayPalButtonData = { orderID: string };
export type PayPalSdk = {
  Buttons: (opts: {
    style?: Record<string, string>;
    createOrder: () => Promise<string>;
    onApprove: (data: PayPalButtonData) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => { render: (el: HTMLElement) => Promise<void> };
};

/**
 * Load the PayPal JS SDK once and resolve the global `paypal` namespace. Resolves null if the script
 * fails to load (blocked / offline) so the caller can fall back to the redirect flow.
 */
export function loadPayPalSdk(clientId: string, currency: string): Promise<PayPalSdk | null> {
  return new Promise((resolve) => {
    const w = window as unknown as { paypal?: PayPalSdk };
    if (w.paypal) return resolve(w.paypal);
    const existing = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk]");
    if (existing) {
      existing.addEventListener("load", () => resolve(w.paypal ?? null));
      existing.addEventListener("error", () => resolve(null));
      return;
    }
    const s = document.createElement("script");
    s.src =
      "https://www.paypal.com/sdk/js?client-id=" +
      encodeURIComponent(clientId) +
      "&currency=" +
      encodeURIComponent(currency) +
      "&components=buttons&intent=capture";
    s.dataset.paypalSdk = "1";
    s.onload = () => resolve(w.paypal ?? null);
    s.onerror = () => resolve(null);
    document.body.appendChild(s);
  });
}

/** Only allow internal absolute paths as a post-charge redirect target — blocks open-redirect. */
export function safeReturnPath(raw: string | null | undefined, fallback = "/wallet"): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return fallback;
}
