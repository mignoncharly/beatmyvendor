"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireIdentity } from "@/lib/auth";
import { clientIp, withinRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

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
  if(!(await withinRateLimit("report",identity.id,10,3600))) throw new Error("You have submitted several reports recently. Please wait before submitting another.");
  if(!(await verifyTurnstile(formData.get("cf-turnstile-response"),await clientIp()))) throw new Error("Please complete the verification challenge and try again.");
  const duelId=optionalUuid.parse(formData.get("duelId"));
  const vendorId=optionalUuid.parse(formData.get("vendorOrganizationId"));
  if(!duelId&&!vendorId) throw new Error("Choose a Duel or vendor to report.");
  const reason=z.string().trim().min(3).max(160).parse(formData.get("reason"));
  const details=z.string().trim().max(2000).parse(formData.get("details")??"");
  const supabase=await createClient();
  // Idempotency: an identical open report from the same user for the same target
  // within the last hour is treated as already received rather than duplicated.
  const targetColumn=duelId?"duel_id":"vendor_organization_id"; const targetValue=(duelId??vendorId) as string;
  const {data:existing}=await supabase.from("reports").select("id").eq("reporter_user_id",identity.id).eq("reason",reason).eq(targetColumn,targetValue).eq("status","open").gte("created_at",new Date(Date.now()-3_600_000).toISOString()).limit(1);
  if(existing&&existing.length){ redirect("/report?sent=1"); }
  const {error}=await supabase.from("reports").insert({reporter_user_id:identity.id,duel_id:duelId??null,vendor_organization_id:vendorId??null,reason,details:details||null});
  if(error) throw new Error("The report could not be submitted.");
  revalidatePath("/report");
  redirect("/report?sent=1");
}
