"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getIdentity } from "@/lib/auth";
import type { ActionState } from "@/lib/forms";
import { safeRelativePath } from "@/lib/site";

const schema = z.object({
  kind: z.enum(["buyer", "vendor"]),
  name: z.string().trim().min(2, "Company name is too short.").max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens."),
  contactName: z.string().trim().min(2, "Enter your name.").max(120)
});

export async function onboardOrganization(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const identity = await getIdentity();
  if (!identity) redirect("/login");

  const parsed = schema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    contactName: formData.get("contactName")
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const next = safeRelativePath(formData.get("next") as string | null, "");
  if (identity.organizations.some((organization) => organization.kind === parsed.data.kind)) {
    redirect(next || `/${parsed.data.kind}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("onboard_organization", {
    organization_kind: parsed.data.kind,
    organization_name: parsed.data.name,
    organization_slug: parsed.data.slug,
    contact_name: parsed.data.contactName
  });
  if (error) {
    if (error.code === "23505") return { error: "That workspace URL is already taken." };
    return { error: "We could not create the workspace. Please try again." };
  }
  redirect(next || `/${parsed.data.kind}`);
}
