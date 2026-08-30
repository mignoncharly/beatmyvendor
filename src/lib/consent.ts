export const CONSENT_VERSION = "2026-08-30";
export const CONSENT_STORAGE_KEY = "beatmyvendor:consent";
export const OPEN_CONSENT_EVENT = "beatmyvendor:open-consent";
export const CONSENT_CHANGED_EVENT = "beatmyvendor:consent-changed";

export type ConsentPreferences = {
  version: string;
  timestamp: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
};

export const defaultConsent = { necessary: true as const, analytics: false, marketing: false };

export function createConsent(analytics: boolean, marketing: boolean, timestamp = new Date().toISOString()): ConsentPreferences {
  return { version: CONSENT_VERSION, timestamp, necessary: true, analytics, marketing };
}

export function parseConsent(raw: string | null): ConsentPreferences | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentPreferences>;
    if (value.version !== CONSENT_VERSION || value.necessary !== true || typeof value.analytics !== "boolean" || typeof value.marketing !== "boolean" || typeof value.timestamp !== "string" || Number.isNaN(Date.parse(value.timestamp))) return null;
    return value as ConsentPreferences;
  } catch {
    return null;
  }
}
