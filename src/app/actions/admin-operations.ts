"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
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

export async function verifyDealOutcome(formData: FormData) {
  return call("admin_verify_deal_outcome", { p_outcome_id: uuid.parse(formData.get("id")), p_verified: formData.get("decision") === "verified", p_reason: reason.parse(formData.get("reason") ?? "") });
}

export async function publishWin(formData: FormData) {
  return call("admin_publish_win", { p_win_id: uuid.parse(formData.get("id")), p_publish: formData.get("decision") === "publish", p_reason: reason.parse(formData.get("reason") ?? "") });
}

type EvidenceDocument = { id: string; storage_path: string; deleted_at: string | null };

export async function signVerificationDocument(formData: FormData) {
  await requireAdmin();
  const verificationId = uuid.parse(formData.get("verificationId"));
  const documentId = uuid.parse(formData.get("documentId"));
  const supabase = await createClient();
  const { data: documents, error } = await supabase.rpc("admin_verification_documents", { p_verification_id: verificationId });
  if (error) throw new Error("Could not load verification evidence.");
  const document = ((documents ?? []) as EvidenceDocument[]).find((item) => item.id === documentId);
  if (!document || document.deleted_at) throw new Error("This evidence document is not available.");
  const { data: signed, error: signError } = await createAdminClient().storage.from("duel-verifications").createSignedUrl(document.storage_path, 300);
  if (signError || !signed?.signedUrl) throw new Error("Could not create a secure evidence link.");
  redirect(signed.signedUrl);
}

export async function refundPayment(formData: FormData) {
  await requireAdmin();
  const id = uuid.parse(formData.get("id"));
  const refundReason = z.string().trim().min(3).max(1000).parse(formData.get("reason") ?? "");
  const supabase = await createClient();
  // 1. Record refund intent first and obtain the payment intent to refund. If the
  //    process stops after this, the intent is durably logged for reconciliation.
  const { data: paymentIntentId, error: intentError } = await supabase.rpc("admin_initiate_refund", { p_payment_id: id, p_reason: refundReason });
  if (intentError || typeof paymentIntentId !== "string") throw new Error("This payment is not eligible for a Stripe refund.");
  // 2. Issue the refund. The idempotency key makes a retry safe.
  const refund = await getStripe().refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer", metadata: { beatmyvendor_payment_id: id, operator_reason: refundReason.slice(0, 500) } }, { idempotencyKey: `admin-refund-${id}` });
  // 3. Reconcile locally. This is idempotent, and the charge.refunded webhook
  //    reconciles authoritatively even if this step fails.
  const { error: recordError } = await supabase.rpc("admin_record_refund", { p_payment_id: id, p_provider_refund_id: refund.id, p_reason: refundReason });
  if (recordError) throw new Error("Stripe accepted the refund; local reconciliation will complete via webhook.");
  revalidatePath("/admin", "layout");
}
