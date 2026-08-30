import type { NextConfig } from "next";

function supabaseOrigin() {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").origin; } catch { return ""; }
}

// Content-Security-Policy compatible with the app's real dependencies: redirect
// Stripe Checkout, Supabase (REST/realtime/storage), Cloudflare Turnstile, and
// the optional analytics host. script-src keeps 'unsafe-inline' because inline
// JSON-LD must survive static rendering; every other channel is allowlisted.
function contentSecurityPolicy() {
  const supabase = supabaseOrigin();
  const supabaseWs = supabase.replace(/^https:/, "wss:");
  const analytics = (process.env.NEXT_PUBLIC_ANALYTICS_HOST || "https://eu.i.posthog.com").replace(/\/$/, "");
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self' 'unsafe-inline' https://js.stripe.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? " " + supabase : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase} ${supabaseWs}` : ""} https://challenges.cloudflare.com ${analytics}`,
    "frame-src https://js.stripe.com https://challenges.cloudflare.com",
    "upgrade-insecure-requests"
  ];
  return directives.join("; ");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "11mb" }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy() }
        ]
      }
    ];
  }
};

export default nextConfig;
