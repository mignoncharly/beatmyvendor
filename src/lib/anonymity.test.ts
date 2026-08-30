import { describe, expect, it } from "vitest";
import { duelRequirementsDisclosureError, duelTextDisclosureKind } from "@/lib/anonymity";

describe("Duel requirement anonymity", () => {
  it.each([
    ["Email procurement@acme.example.com", "email address"],
    ["See https://acme.example.com/spec", "web address"],
    ["Details at acme.io", "domain name"],
    ["Message @buyer_contact", "social profile"],
    ["Call +49 (0) 6131 8920", "phone number"],
    ["Configured for Acme Procurement GmbH", "buyer identity"]
  ])("detects %s", (value, expected) => {
    expect(duelTextDisclosureKind(value, ["Acme Procurement GmbH", "Jane Buyer"])).toBe(expected);
  });

  it.each([
    "SLA reporting",
    "Salesforce integration",
    "SOC 2 reporting",
    "Support Windows 10 and 11",
    "24/7 email support"
  ])("accepts non-identifying requirement: %s", (value) => {
    expect(duelTextDisclosureKind(value, ["Acme Procurement GmbH", "Jane Buyer"])).toBeNull();
  });

  it("returns an actionable validation message", () => {
    expect(duelRequirementsDisclosureError(["Knowledge base", "Contact jane@example.com"]))
      .toContain("Remove the email address");
  });
});
