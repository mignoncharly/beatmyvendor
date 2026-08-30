import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Buyer workspace" };
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  draft: "Draft", pending_verification: "Verification pending", open: "Accepting offers",
  reviewing: "Review offers", selected: "Vendor selected", introduced: "Introduction ready",
  converted: "Deal confirmed", closed: "Closed", expired: "Expired", rejected: "Needs attention"
};

export default async function BuyerPage() {
  const { organization } = await requireOrganization("buyer");
  const verified = organization.businessEmailStatus === "verified";
  const supabase = await createClient();
  const { data: duels } = await supabase.from("duels")
    .select("id,public_id,status,annual_spend,currency,seats,submission_deadline,created_at,software_products(name),categories(name)")
    .eq("buyer_organization_id", organization.organizationId).order("created_at", { ascending: false });

  return <DashboardShell area="Buyer" organization={organization.name}>
    <div className="dashboard-heading"><div><span className="eyebrow">Buyer command center</span><h1>Make your spend compete.</h1></div><span className={`badge ${verified ? "badge-success" : "badge-warning"}`}>{verified ? "Business verified" : "Verification needed"}</span></div>
    <div className="dashboard-toolbar"><div><strong>{duels?.length ?? 0} duels</strong><span>Drafts, verification, and live competitions</span></div><Link href="/buyer/duels/new" className="button button-primary">Start a Duel <span>→</span></Link></div>
    {duels?.length ? <div className="duel-list">{duels.map((duel) => {
      const product = Array.isArray(duel.software_products) ? duel.software_products[0] : duel.software_products;
      const category = Array.isArray(duel.categories) ? duel.categories[0] : duel.categories;
      return <Link href={`/buyer/duels/${duel.id}`} className="duel-row" key={duel.id}>
        <span className="duel-number">DUEL #{duel.public_id}</span><div><h2>{product?.name ?? "Software duel"}</h2><p>{category?.name} · {duel.seats} seats</p></div>
        <div className="duel-spend"><strong>{new Intl.NumberFormat("en", { style: "currency", currency: duel.currency, maximumFractionDigits: 0 }).format(Number(duel.annual_spend))}</strong><span>annual spend</span></div>
        <span className={`badge badge-${duel.status}`}>{statusLabels[duel.status] ?? duel.status}</span><span aria-hidden="true">→</span>
      </Link>;
    })}</div> : <div className="empty-panel"><span className="panel-number">01</span><h2>Your first duel starts here.</h2><p>Share your current software, spend, and must-haves. BeatMyVendor verifies the opportunity before qualified alternatives compete.</p><Link className="button button-primary" href="/buyer/duels/new">Start a Duel</Link></div>}
  </DashboardShell>;
}
