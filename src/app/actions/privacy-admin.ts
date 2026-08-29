"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function reviewDataRequest(formData:FormData){await requireAdmin();const supabase=await createClient();const {error}=await supabase.rpc("admin_review_data_request",{p_request_id:z.string().uuid().parse(formData.get("id")),p_status:z.enum(["processing","completed","rejected"]).parse(formData.get("status")),p_reason:z.string().trim().max(1000).parse(formData.get("reason")??"")});if(error)throw new Error("Data request update failed.");revalidatePath("/admin/privacy");}
