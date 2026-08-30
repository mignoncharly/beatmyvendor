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
let emailTemplateKeys: typeof import("./email-templates").emailTemplateKeys;

beforeAll(async () => {
  const templates = await import("./email-templates");
  renderBrandedEmail = templates.renderBrandedEmail;
  emailTemplateKeys = templates.emailTemplateKeys;
});

describe("renderBrandedEmail", () => {
  it.each(requiredTemplates)("renders the %s notification with consistent branding", (template) => {
    const email = renderBrandedEmail(template, { duel_id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(email.subject.length).toBeGreaterThan(5);
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain("BEATMYYVENDOR");
    expect(email.html).toContain('meta name="viewport"');
    expect(email.html).toContain('role="presentation"');
    expect(email.html).toContain("TRANSACTIONAL");
    expect(email.html).toMatch(/href="https?:\/\//);
    expect(email.text).toContain("http");
    expect(email.html).not.toContain("undefined");
    expect(email.text).not.toContain("undefined");
  });

  it("keeps the public template registry aligned with the required catalog", () => {
    expect([...emailTemplateKeys]).toEqual(requiredTemplates);
    expect(new Set(emailTemplateKeys).size).toBe(emailTemplateKeys.length);
  });

  it("personalizes and escapes recipient, workspace, and reference data", () => {
    const email = renderBrandedEmail(
      "duel_approved",
      { duel_id: "550e8400-e29b-41d4-a716-446655440000" },
      { recipientName: "<Alex>", organizationName: "Acme & Sons" }
    );
    expect(email.html).toContain("Hello &lt;Alex&gt;,");
    expect(email.html).toContain("Acme &amp; Sons");
    expect(email.html).toContain("Duel 550E8400");
    expect(email.html).not.toContain("Hello <Alex>");
    expect(email.actionUrl).toContain("/buyer/duels/550e8400-e29b-41d4-a716-446655440000");
  });

  it("supports secure provider-generated action links", () => {
    const email = renderBrandedEmail("email_verification", {}, { actionUrl: "https://auth.example.com/verify?token=a&next=b" });
    expect(email.actionUrl).toBe("https://auth.example.com/verify?token=a&next=b");
    expect(email.html).toContain("token=a&amp;next=b");
  });

  it("uses a branded safe fallback for unknown notification types", () => {
    const email = renderBrandedEmail("future_notification");
    expect(email.subject).toBe("BeatMyyVendor update");
    expect(email.html).toContain("Marketplace update");
    expect(email.text).toContain("Open BeatMyyVendor");
  });
});
