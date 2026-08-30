import { isCronAuthorized } from "@/lib/cron-auth";
import { deliverPendingEmails } from "@/lib/email-delivery";
import { reportError } from "@/lib/observability";
import { resendConfigured } from "@/lib/resend";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!resendConfigured()) {
    return Response.json({ error: "Email delivery is not configured." }, { status: 503 });
  }
  try {
    const summary = await deliverPendingEmails();
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const reference = reportError("maintenance.email_delivery", error);
    return Response.json({ error: "Email delivery failed.", reference }, { status: 500 });
  }
}
