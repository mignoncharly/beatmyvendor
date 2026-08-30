import { describe, expect, it } from "vitest";
import { annualSaving, annualSpend } from "./pricing";

describe("annual spend", () => {
  it("annualises a monthly price", () => {
    expect(annualSpend(100, "monthly")).toBe(1200);
  });

  it("keeps an annual price as-is", () => {
    expect(annualSpend(1200, "annual")).toBe(1200);
  });

  it("adds recurring fees to the baseline", () => {
    expect(annualSpend(100, "monthly", 300)).toBe(1500);
    expect(annualSpend(1200, "annual", 300)).toBe(1500);
  });

  it("ignores non-finite fees", () => {
    expect(annualSpend(1200, "annual", Number.NaN)).toBe(1200);
  });

  it("computes savings against an offer", () => {
    expect(annualSaving(1500, 1100)).toBe(400);
    expect(annualSaving(1500, 1600)).toBe(-100);
  });
});
