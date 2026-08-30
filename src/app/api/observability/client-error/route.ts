import { reportError } from "@/lib/observability";

export const runtime = "nodejs";

// Lightweight beacon so client-side render/runtime failures surface with a
// correlation id alongside server errors. Payload is treated as untrusted and
// redacted by reportError.
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { message?: unknown; digest?: unknown; path?: unknown };
    const message = typeof body.message === "string" ? body.message.slice(0, 500) : "Client error";
    const digest = typeof body.digest === "string" ? body.digest.slice(0, 100) : undefined;
    const path = typeof body.path === "string" ? body.path.slice(0, 200) : undefined;
    reportError("client.error_boundary", new Error(message), { digest, path });
  } catch {
    // Never let the beacon fail loudly.
  }
  return Response.json({ received: true });
}
