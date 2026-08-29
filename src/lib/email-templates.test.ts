import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requiredTemplates = [
  "email_verification",
  "duel_submitted",
  "duel_approved",
  "new_challenge_received",
  "duel_ending_soon",
  "offers_ready",
  "selection_confirmed",
  "introduction_completed",
  "deal_confirmation",
  "vendor_approved",
  "matching_duel",
  "challenge_submitted",
  "challenge_selected",
  "challenge_not_selected",
  "payment_receipt",
  "duel_closed",
  "verification_required",
  "vendor_awaiting_approval",
  "flagged_duel",
  "payment_failed",
  "reported_vendor",
  "data_request_received"
];

let renderBrandedEmail: typeof import("./email-templates").renderBrandedEmail;

beforeAll(async () => {
  ({ renderBrandedEmail } = await import("./email-templates"));
});

describe("renderBrandedEmail", () => {
  it.each(requiredTemplates)("renders the %s notification with consistent branding", (template) => {
    const email = renderBrandedEmail(template, { duel_id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain("V / VENDORDUEL");
    expect(email.html).toMatch(/href="https?:\/\//);
    expect(email.text).toContain("http");
  });

  it("uses a branded safe fallback for unknown notification types", () => {
    const email = renderBrandedEmail("future_notification");
    expect(email.subject).toBe("VendorDuel update");
    expect(email.html).toContain("Marketplace update");
    expect(email.text).toContain("Open VendorDuel");
  });
});
