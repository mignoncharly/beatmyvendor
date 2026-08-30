"use client";

import Script from "next/script";

// Renders the Cloudflare Turnstile widget only when a public site key is present
// at build time. The widget injects a `cf-turnstile-response` field into the
// enclosing form, which the server action verifies. Dormant (renders nothing)
// until NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured.
export function TurnstileWidget() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={siteKey} />
    </>
  );
}
