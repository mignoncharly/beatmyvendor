"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CONSENT_CHANGED_EVENT, CONSENT_STORAGE_KEY, ConsentPreferences, OPEN_CONSENT_EVENT, createConsent, defaultConsent, parseConsent } from "@/lib/consent";
const optionalCookiesEnabled = process.env.NEXT_PUBLIC_OPTIONAL_COOKIES_ENABLED === "true";

function storeConsent(preferences: ConsentPreferences) {
  try { localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Consent remains effective for the current page even when storage is unavailable. */ }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: preferences }));
}

export function CookieSettingsButton() {
  return <button type="button" className="footer-link-button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>Cookie settings</button>;
}

export function ConsentManager() {
  const dialog = useRef<HTMLDialogElement>(null);
  const firstChoice = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState<ConsentPreferences | null>(null);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const openPreferences = () => {
    setAnalytics(consent?.analytics ?? defaultConsent.analytics);
    setMarketing(consent?.marketing ?? defaultConsent.marketing);
    dialog.current?.showModal();
    window.setTimeout(() => firstChoice.current?.focus(), 0);
  };

  useEffect(() => {
    let saved: ConsentPreferences | null = null;
    try { saved = parseConsent(localStorage.getItem(CONSENT_STORAGE_KEY)); } catch { saved = null; }
    const timer = window.setTimeout(() => {
      setConsent(saved);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const open = () => {
      setAnalytics(consent?.analytics ?? defaultConsent.analytics);
      setMarketing(consent?.marketing ?? defaultConsent.marketing);
      dialog.current?.showModal();
      window.setTimeout(() => firstChoice.current?.focus(), 0);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, [consent]);

  const choose = (next: ConsentPreferences) => {
    setConsent(next);
    storeConsent(next);
    dialog.current?.close();
  };

  if (!ready) return null;

  return <>
    {optionalCookiesEnabled && !consent && <aside className="consent-banner" aria-labelledby="consent-title" aria-describedby="consent-description">
      <div><span className="eyebrow">Privacy choices</span><h2 id="consent-title">Your privacy, your decision.</h2><p id="consent-description">BeatMyVendor uses necessary storage for security, sign-in, form recovery, consent preferences, and requested services. Analytics and marketing stay off unless you choose them. With your consent, privacy-first product analytics are sent to PostHog US service. No marketing provider is configured.</p><Link href="/cookies">Read the cookie policy</Link></div>
      <div className="consent-actions"><button type="button" className="button button-primary" onClick={() => choose(createConsent(true, true))}>Accept all</button><button type="button" className="button button-secondary" onClick={() => choose(createConsent(false, false))}>Reject non-essential</button><button type="button" className="button button-secondary" onClick={openPreferences}>Customize</button></div>
    </aside>}
    <dialog ref={dialog} className="consent-dialog" aria-labelledby="preferences-title" onCancel={(event) => { event.preventDefault(); dialog.current?.close(); }}>
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); choose(createConsent(analytics, marketing)); }}>
        <div className="consent-dialog-heading"><span className="eyebrow">Cookie settings</span><h2 id="preferences-title">Choose optional categories.</h2><p>Necessary storage supports the service and cannot be disabled. Optional categories remain inactive unless enabled here and a corresponding provider is configured.</p></div>
        <div className="consent-category"><div><h3>Necessary</h3><p>Authentication, security, payments, consent storage, form recovery, and offline application resources.</p></div><input type="checkbox" checked disabled aria-label="Necessary storage always enabled" /></div>
        <label className="consent-category"><div><h3>Analytics</h3><p>Optional audience measurement through PostHog US service using an anonymous browser identifier; no email, company, or Duel content is sent.</p></div><input ref={firstChoice} type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /></label>
        <label className="consent-category"><div><h3>Marketing</h3><p>Optional advertising or campaign tracking. No marketing provider is currently installed.</p></div><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} /></label>
        <div className="consent-dialog-actions"><button type="submit" className="button button-primary">Save preferences</button><button type="button" className="button button-secondary" onClick={() => choose(createConsent(false, false))}>Reject non-essential</button><button type="button" className="text-button" onClick={() => dialog.current?.close()}>Cancel</button></div>
      </form>
    </dialog>
  </>;
}
