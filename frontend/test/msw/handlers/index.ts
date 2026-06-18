import { commonHandlers } from "./common";
import { walletHandlers } from "./wallet";

// Aggregate per-area handler arrays here as new test areas are added.
export const handlers = [...commonHandlers, ...walletHandlers];
