import { describe, expect, it } from "vitest";

import { STATUS_CHIP, STATUS_LABEL } from "@/lib/contractStatus";

// Mirrors apps/contracts/models.py Contract.Status — if a status is added backend-side,
// this test fails until the UI provides a label + chip for it (no untranslated raw keys).
const CONTRACT_STATUSES = [
  "pending_funding",
  "active",
  "delivered",
  "completed",
  "disputed",
  "cancelled",
] as const;

describe("contract status maps", () => {
  it.each(CONTRACT_STATUSES)("%s has a non-empty label and chip class", (status) => {
    expect(STATUS_LABEL[status]?.length).toBeGreaterThan(0);
    expect(STATUS_CHIP[status]?.length).toBeGreaterThan(0);
  });

  it("defines no labels/chips beyond the known statuses", () => {
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...CONTRACT_STATUSES].sort());
    expect(Object.keys(STATUS_CHIP).sort()).toEqual([...CONTRACT_STATUSES].sort());
  });
});
