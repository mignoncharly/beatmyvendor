"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import type { ActionState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const optionalPositiveInteger = z.preprocess((value) => value === "" || value == null ? null : value, z.coerce.number().int().positive().nullable());

const profileSchema = z.object({
  websiteUrl: z.string().trim().url("Enter a valid website URL."),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code."),
  companySize: z.string().trim().min(1), description: z.string().trim().min(20, "Add at least 20 characters about your product.").max(1500),
  minimumCustomerSize: optionalPositiveInteger, maximumCustomerSize: optionalPositiveInteger,
  countriesServed: z.string().max(500), currencies: z.string().max(200), contactName: z.string().trim().min(2).max(120),
  softwareProductId: z.string().uuid("Choose your product."), productName: z.string().trim().min(2).max(160),
  productUrl: z.string().trim().url("Enter a valid product URL.")
});

function codes(value: string, length: number) { return [...new Set(value.split(/[,\s]+/).map((code) => code.trim().toUpperCase()).filter((code) => code.length === length))]; }

export async function saveVendorProfile(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { organization } = await requireOrganization("vendor");
  if (!(["owner", "admin"] as string[]).includes(organization.membershipRole)) return { error: "Only workspace owners and admins can edit the marketplace profile." };
  const parsed = profileSchema.safeParse(Object.fromEntries(["websiteUrl","countryCode","companySize","description","minimumCustomerSize","maximumCustomerSize","countriesServed","currencies","contactName","softwareProductId","productName","productUrl"].map((key) => [key, formData.get(key) ?? ""])));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the company profile." };
  if (parsed.data.minimumCustomerSize && parsed.data.maximumCustomerSize && parsed.data.maximumCustomerSize < parsed.data.minimumCustomerSize) return { error: "Maximum customer size must be at least the minimum." };
  const replacements = formData.getAll("replacementIds").map(String).filter((value) => z.string().uuid().safeParse(value).success);
  if (!replacements.length) return { error: "Choose at least one product your team can replace." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("configure_vendor_marketplace", {
    p_vendor_organization_id: organization.organizationId, p_website_url: parsed.data.websiteUrl,
    p_country_code: parsed.data.countryCode, p_company_size: parsed.data.companySize, p_description: parsed.data.description,
    p_minimum_customer_size: parsed.data.minimumCustomerSize, p_maximum_customer_size: parsed.data.maximumCustomerSize,
    p_countries_served: codes(parsed.data.countriesServed, 2), p_currencies: codes(parsed.data.currencies, 3),
    p_migration_support: formData.get("migrationSupport") === "on", p_contact_name: parsed.data.contactName,
    p_software_product_id: parsed.data.softwareProductId, p_product_name: parsed.data.productName,
    p_product_url: parsed.data.productUrl, p_replaces_software_product_ids: replacements
  });
  if (error) return { error: "We could not save the marketplace profile. Check that every replacement is a direct competitor." };
  revalidatePath("/vendor"); revalidatePath("/vendor/profile"); revalidatePath("/vendor/opportunities");
  return { message: "Marketplace profile saved." };
}

const offerSchema = z.object({
  offerId: z.preprocess((value) => value || null, z.string().uuid().nullable()), duelId: z.string().uuid(), vendorProductId: z.string().uuid("Choose an eligible product."),
  planName: z.string().trim().min(2).max(160), annualPrice: z.coerce.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  seatsIncluded: z.coerce.number().int().positive(), implementationFee: z.coerce.number().nonnegative(), migrationFee: z.coerce.number().nonnegative(),
  contractMonths: z.coerce.number().int().positive(), priceLockMonths: z.coerce.number().int().nonnegative(), validUntil: z.string().min(1),
  supportIncluded: z.string().trim().min(2).max(500), limitations: z.string().trim().max(1500), commercialComment: z.string().trim().max(1000), intent: z.enum(["draft","submit"])
});

export async function saveVendorOffer(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { organization } = await requireOrganization("vendor");
  if (organization.vendorApproval !== "approved") return { error: "Your vendor workspace must be approved before submitting challenges." };
  const parsed = offerSchema.safeParse({
    offerId: formData.get("offerId"), duelId: formData.get("duelId"), vendorProductId: formData.get("vendorProductId"), planName: formData.get("planName"),
    annualPrice: formData.get("annualPrice"), currency: formData.get("currency"), seatsIncluded: formData.get("seatsIncluded"),
    implementationFee: formData.get("implementationFee") ?? 0, migrationFee: formData.get("migrationFee") ?? 0,
    contractMonths: formData.get("contractMonths"), priceLockMonths: formData.get("priceLockMonths"), validUntil: formData.get("validUntil"),
    supportIncluded: formData.get("supportIncluded"), limitations: formData.get("limitations") ?? "", commercialComment: formData.get("commercialComment") ?? "", intent: formData.get("intent")
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the challenge details." };
  const validUntil = new Date(parsed.data.validUntil); if (Number.isNaN(validUntil.getTime()) || validUntil <= new Date()) return { error: "Offer validity must end in the future." };
  const coverage = [...formData.entries()].filter(([key]) => key.startsWith("coverage_")).map(([key, value]) => ({ requirement_id: key.slice(9), coverage: String(value), note: String(formData.get(`note_${key.slice(9)}`) ?? "") }));
  const supabase = await createClient();
  const { data: offerId, error } = await supabase.rpc("save_vendor_offer", {
    p_offer_id: parsed.data.offerId, p_duel_id: parsed.data.duelId, p_vendor_organization_id: organization.organizationId,
    p_vendor_product_id: parsed.data.vendorProductId, p_plan_name: parsed.data.planName, p_annual_price: parsed.data.annualPrice,
    p_currency: parsed.data.currency, p_seats_included: parsed.data.seatsIncluded, p_implementation_fee: parsed.data.implementationFee,
    p_migration_fee: parsed.data.migrationFee, p_contract_months: parsed.data.contractMonths, p_price_lock_months: parsed.data.priceLockMonths,
    p_valid_until: validUntil.toISOString(), p_migration_included: formData.get("migrationIncluded") === "on",
    p_onboarding_included: formData.get("onboardingIncluded") === "on", p_support_included: parsed.data.supportIncluded,
    p_limitations: parsed.data.limitations, p_commercial_comment: parsed.data.commercialComment, p_feature_coverage: coverage,
    p_accuracy_confirmed: formData.get("accuracyConfirmed") === "on", p_submit: parsed.data.intent === "submit"
  });
  if (error || typeof offerId !== "string") return { error: error?.message.includes("coverage") ? "Answer every requirement before submitting." : "We could not save this challenge. The duel may have closed or the product may not be eligible." };
  revalidatePath("/vendor"); revalidatePath("/vendor/challenges");
  redirect(`/vendor/challenges?status=${parsed.data.intent}&offer=${offerId}`);
}
