"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireIdentity } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const optionalUuid=z.preprocess((value)=>value===""?undefined:value,z.string().uuid().optional());

export async function requestAccountDeletion(formData:FormData){
  await requireIdentity();
  z.literal("yes").parse(formData.get("acknowledge"));
  const supabase=await createClient();
  const {error}=await supabase.rpc("request_personal_data_action",{p_kind:"deletion"});
  if(error) throw new Error("Could not record the deletion request.");
  revalidatePath("/account/privacy");
}

export async function submitReport(formData:FormData){
  const identity=await requireIdentity();
  const duelId=optionalUuid.parse(formData.get("duelId"));
  const vendorId=optionalUuid.parse(formData.get("vendorOrganizationId"));
  if(!duelId&&!vendorId) throw new Error("Choose a Duel or vendor to report.");
  const reason=z.string().trim().min(3).max(160).parse(formData.get("reason"));
  const details=z.string().trim().max(2000).parse(formData.get("details")??"");
  const supabase=await createClient();
  const {error}=await supabase.from("reports").insert({reporter_user_id:identity.id,duel_id:duelId??null,vendor_organization_id:vendorId??null,reason,details:details||null});
  if(error) throw new Error("The report could not be submitted.");
  revalidatePath("/report");
}
