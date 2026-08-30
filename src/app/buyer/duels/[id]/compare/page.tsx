import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { selectBuyerOffer, startBuyerReview } from "@/app/actions/comparison";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Compare offers" }; export const dynamic = "force-dynamic";
type Feature = { coverage: "included" | "partial" | "not_included"; note: string | null; duel_requirements: { id: string; label: string; kind: string } | { id: string; label: string; kind: string }[] };
type Offer = { id: string; status: string; plan_name: string; annual_price: number; currency: string; seats_included: number; implementation_fee: number; migration_fee: number; contract_months: number; price_lock_months: number; valid_until: string; migration_included: boolean; onboarding_included: boolean; support_included: string; limitations: string | null; commercial_comment: string | null; vendor_products: { product_name: string } | { product_name: string }[]; offer_features: Feature[] };
function relationName(value: { product_name: string } | { product_name: string }[]) { return Array.isArray(value) ? value[0]?.product_name : value?.product_name; }
function money(value: number, currency: string) { return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
function requirementOf(feature: Feature) { return Array.isArray(feature.duel_requirements) ? feature.duel_requirements[0] : feature.duel_requirements; }

export default async function ComparePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ready?: string; selected?: string; error?: string }> }) {
  const { id } = await params; const notice = await searchParams; const { organization } = await requireOrganization("buyer"); const supabase = await createClient();
  const { data: duel } = await supabase.from("duels").select("id,public_id,status,annual_spend,currency,seats,submission_deadline,software_products(name),duel_requirements(id,label,kind),selections(offer_id)").eq("id", id).eq("buyer_organization_id", organization.organizationId).maybeSingle();
  if (!duel) notFound();
  const deadlinePassed = new Date(duel.submission_deadline) <= new Date();
  const canReadOffers = duel.status !== "open" || deadlinePassed;
  const { data: rawOffers } = canReadOffers ? await supabase.from("offers").select("id,status,plan_name,annual_price,currency,seats_included,implementation_fee,migration_fee,contract_months,price_lock_months,valid_until,migration_included,onboarding_included,support_included,limitations,commercial_comment,vendor_products(product_name),offer_features(coverage,note,duel_requirements(id,label,kind))").eq("duel_id", id).in("status", ["submitted","selected","not_selected"]).order("annual_price") : { data: [] };
  const offers = (rawOffers ?? []) as Offer[]; const requirements = (duel.duel_requirements ?? []) as { id: string; label: string; kind: string }[];
  const selection = Array.isArray(duel.selections) ? duel.selections[0] : duel.selections; const selectedOfferId = selection?.offer_id;
  const lowest = offers.length ? Math.min(...offers.map((offer) => Number(offer.annual_price))) : null;
  const longestLock = offers.length ? Math.max(...offers.map((offer) => offer.price_lock_months)) : null;
  const bestCoverage = offers.length ? Math.max(...offers.map((offer) => offer.offer_features.filter((feature) => feature.coverage === "included").length)) : null;
  const productRelation = Array.isArray(duel.software_products) ? duel.software_products[0] : duel.software_products;

  return <DashboardShell area="Buyer" organization={organization.name}><div className="page-back"><Link href={`/buyer/duels/${id}`}>← Duel #{duel.public_id}</Link></div>
    {notice.ready && <div className="notice-success">Submission window closed. {offers.length} challenge{offers.length === 1 ? " is" : "s are"} ready.</div>}{notice.selected && <div className="notice-success">Offer selected. The vendor will now complete the introduction payment.</div>}{notice.error === "stale" ? <p className="form-error">That offer has expired. Ask the vendor for a refreshed offer before selecting.</p> : notice.error && <p className="form-error">That action could not be completed. Refresh and check the duel status.</p>}
    <div className="dashboard-heading"><div><span className="eyebrow">Offer comparison</span><h1>{productRelation?.name}: the full table.</h1><p className="heading-copy">Objective labels highlight tradeoffs, never a winner. Your selection alone decides who earns the conversation.</p></div><span className={`badge badge-${duel.status}`}>{duel.status.replaceAll("_", " ")}</span></div>
    {duel.status === "open" && !deadlinePassed ? <div className="sealed-panel"><span>Sealed offers</span><h2>Every challenge opens at once.</h2><p>Vendors cannot see one another’s prices. Your inbox unlocks after {new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" }).format(new Date(duel.submission_deadline))}.</p></div> : duel.status === "open" ? <div className="empty-panel"><h2>The submission window has ended.</h2><p>Lock the vendor side and reveal every submitted challenge together.</p><form action={startBuyerReview}><input type="hidden" name="duelId" value={id} /><button className="button button-primary">Close window & compare</button></form></div> : !offers.length ? <div className="empty-panel"><h2>No submitted challenges.</h2><p>This duel closed without a vendor offer. Your current contract remains unchanged.</p></div> : <>
      <div className="comparison-scroll"><table className="comparison-table"><thead><tr><th>Comparison</th><th className="current-column">Current</th>{offers.map((offer) => <th className={selectedOfferId === offer.id ? "selected-column" : ""} key={offer.id}><span>{relationName(offer.vendor_products)}</span><small>{offer.plan_name}</small>{selectedOfferId === offer.id && <b>Selected</b>}</th>)}</tr></thead><tbody>
        <tr><th>Annual cost</th><td>{money(Number(duel.annual_spend), duel.currency)}</td>{offers.map((offer) => <td key={offer.id}><strong>{money(Number(offer.annual_price), offer.currency)}</strong>{Number(offer.annual_price) === lowest && <em>Lowest cost</em>}</td>)}</tr>
        <tr><th>Annual saving</th><td>—</td>{offers.map((offer) => { const saving = Number(duel.annual_spend) - Number(offer.annual_price); return <td key={offer.id} className={saving > 0 ? "positive-saving" : ""}><strong>{money(saving, offer.currency)}</strong><small>{((saving / Number(duel.annual_spend)) * 100).toFixed(1)}%</small></td>; })}</tr>
        <tr><th>Implementation</th><td>—</td>{offers.map((offer) => <td key={offer.id}>{Number(offer.implementation_fee) ? money(Number(offer.implementation_fee), offer.currency) : "Free"}</td>)}</tr>
        <tr><th>Migration</th><td>—</td>{offers.map((offer) => <td key={offer.id}>{offer.migration_included && !Number(offer.migration_fee) ? "Included" : money(Number(offer.migration_fee), offer.currency)}{offer.migration_included && !Number(offer.migration_fee) && <em>Free migration</em>}</td>)}</tr>
        <tr><th>Price lock</th><td>—</td>{offers.map((offer) => <td key={offer.id}>{offer.price_lock_months} months{offer.price_lock_months === longestLock && <em>Longest lock</em>}</td>)}</tr>
        <tr><th>Contract</th><td>Current</td>{offers.map((offer) => <td key={offer.id}>{offer.contract_months} months</td>)}</tr>
        <tr><th>Feature coverage</th><td>Current</td>{offers.map((offer) => { const included = offer.offer_features.filter((feature) => feature.coverage === "included").length; return <td key={offer.id}>{included}/{requirements.length} included{included === bestCoverage && <em>Best coverage</em>}</td>; })}</tr>
        {requirements.map((requirement) => <tr key={requirement.id}><th><small>{requirement.kind}</small>{requirement.label}</th><td>✓</td>{offers.map((offer) => { const feature = offer.offer_features.find((item) => requirementOf(item)?.id === requirement.id); return <td key={offer.id} title={feature?.note ?? undefined}><span className={`coverage coverage-${feature?.coverage ?? "not_included"}`}>{feature?.coverage === "included" ? "✓" : feature?.coverage === "partial" ? "~" : "×"}</span></td>; })}</tr>)}
        <tr><th>Support</th><td>Current</td>{offers.map((offer) => <td key={offer.id}>{offer.support_included}</td>)}</tr>
        <tr><th>Decision</th><td>Stay current</td>{offers.map((offer) => { const expired = new Date(offer.valid_until) <= new Date(); return <td key={offer.id}>{duel.status === "reviewing" ? expired ? <span className="offer-expired">Offer expired — request a refreshed offer</span> : <form action={selectBuyerOffer}><input type="hidden" name="duelId" value={id} /><input type="hidden" name="offerId" value={offer.id} /><button className="button button-primary">I’d like to talk</button></form> : selectedOfferId === offer.id ? <strong>Introduction pending</strong> : "Not selected"}</td>; })}</tr>
      </tbody></table></div>
      <p className="comparison-note">Annual saving compares your recurring annual spend (price plus recurring fees) against each offer’s recurring annual price. One-time implementation and migration fees are shown separately.</p>
    </>}
  </DashboardShell>;
}
