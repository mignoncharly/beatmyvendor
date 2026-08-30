"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const reason = z.string().trim().max(1000).default("");

async function call(name: string, args: Record<string, unknown>) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Administrative operation failed.");
  revalidatePath("/admin", "layout");
}

export async function reviewVendor(formData: FormData) {
  const decision = z.enum(["approved", "rejected", "suspended"]).parse(formData.get("decision"));
  return call("admin_review_vendor", { p_organization_id: uuid.parse(formData.get("id")), p_decision: decision, p_reason: reason.parse(formData.get("reason") ?? "") });
}

export async function reviewVerification(formData: FormData) {
  const decision = z.enum(["verified", "rejected"]).parse(formData.get("decision"));
  const fields = formData.getAll("verifiedFields").map(String).filter(Boolean);
  return call("admin_review_verification", { p_verification_id: uuid.parse(formData.get("id")), p_decision: decision, p_verified_fields: decision === "verified" ? fields : [], p_reason: reason.parse(formData.get("reason") ?? "") });
}

export async function moderateDuel(formData: FormData) {
  return call("admin_moderate_duel", { p_duel_id: uuid.parse(formData.get("id")), p_decision: z.enum(["open", "rejected"]).parse(formData.get("decision")), p_reason: reason.parse(formData.get("reason") ?? "") });
}

export async function resolveReport(formData: FormData) {
  return call("admin_resolve_report", { p_report_id: uuid.parse(formData.get("id")), p_status: z.enum(["investigating", "resolved", "dismissed"]).parse(formData.get("status")), p_reason: reason.parse(formData.get("reason") ?? "") });
}

export async function setUserSuspension(formData: FormData) {
  return call("admin_set_user_suspension", { p_user_id: uuid.parse(formData.get("id")), p_suspended: z.enum(["true", "false"]).parse(formData.get("suspended")) === "true", p_reason: reason.parse(formData.get("reason") ?? "") });
}

export async function refundPayment(formData: FormData) {
  await requireAdmin();
  const id = uuid.parse(formData.get("id"));
  const refundReason = z.string().trim().min(3).max(1000).parse(formData.get("reason") ?? "");
  const supabase = await createClient();
  const { data: payment, error } = await supabase.from("payments").select("provider_payment_intent_id,status").eq("id", id).single();
  if (error || payment?.status !== "paid" || !payment.provider_payment_intent_id) throw new Error("This payment is not eligible for a Stripe refund.");
  const refund = await getStripe().refunds.create({ payment_intent: payment.provider_payment_intent_id, reason: "requested_by_customer", metadata: { beatmyvendor_payment_id: id, operator_reason: refundReason.slice(0, 500) } }, { idempotencyKey: `admin-refund-${id}` });
  const { error: recordError } = await supabase.rpc("admin_record_refund", { p_payment_id: id, p_provider_refund_id: refund.id, p_reason: refundReason });
  if (recordError) throw new Error("Stripe accepted the refund, but local reconciliation is pending.");
  revalidatePath("/admin", "layout");
}
