"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/forms";

const emailSchema = z.string().trim().email("Enter a valid work email.").max(254);

export async function requestMagicLink(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.toLowerCase(),
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      data: { locale: "en" }
    }
  });

  if (error) return { error: "We could not send the sign-in link. Please try again shortly." };
  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data)}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
