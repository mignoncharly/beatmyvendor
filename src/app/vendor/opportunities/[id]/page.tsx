import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
export const metadata: Metadata = { title: "Opportunity" }; export const dynamic = "force-dynamic";
export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { organization } = await requireOrganization("vendor"); const supabase = await createClient();
  const [{ data }, { data: products }, { data: requirements }, { data: offer }] = await Promise.all([
    supabase.rpc("get_vendor_opportunity", { p_duel_id: id }),
    supabase.rpc("get_matching_vendor_products", { p_duel_id: id, p_vendor_organization_id: organization.organizationId }),
    supabase.from("duel_requirements").select("id,kind,label,is_required").eq("duel_id", id).order("kind").order("label"),
    supabase.from("offers").select("id,status").eq("duel_id", id).eq("vendor_organization_id", organization.organizationId).maybeSingle()
  ]);
  const opportunity = data?.[0]; if (!opportunity) notFound();
  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href="/vendor/opportunities">← Opportunities</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Anonymous Duel #{opportunity.public_id}</span><h1>Challenge {opportunity.current_software}.</h1><p className="heading-copy">This buyer is verified. Their identity and every competing offer stay hidden throughout submission.</p></div><span className="badge badge-success">{opportunity.verification_badge?.replaceAll("_", " ") ?? "Open"}</span></div>
    <div className="metric-grid"><article><span>Annual spend</span><strong>{new Intl.NumberFormat("en", { style: "currency", currency: opportunity.currency, maximumFractionDigits: 0 }).format(Number(opportunity.annual_spend))}</strong></article><article><span>Seats</span><strong>{opportunity.seats}</strong></article><article><span>Country</span><strong>{opportunity.country_code}</strong></article><article><span>Deadline</span><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(opportunity.submission_deadline))}</strong></article></div>
    <section className="detail-card"><span className="card-kicker">Buyer requirements</span><h2>What your offer must cover</h2><ul className="requirement-list">{requirements?.map((item) => <li key={item.id}><span>{item.kind}</span>{item.label}</li>)}</ul></section>
    <div className="opportunity-cta"><div><strong>{products?.length ? `${products.length} eligible product${products.length > 1 ? "s" : ""}` : "No matching product"}</strong><span>Eligibility comes from your replacement profile.</span></div>{offer ? <Link className="button button-primary" href={`/vendor/opportunities/${id}/challenge`}>{offer.status === "draft" ? "Continue draft" : "View challenge"}</Link> : products?.length ? <Link className="button button-primary" href={`/vendor/opportunities/${id}/challenge`}>Build Challenge</Link> : <Link className="button button-secondary" href="/vendor/profile">Configure matching</Link>}</div>
  </DashboardShell>;
}
