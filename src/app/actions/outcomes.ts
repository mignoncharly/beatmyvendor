"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireIdentity, requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const outcomeKind = z.enum(["still_discussing", "selected_vendor", "another_vendor", "stayed_current", "no_decision"]);

export async function reportDealOutcome(formData: FormData) {
  await requireOrganization("buyer");
  const introductionId = uuid.parse(formData.get("introductionId"));
  const outcome = outcomeKind.parse(formData.get("outcome"));
  const decided = outcome === "selected_vendor" || outcome === "another_vendor";
  const finalPrice = decided ? z.coerce.number().positive().parse(formData.get("finalAnnualPrice")) : null;
  const monthsRaw = formData.get("contractMonths");
  const contractMonths = monthsRaw ? z.coerce.number().int().positive().parse(monthsRaw) : null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_deal_outcome", { p_introduction_id: introductionId, p_outcome: outcome, p_final_annual_price: finalPrice, p_currency: null, p_contract_months: contractMonths });
  if (error) redirect("/buyer/introductions?error=outcome");
  revalidatePath("/buyer/introductions"); revalidatePath("/buyer");
  redirect("/buyer/introductions?outcome=recorded");
}

export async function respondDealOutcome(formData: FormData) {
  await requireOrganization("vendor");
  const introductionId = uuid.parse(formData.get("introductionId"));
  const agree = formData.get("agree") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_deal_outcome", { p_introduction_id: introductionId, p_agree: agree });
  if (error) redirect("/vendor/introductions?error=outcome");
  revalidatePath("/vendor/introductions");
  redirect(`/vendor/introductions?outcome=${agree ? "confirmed" : "disputed"}`);
}

export async function consentPublicWin(formData: FormData) {
  await requireIdentity();
  const introductionId = uuid.parse(formData.get("introductionId"));
  const consent = formData.get("consent") === "true";
  const displayName = z.string().trim().max(120).parse(formData.get("displayName") ?? "");
  const backTo = formData.get("backTo") === "vendor" ? "/vendor/introductions" : "/buyer/introductions";
  const supabase = await createClient();
  const { error } = await supabase.rpc("consent_public_win", { p_introduction_id: introductionId, p_display_name: displayName, p_consent: consent });
  if (error) redirect(`${backTo}?error=consent`);
  revalidatePath(backTo);
  redirect(`${backTo}?consent=${consent ? "recorded" : "withdrawn"}`);
}
