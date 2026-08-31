import { test as base, type Page, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Authenticated E2E fixtures. Sessions are minted through the app's real
// magic-link callback (no production auth-bypass): the service role generates a
// magic link, and the browser visits /auth/callback?token_hash=… so the app runs
// verifyOtp and sets its own session cookies.
//
// Requires a NON-PRODUCTION Supabase (see docs/testing-phase3.md):
//   STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY
// (falls back to the standard NEXT_PUBLIC_/SERVICE_ROLE names for local runs).

const SUPABASE_URL = process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY =
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Auth fixture requires STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY (a non-production project). See docs/testing-phase3.md.",
  );
}

// Guardrail: never let the authenticated suite run against the production URL.
if (SUPABASE_URL === process.env.PRODUCTION_SUPABASE_URL) {
  throw new Error("Refusing to run the authenticated E2E suite against the production Supabase project.");
}

export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Create the auth user if absent (idempotent), returning its id. */
export async function ensureUser(email: string): Promise<string> {
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (!error && data.user) return data.user.id;
  // Already exists → look it up.
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw error ?? new Error(`Could not create or find user ${email}`);
  return existing.id;
}

/**
 * Sign the browser in as `email` by driving the real auth callback. `type`
 * defaults to "magiclink"; a run may reveal Supabase expects "email" for
 * generateLink tokens — flip it here if verifyOtp rejects the link.
 */
export async function login(
  page: Page,
  email: string,
  opts: { next?: string; type?: "magiclink" | "email" } = {},
): Promise<void> {
  await ensureUser(email);
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) {
    throw error ?? new Error(`generateLink returned no hashed_token for ${email}`);
  }
  const type = opts.type ?? "magiclink";
  const next = opts.next ?? "";
  const url = `/auth/callback?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=${type}${
    next ? `&next=${encodeURIComponent(next)}` : ""
  }`;
  await page.goto(url);
  // The callback redirects away from /login on success.
  await expect(page).not.toHaveURL(/\/login/);
}

export const test = base;
export { expect };
