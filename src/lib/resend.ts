import "server-only";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  templateKey: string;
};

type ResendResponse = { id?: unknown; message?: unknown; error?: { message?: unknown } };

export class EmailProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message);
    this.name = "EmailProviderError";
  }
}

export function resendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function sender() {
  return process.env.RESEND_FROM_EMAIL?.trim() || "BeatMyVendor <notifications@beatmyvendor.com>";
}

function replyTo() {
  return process.env.RESEND_REPLY_TO_EMAIL?.trim() || "support@beatmyvendor.com";
}

export async function sendResendEmail(input: SendEmailInput, fetcher: typeof fetch = fetch) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new EmailProviderError("Resend is not configured.", false);

  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey
      },
      body: JSON.stringify({
        from: sender(),
        to: [input.to],
        reply_to: replyTo(),
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: [{ name: "template", value: input.templateKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) }]
      })
    });
  } catch {
    throw new EmailProviderError("Resend could not be reached.", true);
  }

  const result = await response.json().catch(() => ({})) as ResendResponse;
  if (!response.ok) {
    const providerMessage = typeof result.message === "string"
      ? result.message
      : typeof result.error?.message === "string"
        ? result.error.message
        : "Resend rejected the email.";
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw new EmailProviderError(providerMessage.slice(0, 500), retryable, response.status);
  }
  if (typeof result.id !== "string" || !result.id) {
    throw new EmailProviderError("Resend returned no message identifier.", true, response.status);
  }
  return { id: result.id };
}
