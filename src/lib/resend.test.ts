import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let EmailProviderError: typeof import("./resend").EmailProviderError;
let resendConfigured: typeof import("./resend").resendConfigured;
let sendResendEmail: typeof import("./resend").sendResendEmail;

beforeEach(async () => {
  vi.resetModules();
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "BeatMyVendor <notifications@beatmyvendor.com>";
  process.env.RESEND_REPLY_TO_EMAIL = "support@beatmyvendor.com";
  ({ EmailProviderError, resendConfigured, sendResendEmail } = await import("./resend"));
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  delete process.env.RESEND_REPLY_TO_EMAIL;
});

const input = {
  to: "buyer@example.com",
  subject: "A professional update",
  html: "<p>Hello</p>",
  text: "Hello",
  idempotencyKey: "beatmyvendor/notification/550e8400-e29b-41d4-a716-446655440000",
  templateKey: "duel_approved"
};

describe("sendResendEmail", () => {
  it("sends a complete idempotent Resend request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "email_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));
    await expect(sendResendEmail(input, fetcher)).resolves.toEqual({ id: "email_123" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey
    });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      from: "BeatMyVendor <notifications@beatmyvendor.com>",
      to: ["buyer@example.com"],
      reply_to: "support@beatmyvendor.com",
      subject: input.subject,
      html: input.html,
      text: input.text,
      tags: [{ name: "template", value: "duel_approved" }]
    });
  });

  it("classifies rate limits and provider outages as retryable", async () => {
    for (const status of [408, 429, 500, 503]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ message: "Try again" }), {
        status,
        headers: { "Content-Type": "application/json" }
      }));
      await expect(sendResendEmail(input, fetcher)).rejects.toMatchObject({
        name: "EmailProviderError",
        retryable: true,
        status
      });
    }
  });

  it("treats invalid sender or recipient responses as terminal", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ message: "Invalid from address" }), {
      status: 422,
      headers: { "Content-Type": "application/json" }
    }));
    await expect(sendResendEmail(input, fetcher)).rejects.toMatchObject({
      name: "EmailProviderError",
      retryable: false,
      status: 422
    });
  });

  it("fails closed when the provider key is missing", async () => {
    delete process.env.RESEND_API_KEY;
    expect(resendConfigured()).toBe(false);
    await expect(sendResendEmail(input, vi.fn())).rejects.toBeInstanceOf(EmailProviderError);
  });
});
