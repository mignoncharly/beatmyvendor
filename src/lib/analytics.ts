// Privacy-first, consent-gated product analytics. Dormant unless a public key is
// configured, and it never touches the network before Analytics consent is given
// (the provider calls initAnalytics only after consent; capture no-ops until then).

export const analyticsEvents = [
  "page_view",
  "signin_requested",
  "duel_started",
  "offer_submitted",
  "vendor_selected",
  "checkout_started",
  "introduction_paid",
  "outcome_reported"
] as const;
export type AnalyticsEvent = (typeof analyticsEvents)[number];

// Only these non-sensitive property keys are ever forwarded. No email, company,
// contact, free-text, document path, or duel content may be sent.
const allowedProperties = new Set(["path", "role", "step", "duel_status", "offer_count", "result"]);

const DISTINCT_ID_KEY = "beatmyvendor:analytics-id";

let ready = false;
let distinctId: string | null = null;

export function analyticsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_ANALYTICS_KEY);
}

function analyticsHost() {
  return (process.env.NEXT_PUBLIC_ANALYTICS_HOST || "https://eu.i.posthog.com").replace(/\/$/, "");
}

export function sanitizeProperties(properties: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowedProperties.has(key)) continue;
    if (typeof value === "string") output[key] = value.slice(0, 60);
    else if (typeof value === "number" || typeof value === "boolean") output[key] = value;
  }
  return output;
}

// Enabled only by the consent provider once Analytics consent exists. Creates the
// anonymous distinct id lazily so no identifier is minted before consent.
export function initAnalytics() {
  if (!analyticsConfigured() || typeof window === "undefined") return;
  try {
    let stored = window.localStorage.getItem(DISTINCT_ID_KEY);
    if (!stored) { stored = crypto.randomUUID(); window.localStorage.setItem(DISTINCT_ID_KEY, stored); }
    distinctId = stored;
  } catch {
    distinctId = crypto.randomUUID();
  }
  ready = true;
}

export function stopAnalytics() {
  ready = false;
}

export function isAnalyticsReady() {
  return ready;
}

export function capture(event: AnalyticsEvent, properties: Record<string, unknown> = {}) {
  if (!ready || !analyticsConfigured() || !distinctId || typeof window === "undefined") return;
  try {
    void fetch(`${analyticsHost()}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.NEXT_PUBLIC_ANALYTICS_KEY,
        event,
        distinct_id: distinctId,
        properties: sanitizeProperties(properties),
        timestamp: new Date().toISOString()
      }),
      keepalive: true
    }).catch(() => {});
  } catch {
    // Analytics must never affect the user experience.
  }
}
