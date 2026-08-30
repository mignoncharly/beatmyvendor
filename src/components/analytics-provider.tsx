"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_CHANGED_EVENT, CONSENT_STORAGE_KEY, type ConsentPreferences, parseConsent } from "@/lib/consent";
import { analyticsConfigured, capture, initAnalytics, isAnalyticsReady, stopAnalytics } from "@/lib/analytics";

// Bridges stored consent to the analytics module. Analytics initialises only
// after Analytics consent, and stops on revocation. Renders nothing and issues
// no network request until both a key is configured and consent is granted.
export function AnalyticsProvider() {
  const pathname = usePathname();

  useEffect(() => {
    if (!analyticsConfigured()) return;
    const apply = (consent: ConsentPreferences | null) => {
      if (consent?.analytics) {
        const wasReady = isAnalyticsReady();
        initAnalytics();
        if (!wasReady) capture("page_view", { path: pathname });
      } else {
        stopAnalytics();
      }
    };
    let saved: ConsentPreferences | null = null;
    try { saved = parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)); } catch { saved = null; }
    apply(saved);
    const onChange = (event: Event) => apply((event as CustomEvent<ConsentPreferences>).detail);
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
    // Intentionally runs once; pathname changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAnalyticsReady()) capture("page_view", { path: pathname });
  }, [pathname]);

  return null;
}
