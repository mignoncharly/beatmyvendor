import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

// Best-effort client IP from the reverse proxy. Nginx forwards the real client
// in x-forwarded-for; the first hop is the client.
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// Returns true when the request is within the limit, false when it should be
// throttled. Fails open on limiter error so a limiter outage never blocks users.
export async function withinRateLimit(action: string, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_bucket: `${action}:${key}`,
      p_limit: limit,
      p_window_seconds: windowSeconds
    });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
