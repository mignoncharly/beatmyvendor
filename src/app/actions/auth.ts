"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { renderBrandedEmail } from "@/lib/email-templates";
import type { ActionState } from "@/lib/forms";
import { sendResendEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email("Enter a valid work email.").max(254);

export async function requestMagicLink(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const emailAddress = parsed.data.toLowerCase();

  try {
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("next", "/onboarding");
    const supabase = createAdminClient();
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: emailAddress,
      options: {
        redirectTo: callbackUrl.toString(),
        data: { locale: "en" }
      }
    });
    if (error || !data.properties.hashed_token) throw error || new Error("No authentication token returned.");

    callbackUrl.searchParams.set("token_hash", data.properties.hashed_token);
    callbackUrl.searchParams.set("type", "magiclink");
    const email = renderBrandedEmail("email_verification", {}, { actionUrl: callbackUrl.toString() });
    await sendResendEmail({
      to: emailAddress,
      subject: email.subject,
      html: email.html,
      text: email.text,
      templateKey: "email_verification",
      idempotencyKey: "vendorduel/auth/" + createHash("sha256").update(data.properties.hashed_token).digest("hex")
    });
  } catch {
    return { error: "We could not send the sign-in link. Please try again shortly." };
  }

  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data)}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
