import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { VendorOfferForm } from "@/components/vendor-offer-form";
export const metadata: Metadata = { title: "Submit Challenge" }; export const dynamic = "force-dynamic";
export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { organization } = await requireOrganization("vendor"); const supabase = await createClient();
  const [{ data }, { data: products }, { data: requirements }, { data: offer }] = await Promise.all([
    supabase.rpc("get_vendor_opportunity", { p_duel_id: id }), supabase.rpc("get_matching_vendor_products", { p_duel_id: id, p_vendor_organization_id: organization.organizationId }),
    supabase.from("duel_requirements").select("id,kind,label").eq("duel_id", id).order("kind").order("label"),
    supabase.from("offers").select("*,offer_features(duel_requirement_id,coverage,note)").eq("duel_id", id).eq("vendor_organization_id", organization.organizationId).maybeSingle()
  ]);
  const opportunity = data?.[0]; if (!opportunity) notFound();
  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href={`/vendor/opportunities/${id}`}>← Anonymous Duel #{opportunity.public_id}</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Submit Challenge</span><h1>Your best offer, independently.</h1><p className="heading-copy">Once submitted, commercial terms lock and an immutable version is recorded. No vendor sees another vendor’s price.</p></div>{offer && <span className={`badge badge-${offer.status}`}>{offer.status}</span>}</div>
    {offer && offer.status !== "draft" ? <div className="empty-panel"><h2>This challenge is locked.</h2><p>Your submitted offer is preserved exactly as sent. It will become comparable to the buyer only when submissions close.</p><div className="metric-grid compact-metrics"><article><span>Annual offer</span><strong>{new Intl.NumberFormat("en", { style: "currency", currency: offer.currency, maximumFractionDigits: 0 }).format(Number(offer.annual_price))}</strong></article><article><span>Status</span><strong>{offer.status.replaceAll("_", " ")}</strong></article></div><Link href="/vendor/challenges" className="button button-secondary">My Challenges</Link></div> : products?.length ? <VendorOfferForm duelId={id} currency={opportunity.currency} currentSpend={Number(opportunity.annual_spend)} seats={opportunity.seats} requirements={requirements ?? []} products={products} initial={offer ?? {}} /> : <div className="empty-panel"><h2>No eligible product.</h2><p>Configure a product that can replace {opportunity.current_software} before challenging this duel.</p><Link href="/vendor/profile" className="button button-primary">Update profile</Link></div>}
  </DashboardShell>;
}
