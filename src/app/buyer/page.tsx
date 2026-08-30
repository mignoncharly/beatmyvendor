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

type Offer = { id: string; status: string; annual_price: number };
type Duel = { id: string; public_id: number; status: string; annual_spend: number; currency: string; seats: number; submission_deadline: string | null; created_at: string; software_products: { name: string } | { name: string }[] | null; categories: { name: string } | { name: string }[] | null; offers: Offer[]; selections: { offer_id: string }[] };
type OutcomeDuel = { annual_spend: number; currency: string };

function one<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }
const submittedStatuses = new Set(["submitted", "selected", "not_selected"]);

function nextAction(duel: Duel): { label: string; href: string } {
  const deadlinePassed = duel.submission_deadline ? new Date(duel.submission_deadline) <= new Date() : false;
  switch (duel.status) {
    case "draft": return { label: "Finish & submit for verification", href: `/buyer/duels/${duel.id}/edit` };
    case "pending_verification": return { label: "Awaiting verification review", href: `/buyer/duels/${duel.id}` };
    case "open": return deadlinePassed ? { label: "Close window & compare offers", href: `/buyer/duels/${duel.id}/compare` } : { label: "Offers open — watch for challenges", href: `/buyer/duels/${duel.id}` };
    case "reviewing": return { label: "Compare offers & select a vendor", href: `/buyer/duels/${duel.id}/compare` };
    case "selected": return { label: "Awaiting vendor introduction payment", href: `/buyer/duels/${duel.id}` };
    case "introduced": return { label: "Introduced — record the outcome", href: `/buyer/introductions` };
    default: return { label: "View duel", href: `/buyer/duels/${duel.id}` };
  }
}

export default async function BuyerPage() {
  const { organization } = await requireOrganization("buyer");
  const verified = organization.businessEmailStatus === "verified";
  const supabase = await createClient();
  const [{ data: rawDuels }, { data: rawOutcomes }] = await Promise.all([
    supabase.from("duels").select("id,public_id,status,annual_spend,currency,seats,submission_deadline,created_at,software_products(name),categories(name),offers(id,status,annual_price),selections(offer_id)").eq("buyer_organization_id", organization.organizationId).order("created_at", { ascending: false }),
    supabase.from("deal_outcomes").select("final_annual_price,confirmed_at,introductions!inner(buyer_organization_id,selections!inner(duels!inner(annual_spend,currency)))").eq("introductions.buyer_organization_id", organization.organizationId).not("confirmed_at", "is", null)
  ]);
  const duels = (rawDuels ?? []) as Duel[];
  const primaryCurrency = duels[0]?.currency ?? "EUR";
  const money = (value: number) => new Intl.NumberFormat("en", { style: "currency", currency: primaryCurrency, maximumFractionDigits: 0 }).format(value);

  const cards = duels.map((duel) => {
    const submitted = duel.offers.filter((offer) => submittedStatuses.has(offer.status));
    const bestOfferedPrice = submitted.length ? Math.min(...submitted.map((offer) => Number(offer.annual_price))) : null;
    const bestOfferedSaving = bestOfferedPrice !== null ? Number(duel.annual_spend) - bestOfferedPrice : null;
    return { duel, offerCount: submitted.length, bestOfferedSaving, action: nextAction(duel) };
  });
  const primaryDuels = duels.filter((duel) => duel.currency === primaryCurrency);
  const offeredSavings = primaryDuels.reduce((sum, duel) => {
    const submitted = duel.offers.filter((offer) => submittedStatuses.has(offer.status));
    if (duel.offers.some((offer) => offer.status === "selected") || !submitted.length) return sum;
    const best = Number(duel.annual_spend) - Math.min(...submitted.map((offer) => Number(offer.annual_price)));
    return best > 0 ? sum + best : sum;
  }, 0);
  const selectedSavings = primaryDuels.reduce((sum, duel) => {
    const selectedOffer = duel.offers.find((offer) => offer.status === "selected");
    if (!selectedOffer) return sum;
    const saving = Number(duel.annual_spend) - Number(selectedOffer.annual_price);
    return saving > 0 ? sum + saving : sum;
  }, 0);
  const confirmedSavings = ((rawOutcomes ?? []) as Array<{ final_annual_price: number | null; introductions: unknown }>).reduce((sum, row) => {
    const intro = one(row.introductions as { selections?: unknown } | Array<{ selections?: unknown }>);
    const selection = one(intro?.selections as { duels?: unknown } | Array<{ duels?: unknown }> | undefined);
    const duel = one(selection?.duels as OutcomeDuel | OutcomeDuel[] | undefined);
    const finalPrice = Number(row.final_annual_price ?? 0);
    return duel && duel.currency === primaryCurrency && finalPrice && Number(duel.annual_spend) > finalPrice ? sum + (Number(duel.annual_spend) - finalPrice) : sum;
  }, 0);

  return <DashboardShell area="Buyer" organization={organization.name}>
    <div className="dashboard-heading"><div><span className="eyebrow">Buyer command center</span><h1>Make your spend compete.</h1></div><span className={`badge ${verified ? "badge-success" : "badge-warning"}`}>{verified ? "Business verified" : "Verification needed"}</span></div>
    <div className="savings-summary"><article><span>Offered savings</span><strong>{money(offeredSavings)}</strong><small>Best current offer per open duel</small></article><article><span>Selected savings</span><strong>{money(selectedSavings)}</strong><small>Chosen offers, pending or introduced</small></article><article className="confirmed"><span>Confirmed savings</span><strong>{money(confirmedSavings)}</strong><small>Verified post-introduction outcomes</small></article></div>
    <div className="dashboard-toolbar"><div><strong>{duels.length} duels</strong><span>Drafts, verification, and live competitions</span></div><Link href="/buyer/duels/new" className="button button-primary">Start a Duel <span>→</span></Link></div>
    {cards.length ? <div className="duel-list">{cards.map(({ duel, offerCount, bestOfferedSaving, action }) => {
      const product = one(duel.software_products); const category = one(duel.categories);
      return <div className="duel-row-detailed" key={duel.id}>
        <Link href={`/buyer/duels/${duel.id}`} className="duel-row-main"><span className="duel-number">DUEL #{duel.public_id}</span><div><h2>{product?.name ?? "Software duel"}</h2><p>{category?.name} · {duel.seats} seats · {offerCount} offer{offerCount === 1 ? "" : "s"}</p></div><div className="duel-spend"><strong>{money(Number(duel.annual_spend))}</strong><span>annual spend</span></div>{bestOfferedSaving !== null && bestOfferedSaving > 0 ? <div className="duel-spend"><strong className="positive-saving">{money(bestOfferedSaving)}</strong><span>best saving</span></div> : <div className="duel-spend"><span>—</span></div>}<span className={`badge badge-${duel.status}`}>{statusLabels[duel.status] ?? duel.status}</span></Link>
        <Link href={action.href} className="duel-next-action">{action.label} →</Link>
      </div>;
    })}</div> : <div className="empty-panel"><span className="panel-number">01</span><h2>Your first duel starts here.</h2><p>Share your current software, spend, and must-haves. BeatMyVendor verifies the opportunity before qualified alternatives compete.</p><Link className="button button-primary" href="/buyer/duels/new">Start a Duel</Link></div>}
  </DashboardShell>;
}
