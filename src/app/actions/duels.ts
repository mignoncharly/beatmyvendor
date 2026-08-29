"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import type { ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { safeFilename, verificationDocumentError } from "@/lib/verification-document";

const optionalInteger = z.preprocess(
  (value) => value === "" || value == null ? null : value,
  z.coerce.number().int().nonnegative().nullable()
);

const optionalPositiveInteger = z.preprocess(
  (value) => value === "" || value == null ? null : value,
  z.coerce.number().int().positive().nullable()
);

const duelSchema = z.object({
  duelId: z.preprocess((value) => value || null, z.string().uuid().nullable()),
  categoryId: z.string().uuid("Choose a category."),
  productId: z.string().uuid("Choose your current software."),
  currentPlan: z.string().trim().max(120),
  currentPrice: z.coerce.number().positive("Enter a price greater than zero."),
  billingFrequency: z.enum(["monthly", "annual"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  seats: z.coerce.number().int().positive("Enter at least one seat."),
  ticketVolume: optionalInteger,
  currentFees: z.coerce.number().nonnegative("Fees cannot be negative."),
  renewalDate: z.string().trim(),
  contractMonths: optionalPositiveInteger,
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code."),
  companySize: z.string().trim().min(1, "Choose a company size.").max(80),
  switchingTimeline: z.string().trim().max(120),
  buyerIntent: z.enum(["checking_market", "good_offer", "actively_looking", "must_switch_before_renewal"]),
  privateComment: z.string().trim().max(2000, "Keep private notes under 2,000 characters."),
  submissionDeadline: z.string().min(1, "Choose an offer deadline."),
  featureRequirements: z.string().max(3000),
  integrationRequirements: z.string().max(3000),
  intent: z.enum(["draft", "submit"])
});

function requirementLines(value: string, kind: "feature" | "integration") {
  return [...new Set(value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].map((label) => ({
    kind,
    label,
    is_required: true
  }));
}

export async function saveBuyerDuel(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { identity, organization } = await requireOrganization("buyer");
  const parsed = duelSchema.safeParse({
    duelId: formData.get("duelId"),
    categoryId: formData.get("categoryId"),
    productId: formData.get("productId"),
    currentPlan: formData.get("currentPlan") ?? "",
    currentPrice: formData.get("currentPrice"),
    billingFrequency: formData.get("billingFrequency"),
    currency: formData.get("currency"),
    seats: formData.get("seats"),
    ticketVolume: formData.get("ticketVolume"),
    currentFees: formData.get("currentFees") ?? "0",
    renewalDate: formData.get("renewalDate") ?? "",
    contractMonths: formData.get("contractMonths"),
    countryCode: formData.get("countryCode"),
    companySize: formData.get("companySize"),
    switchingTimeline: formData.get("switchingTimeline") ?? "",
    buyerIntent: formData.get("buyerIntent"),
    privateComment: formData.get("privateComment") ?? "",
    submissionDeadline: formData.get("submissionDeadline"),
    featureRequirements: formData.get("featureRequirements") ?? "",
    integrationRequirements: formData.get("integrationRequirements") ?? "",
    intent: formData.get("intent")
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the duel details." };

  const deadline = new Date(parsed.data.submissionDeadline);
  if (Number.isNaN(deadline.getTime()) || deadline <= new Date()) return { error: "The offer deadline must be in the future." };
  if (parsed.data.renewalDate && Number.isNaN(Date.parse(parsed.data.renewalDate))) return { error: "Enter a valid renewal date." };

  const requirements = [
    ...requirementLines(parsed.data.featureRequirements, "feature"),
    ...requirementLines(parsed.data.integrationRequirements, "integration")
  ];
  if (parsed.data.intent === "submit" && requirements.length === 0) return { error: "Add at least one feature or integration before submitting." };
  if (requirements.some((requirement) => requirement.label.length > 120)) return { error: "Each requirement must be 120 characters or fewer." };

  const document = formData.get("spendDocument");
  const file = document instanceof File && document.size > 0 ? document : null;
  const documentError = verificationDocumentError(file);
  if (documentError) {
    return { error: documentError };
  }

  const supabase = await createClient();
  const { data: duelId, error } = await supabase.rpc("save_buyer_duel", {
    p_duel_id: parsed.data.duelId,
    p_buyer_organization_id: organization.organizationId,
    p_category_id: parsed.data.categoryId,
    p_current_software_product_id: parsed.data.productId,
    p_current_plan: parsed.data.currentPlan,
    p_current_price: parsed.data.currentPrice,
    p_billing_frequency: parsed.data.billingFrequency,
    p_currency: parsed.data.currency,
    p_seats: parsed.data.seats,
    p_approximate_ticket_volume: parsed.data.ticketVolume,
    p_current_fees: parsed.data.currentFees,
    p_renewal_date: parsed.data.renewalDate || null,
    p_contract_months: parsed.data.contractMonths,
    p_country_code: parsed.data.countryCode,
    p_company_size: parsed.data.companySize,
    p_switching_timeline: parsed.data.switchingTimeline,
    p_buyer_intent: parsed.data.buyerIntent,
    p_private_comment: parsed.data.privateComment,
    p_submission_deadline: deadline.toISOString(),
    p_requirements: requirements,
    p_submit: parsed.data.intent === "submit"
  });
  if (error || typeof duelId !== "string") {
    return { error: error?.message.includes("no longer be edited") ? "This duel can no longer be edited." : "We could not save the duel. Please review the details and try again." };
  }

  if (file) {
    const storagePath = `${organization.organizationId}/${duelId}/${randomUUID()}-${safeFilename(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("duel-verifications").upload(storagePath, file, {
      contentType: file.type,
      upsert: false
    });
    if (uploadError) return { error: "The duel was saved, but the spend document could not be uploaded. You can retry from the duel page." };

    const { error: metadataError } = await supabase.from("duel_documents").insert({
      duel_id: duelId,
      uploaded_by: identity.id,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 255),
      mime_type: file.type,
      size_bytes: file.size
    });
    if (metadataError) {
      await supabase.storage.from("duel-verifications").remove([storagePath]);
      return { error: "The duel was saved, but the spend document could not be registered. Please retry." };
    }

    const { data: existingSpendVerification } = await supabase
      .from("duel_verifications")
      .select("id")
      .eq("duel_id", duelId)
      .eq("verification_type", "spend")
      .maybeSingle();
    if (!existingSpendVerification) {
      await supabase.from("duel_verifications").insert({
        duel_id: duelId,
        verification_type: "spend",
        status: "pending",
        verified_fields: []
      });
    }
  }

  revalidatePath("/buyer");
  revalidatePath(`/buyer/duels/${duelId}`);
  redirect(`/buyer/duels/${duelId}?saved=${parsed.data.intent}`);
}
