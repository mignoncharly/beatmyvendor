import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { emails } from "./constants";

// Playwright global setup: ensure the three journey auth users exist (GoTrue admin
// API) and commit the marketplace fixtures (journey_seed.sql) via psql through the
// IPv4 session pooler. Runs against the NON-PRODUCTION staging project only.

async function ensureUser(admin: SupabaseClient, email: string): Promise<string> {
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.data?.user) return created.data.user.id;
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 1000) break;
  }
  throw new Error(`Could not create or find ${email}: ${created.error?.message ?? "unknown"}`);
}

export default async function globalSetup() {
  const url = process.env.STAGING_SUPABASE_URL;
  const serviceRole = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.QUALIFY_DATABASE_URL;
  const poolHost = process.env.QUALIFY_POOLER_HOST;
  if (!url || !serviceRole || !dbUrl || !poolHost) {
    throw new Error("Journey setup needs STAGING_SUPABASE_URL, STAGING_SUPABASE_SERVICE_ROLE_KEY, QUALIFY_DATABASE_URL, QUALIFY_POOLER_HOST (see docs/testing-phase3.md).");
  }

  const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminUid = await ensureUser(admin, emails.admin);
  const buyerUid = await ensureUser(admin, emails.buyer);
  const vendorUid = await ensureUser(admin, emails.vendor);

  // Session-pooler conninfo (keyword form avoids URL-encoding the password).
  const ref = new URL(url).hostname.split(".")[0];
  const userinfo = dbUrl.replace(/^postgresql:\/\//, "").replace(/@[^@]*$/, "");
  const password = userinfo.slice(userinfo.indexOf(":") + 1);
  const conn = `host=${poolHost} port=5432 user=postgres.${ref} dbname=postgres sslmode=require`;

  execFileSync(
    "psql",
    [conn, "-v", "ON_ERROR_STOP=1", "-v", `admin_uid=${adminUid}`, "-v", `buyer_uid=${buyerUid}`, "-v", `vendor_uid=${vendorUid}`, "-q", "-f", "supabase/tests/journey_seed.sql"],
    { env: { ...process.env, PGPASSWORD: password }, stdio: ["ignore", "ignore", "inherit"] },
  );
}
