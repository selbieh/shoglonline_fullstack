import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./test/msw/server";
import { resetPublicSettingsCache } from "./lib/settings";

// --- MSW lifecycle: mock the backend for every test ---------------------------------------
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  localStorage.clear();
  resetPublicSettingsCache(); // each test starts with no cached flags
});
afterAll(() => server.close());

// jsdom doesn't implement matchMedia / scrollTo — stub the bits components touch.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// jsdom doesn't implement URL.createObjectURL / revokeObjectURL — FileUpload uses them to render a
// local image preview. Stub them so image-upload flows (e.g. national-ID verification) work in tests.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => "blob:mock";
  URL.revokeObjectURL = () => {};
}
