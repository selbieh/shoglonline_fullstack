import { render as rtlRender, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

/**
 * Render helper: wraps Testing Library's render and returns a ready `userEvent` instance.
 * Add app-wide providers (i18n, theme) to `AllProviders` as they land in later parts.
 */
function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return {
    user: userEvent.setup(),
    ...rtlRender(ui, { wrapper: AllProviders, ...options }),
  };
}

// Re-export RTL helpers (screen, waitFor, …) then OVERRIDE `render` with ours. The explicit
// named export after `export *` deterministically wins, so `render` returns `user`.
export * from "@testing-library/react";
export { customRender as render };
