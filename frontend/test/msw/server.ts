import { setupServer } from "msw/node";

import { handlers } from "./handlers";

// Shared MSW server for Vitest (lifecycle wired in vitest.setup.ts).
export const server = setupServer(...handlers);
