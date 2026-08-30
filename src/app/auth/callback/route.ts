import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { absoluteUrl, safeRelativePath } from "@/lib/site";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const requestedNext = safeRelativePath(request.nextUrl.searchParams.get("next"), "");
  const supabase = await createClient();

  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing authentication code") };

  if (result.error) {
    return NextResponse.redirect(new URL(absoluteUrl("/login?error=invalid-link")));
  }

  // Route brand-new accounts through onboarding (preserving their intent), and
  // return existing members to their destination or a sensible dashboard.
  let target = requestedNext;
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: memberships } = await supabase.from("organization_members").select("organizations(kind)").eq("user_id", user.id);
    const kinds = (memberships ?? []).flatMap((row) => {
      const org = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations;
      return org?.kind ? [org.kind] : [];
    });
    if (kinds.length === 0) {
      target = requestedNext ? `/onboarding?next=${encodeURIComponent(requestedNext)}` : "/onboarding";
    } else if (!target || target === "/onboarding") {
      target = kinds.includes("buyer") ? "/buyer" : "/vendor";
    }
  } else if (!target) {
    target = "/onboarding";
  }

  return NextResponse.redirect(new URL(absoluteUrl(target)));
}
