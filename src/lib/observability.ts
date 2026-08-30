import "server-only";
import { randomUUID } from "node:crypto";

// Correlation id links a user-visible reference, the structured log line, and the
// error-tracking event so a failure can be traced without exposing internals.
export function newCorrelationId() {
  return randomUUID();
}

const sensitiveKey = /(email|e-mail|token|secret|password|passwd|authorization|api[_-]?key|dsn|cookie|contact|phone|address|storage_?path|display_name|private|comment|details|reason|name)/i;
const emailPattern = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    const masked = value.replace(emailPattern, "[email]");
    return masked.length > 200 ? masked.slice(0, 200) + "…" : masked;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(redactValue);
  if (typeof value === "object") return redactContext(value as Record<string, unknown>);
  return "[unserializable]";
}

// Shallow-redacts a context object: drops values under sensitive keys and
// scrubs emails / truncates long strings elsewhere. Never sends free-text or PII.
export function redactContext(context: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    output[key] = sensitiveKey.test(key) ? "[redacted]" : redactValue(value);
  }
  return output;
}

type ErrorInfo = { type: string; value: string };
function describe(error: unknown): ErrorInfo {
  if (error instanceof Error) return { type: error.name || "Error", value: (error.message || "").slice(0, 500) };
  if (typeof error === "string") return { type: "Error", value: error.slice(0, 500) };
  return { type: "Error", value: "Non-error thrown" };
}

async function sendToSentry(scope: string, info: ErrorInfo, context: Record<string, unknown>, correlationId: string) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return; // dormant until configured
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
    const eventId = randomUUID().replace(/-/g, "");
    const sentAt = new Date().toISOString();
    const event = {
      event_id: eventId,
      timestamp: sentAt,
      platform: "node",
      level: "error",
      logger: scope,
      environment: process.env.NODE_ENV || "production",
      release: "beatmyvendor@1.0.0",
      message: `${scope}: ${info.value}`,
      exception: { values: [info] },
      tags: { scope, correlation_id: correlationId },
      extra: context
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: sentAt, dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7,sentry_key=${url.username},sentry_client=beatmyvendor/1.0`
      },
      body,
      signal: controller.signal
    }).finally(() => clearTimeout(timer));
  } catch {
    // Error reporting must never itself throw.
  }
}

// Classifies, correlates, sanitizes, and reports an operational error. Always
// emits a structured log line; forwards to Sentry when configured. Returns the
// correlation id to surface to the user / caller.
export function reportError(scope: string, error: unknown, context: Record<string, unknown> = {}): string {
  const correlationId = newCorrelationId();
  const info = describe(error);
  const safeContext = redactContext(context);
  console.error(JSON.stringify({ level: "error", scope, correlationId, error: info, context: safeContext, at: new Date().toISOString() }));
  void sendToSentry(scope, info, safeContext, correlationId);
  return correlationId;
}
