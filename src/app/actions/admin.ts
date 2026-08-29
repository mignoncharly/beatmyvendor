"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function approveVendor(formData: FormData) {
  const admin = await requireAdmin();
  const organizationId = idSchema.parse(formData.get("organizationId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_profiles")
    .update({ approval_status: "approved", approved_at: new Date().toISOString(), approved_by: admin.id })
    .eq("organization_id", organizationId)
    .eq("approval_status", "pending");
  if (error) throw new Error("Vendor approval failed.");
  revalidatePath("/admin");
}

export async function rejectVendor(formData: FormData) {
  await requireAdmin();
  const organizationId = idSchema.parse(formData.get("organizationId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendor_profiles")
    .update({ approval_status: "rejected", approved_at: null, approved_by: null })
    .eq("organization_id", organizationId)
    .eq("approval_status", "pending");
  if (error) throw new Error("Vendor rejection failed.");
  revalidatePath("/admin");
}
