"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStripe, stripePriceId } from "@/lib/stripe";

export async function startIntroductionCheckout(formData: FormData) {
  const { identity, organization } = await requireOrganization("vendor");
  if (organization.vendorApproval !== "approved") redirect("/vendor?billing=approval-required");
  const selectionId = z.string().uuid().parse(formData.get("selectionId")); const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) redirect("/vendor/billing?error=configuration");
  const supabase = await createClient();
  const { data: paymentId, error: prepareError } = await supabase.rpc("prepare_introduction_payment", { p_selection_id: selectionId, p_vendor_organization_id: organization.organizationId });
  if (prepareError || typeof paymentId !== "string") redirect("/vendor/billing?error=payment");
  const { data: payment } = await supabase.from("payments").select("status,provider_checkout_session_id").eq("id", paymentId).single();
  if (payment?.status === "paid") redirect("/vendor/billing?paid=true");
  try {
    const stripe = getStripe();
    if (payment?.provider_checkout_session_id) { const existing = await stripe.checkout.sessions.retrieve(payment.provider_checkout_session_id); if (existing.status === "open" && existing.url) redirect(existing.url); }
    const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price: stripePriceId(), quantity: 1 }], customer_email: identity.email || undefined, client_reference_id: paymentId,
      metadata: { payment_id: paymentId, selection_id: selectionId, vendor_organization_id: organization.organizationId }, payment_intent_data: { metadata: { payment_id: paymentId, selection_id: selectionId } },
      success_url: `${siteUrl}/vendor/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${siteUrl}/vendor/billing?checkout=cancelled` }, { idempotencyKey: paymentId });
    if (!session.url) redirect("/vendor/billing?error=checkout");
    const { error: attachError } = await supabase.rpc("attach_stripe_checkout", { p_payment_id: paymentId, p_checkout_session_id: session.id, p_checkout_expires_at: new Date(session.expires_at * 1000).toISOString() });
    if (attachError) redirect("/vendor/billing?error=checkout"); redirect(session.url);
  } catch (error) { if (error && typeof error === "object" && "digest" in error) throw error; redirect("/vendor/billing?error=configuration"); }
}
