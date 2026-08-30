import { isCronAuthorized } from "@/lib/cron-auth";
import { reportError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("run_marketplace_expiry");
  if (error) { const reference = reportError("maintenance.expiry", error); return Response.json({ error: "Expiry run failed", reference }, { status: 500 }); }
  return Response.json(data ?? {});
}
