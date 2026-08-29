"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

export async function startBuyerReview(formData: FormData) {
  const { organization } = await requireOrganization("buyer");
  const duelId = idSchema.parse(formData.get("duelId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_buyer_review", { p_duel_id: duelId });
  if (error) redirect(`/buyer/duels/${duelId}/compare?error=not-ready`);
  revalidatePath("/buyer"); revalidatePath("/buyer/offers"); revalidatePath(`/buyer/duels/${duelId}`);
  redirect(`/buyer/duels/${duelId}/compare?ready=true&workspace=${organization.organizationId}`);
}

export async function selectBuyerOffer(formData: FormData) {
  await requireOrganization("buyer");
  const duelId = idSchema.parse(formData.get("duelId")); const offerId = idSchema.parse(formData.get("offerId"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("select_buyer_offer", { p_duel_id: duelId, p_offer_id: offerId });
  if (error) redirect(`/buyer/duels/${duelId}/compare?error=selection`);
  revalidatePath("/buyer"); revalidatePath("/buyer/offers"); revalidatePath(`/buyer/duels/${duelId}`); revalidatePath(`/buyer/duels/${duelId}/compare`);
  redirect(`/buyer/duels/${duelId}/compare?selected=${offerId}`);
}
