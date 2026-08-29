import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Vendor workspace" }; export const dynamic = "force-dynamic";
export default async function VendorPage() {
  const { organization } = await requireOrganization("vendor"); const approved = organization.vendorApproval === "approved"; const supabase = await createClient();
  const [{ count: productCount }, { data: offers }] = await Promise.all([
    supabase.from("vendor_products").select("id", { count: "exact", head: true }).eq("vendor_organization_id", organization.organizationId).eq("is_active", true),
    supabase.from("offers").select("id,status,annual_price,currency,created_at,vendor_products(product_name)").eq("vendor_organization_id", organization.organizationId).order("created_at", { ascending: false }).limit(5)
  ]);
  return <DashboardShell area="Vendor" organization={organization.name}>
    <div className="dashboard-heading"><div><span className="eyebrow">Vendor command center</span><h1>{approved ? "Compete where intent is real." : "We’re reviewing your company."}</h1></div><span className={`badge ${approved ? "badge-success" : "badge-warning"}`}>{organization.vendorApproval}</span></div>
    {!approved ? <div className="empty-panel"><span className="panel-number">02</span><h2>Approval protects every buyer.</h2><p>Complete your company and product profile while an admin reviews the workspace. Marketplace access unlocks after approval.</p><Link href="/vendor/profile" className="button button-primary">Complete company profile</Link></div> : <>
      <div className="metric-grid vendor-metrics"><article><span>Products configured</span><strong>{productCount ?? 0}</strong></article><article><span>Challenges</span><strong>{offers?.length ?? 0}</strong></article><article><span>Submitted</span><strong>{offers?.filter((offer) => offer.status === "submitted").length ?? 0}</strong></article><article><span>Selected</span><strong>{offers?.filter((offer) => offer.status === "selected").length ?? 0}</strong></article></div>
      <div className="dashboard-toolbar"><div><strong>Marketplace</strong><span>Only verified, active buyer opportunities</span></div><div className="row-actions"><Link href="/vendor/profile" className="button button-secondary">Company profile</Link><Link href="/vendor/opportunities" className="button button-primary">Browse opportunities</Link></div></div>
      <section className="detail-card"><span className="card-kicker">Recent challenges</span><h2>Your independent offers</h2>{offers?.length ? <div className="challenge-list">{offers.map((offer) => { const product = Array.isArray(offer.vendor_products) ? offer.vendor_products[0] : offer.vendor_products; return <div className="challenge-row" key={offer.id}><div><strong>{product?.product_name}</strong><span>{new Intl.NumberFormat("en", { style: "currency", currency: offer.currency, maximumFractionDigits: 0 }).format(Number(offer.annual_price))}</span></div><span className={`badge badge-${offer.status}`}>{offer.status.replaceAll("_", " ")}</span></div>; })}</div> : <p>No challenges yet. Configure a product, then find a matching duel.</p>}<Link className="text-link" href="/vendor/challenges">View all challenges →</Link></section>
    </>}
  </DashboardShell>;
}
