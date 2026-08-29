import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { DuelForm } from "@/components/duel-form";

export const metadata: Metadata = { title: "Edit Duel" };
export const dynamic = "force-dynamic";

export default async function EditDuelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organization } = await requireOrganization("buyer");
  const supabase = await createClient();
  const [{ data: duel }, { data: categories }, { data: products }] = await Promise.all([
    supabase.from("duels").select("*,duel_requirements(kind,label)").eq("id", id).eq("buyer_organization_id", organization.organizationId).maybeSingle(),
    supabase.from("categories").select("id,name").eq("is_active", true).order("name"),
    supabase.from("software_products").select("id,category_id,name").eq("is_active", true).order("name")
  ]);
  if (!duel) notFound();
  if (duel.status !== "draft" && duel.status !== "pending_verification") redirect(`/buyer/duels/${id}`);
  const requirements = (duel.duel_requirements ?? []) as { kind: "feature" | "integration"; label: string }[];
  return <DashboardShell area="Buyer" organization={organization.name}>
    <div className="page-back"><Link href={`/buyer/duels/${id}`}>← Duel #{duel.public_id}</Link></div>
    <div className="dashboard-heading"><div><span className="eyebrow">Edit Duel</span><h1>Keep the brief accurate.</h1><p className="heading-copy">Changes are allowed while the duel is a draft or awaiting verification. Live duels are locked.</p></div></div>
    <DuelForm categories={categories ?? []} products={products ?? []} initial={{
      id: duel.id, categoryId: duel.category_id, productId: duel.current_software_product_id, currentPlan: duel.current_plan,
      currentPrice: Number(duel.current_price), billingFrequency: duel.billing_frequency, currency: duel.currency, seats: duel.seats,
      ticketVolume: duel.approximate_ticket_volume, currentFees: Number(duel.current_fees), renewalDate: duel.renewal_date,
      contractMonths: duel.contract_months, countryCode: duel.country_code, companySize: duel.company_size,
      switchingTimeline: duel.switching_timeline, buyerIntent: duel.buyer_intent, privateComment: duel.private_comment,
      submissionDeadline: duel.submission_deadline,
      featureRequirements: requirements.filter((item) => item.kind === "feature").map((item) => item.label).join("\n"),
      integrationRequirements: requirements.filter((item) => item.kind === "integration").map((item) => item.label).join("\n")
    }} />
  </DashboardShell>;
}
