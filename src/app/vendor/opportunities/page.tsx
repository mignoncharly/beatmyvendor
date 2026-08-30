import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Vendor opportunities" }; export const dynamic = "force-dynamic";
type Match = { duel_id: string; public_id: number; category_name: string; current_software: string; annual_spend: number; currency: string; seats: number; country_code: string; company_size: string; renewal_date: string | null; buyer_intent: string; submission_deadline: string; verification_badge: string | null; matched_product_id: string; matched_product_name: string };
const PAGE_SIZE = 24;
const filterKeys = ["software", "country", "intent", "minSpend", "verified"] as const;

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = await searchParams; const { organization } = await requireOrganization("vendor"); const supabase = await createClient();
  if (organization.vendorApproval !== "approved") return <DashboardShell area="Vendor" organization={organization.name}><div className="empty-panel"><h2>Marketplace access is locked.</h2><p>An admin must approve your workspace first.</p><Link href="/vendor/profile" className="button button-primary">Complete profile</Link></div></DashboardShell>;

  const { data } = await supabase.rpc("match_vendor_opportunities", {
    p_vendor_organization_id: organization.organizationId,
    p_software: filters.software?.trim() || null,
    p_country: filters.country?.trim() ? filters.country.trim().toUpperCase() : null,
    p_intent: filters.intent || null,
    p_verified: filters.verified === "true",
    p_min_spend: filters.minSpend ? Number(filters.minSpend) : null,
    p_after_deadline: filters.after_deadline || null,
    p_after_duel_id: filters.after_id || null,
    p_limit: PAGE_SIZE
  });
  const opportunities = (data ?? []) as Match[];
  const last = opportunities[opportunities.length - 1];
  const hasNext = opportunities.length === PAGE_SIZE && Boolean(last);
  const nextParams = new URLSearchParams();
  for (const key of filterKeys) if (filters[key]) nextParams.set(key, filters[key]!);
  if (last) { nextParams.set("after_deadline", last.submission_deadline); nextParams.set("after_id", last.duel_id); }
  const isPaged = Boolean(filters.after_deadline);

  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href="/vendor">← Vendor dashboard</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Opportunity marketplace</span><h1>Verified intent, no buyer exposure.</h1><p className="heading-copy">Only Duels your profile can actually replace, within your declared regions, currencies, and customer size. Buyer identity and competing prices stay private.</p></div><span className="badge badge-success">{opportunities.length}{hasNext ? "+" : ""} shown</span></div>
    <form className="filter-bar"><input name="software" defaultValue={filters.software} placeholder="Current software" /><input name="country" defaultValue={filters.country} placeholder="Country" maxLength={2} /><input name="minSpend" defaultValue={filters.minSpend} type="number" min="0" placeholder="Minimum spend" /><select name="intent" defaultValue={filters.intent ?? ""}><option value="">Any intent</option><option value="checking_market">Checking market</option><option value="good_offer">Good offer</option><option value="actively_looking">Actively looking</option><option value="must_switch_before_renewal">Must switch</option></select><label><input type="checkbox" name="verified" value="true" defaultChecked={filters.verified === "true"} /> Verified only</label><button className="button button-primary">Filter</button></form>
    <div className="opportunity-grid">{opportunities.map((item) => <Link href={`/vendor/opportunities/${item.duel_id}`} className="opportunity-card" key={item.duel_id}><div><span className="duel-number">DUEL #{item.public_id}</span>{item.verification_badge && <span className="badge badge-success">{item.verification_badge.replaceAll("_", " ")}</span>}</div><h2>Replace {item.current_software}</h2><strong>{new Intl.NumberFormat("en", { style: "currency", currency: item.currency, maximumFractionDigits: 0 }).format(Number(item.annual_spend))}<small>/year</small></strong><ul><li>{item.seats} seats</li><li>{item.country_code}</li><li>{item.company_size} employees</li><li>{item.buyer_intent.replaceAll("_", " ")}</li></ul><span className="match-reason">Matched via {item.matched_product_name}</span><span className="text-link">Challenge this deal →</span></Link>)}{!opportunities.length && <div className="empty-panel"><h2>{isPaged ? "No further opportunities." : "No matching opportunities."}</h2><p>{isPaged ? "You have reached the end of the current matches." : "Add replacement products, or broaden the regions and currencies on your profile to widen matching."}</p><Link href="/vendor/profile" className="button button-secondary">Update matching profile</Link></div>}</div>
    {(hasNext || isPaged) && <div className="pagination-bar">{isPaged && <Link className="button button-secondary" href="/vendor/opportunities">← First page</Link>}{hasNext && <Link className="button button-primary" href={`/vendor/opportunities?${nextParams.toString()}`}>Next page →</Link>}</div>}
  </DashboardShell>;
}
