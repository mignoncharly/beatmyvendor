import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Vendor opportunities" }; export const dynamic = "force-dynamic";
type Opportunity = { duel_id: string; public_id: number; category_name: string; current_software: string; annual_spend: number; currency: string; seats: number; country_code: string; company_size: string; renewal_date: string | null; buyer_intent: string; submission_deadline: string; verification_badge: string | null };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = await searchParams; const { organization } = await requireOrganization("vendor"); const supabase = await createClient();
  if (organization.vendorApproval !== "approved") return <DashboardShell area="Vendor" organization={organization.name}><div className="empty-panel"><h2>Marketplace access is locked.</h2><p>An admin must approve your workspace first.</p><Link href="/vendor/profile" className="button button-primary">Complete profile</Link></div></DashboardShell>;
  const [{ data }, { data: replacementRows }] = await Promise.all([
    supabase.rpc("list_vendor_opportunities"),
    supabase.from("vendor_product_replacements").select("replaces_software_product_id,vendor_products!inner(vendor_organization_id)").eq("vendor_products.vendor_organization_id", organization.organizationId)
  ]);
  const replacementIds = new Set((replacementRows ?? []).map((row) => row.replaces_software_product_id));
  const { data: replacementProducts } = replacementIds.size ? await supabase.from("software_products").select("id,name").in("id", [...replacementIds]) : { data: [] };
  const matchingNames = new Set((replacementProducts ?? []).map((product) => product.name));
  let opportunities = (data ?? []) as Opportunity[];
  if (filters.software) opportunities = opportunities.filter((item) => item.current_software.toLowerCase().includes(filters.software!.toLowerCase()));
  if (filters.country) opportunities = opportunities.filter((item) => item.country_code === filters.country!.toUpperCase());
  if (filters.intent) opportunities = opportunities.filter((item) => item.buyer_intent === filters.intent);
  if (filters.verified === "true") opportunities = opportunities.filter((item) => Boolean(item.verification_badge));
  if (filters.minSpend) opportunities = opportunities.filter((item) => Number(item.annual_spend) >= Number(filters.minSpend));
  if (filters.matching !== "false") opportunities = opportunities.filter((item) => matchingNames.has(item.current_software));
  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href="/vendor">← Vendor dashboard</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Opportunity marketplace</span><h1>Verified intent, no buyer exposure.</h1><p className="heading-copy">Buyer identity and competing prices remain private. Matching defaults to products your profile declares it can replace.</p></div><span className="badge badge-success">{opportunities.length} open</span></div>
    <form className="filter-bar"><input name="software" defaultValue={filters.software} placeholder="Current software" /><input name="country" defaultValue={filters.country} placeholder="Country" maxLength={2} /><input name="minSpend" defaultValue={filters.minSpend} type="number" min="0" placeholder="Minimum spend" /><select name="intent" defaultValue={filters.intent ?? ""}><option value="">Any intent</option><option value="checking_market">Checking market</option><option value="good_offer">Good offer</option><option value="actively_looking">Actively looking</option><option value="must_switch_before_renewal">Must switch</option></select><label><input type="checkbox" name="verified" value="true" defaultChecked={filters.verified === "true"} /> Verified only</label><label><input type="checkbox" name="matching" value="false" defaultChecked={filters.matching === "false"} /> Show all</label><button className="button button-primary">Filter</button></form>
    <div className="opportunity-grid">{opportunities.map((item) => <Link href={`/vendor/opportunities/${item.duel_id}`} className="opportunity-card" key={item.duel_id}><div><span className="duel-number">DUEL #{item.public_id}</span>{item.verification_badge && <span className="badge badge-success">{item.verification_badge.replaceAll("_", " ")}</span>}</div><h2>Replace {item.current_software}</h2><strong>{new Intl.NumberFormat("en", { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(Number(item.annual_spend))}<small>/year</small></strong><ul><li>{item.seats} seats</li><li>{item.country_code}</li><li>{item.company_size} employees</li><li>{item.buyer_intent.replaceAll("_", " ")}</li></ul><span className="text-link">Challenge this deal →</span></Link>)}{!opportunities.length && <div className="empty-panel"><h2>No matching opportunities.</h2><p>Adjust filters or add more replacement products to your company profile.</p><Link href="/vendor/profile" className="button button-secondary">Update matching profile</Link></div>}</div>
  </DashboardShell>;
}
