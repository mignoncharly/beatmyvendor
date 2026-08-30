import { describe, expect, it } from "vitest";
import { isIsoCountry, isSupportedCurrency } from "./iso";

describe("iso allowlists", () => {
  it("accepts supported currencies regardless of case/whitespace", () => {
    expect(isSupportedCurrency("EUR")).toBe(true);
    expect(isSupportedCurrency(" usd ")).toBe(true);
    expect(isSupportedCurrency("gbp")).toBe(true);
  });

  it("rejects unsupported or malformed currencies", () => {
    expect(isSupportedCurrency("XXX")).toBe(false);
    expect(isSupportedCurrency("BTC")).toBe(false);
    expect(isSupportedCurrency("EU")).toBe(false);
  });

  it("accepts real ISO country codes", () => {
    expect(isIsoCountry("DE")).toBe(true);
    expect(isIsoCountry(" fr ")).toBe(true);
    expect(isIsoCountry("us")).toBe(true);
  });

  it("rejects invented country codes", () => {
    expect(isIsoCountry("ZZ")).toBe(false);
    expect(isIsoCountry("XX")).toBe(false);
    expect(isIsoCountry("USA")).toBe(false);
  });
});
