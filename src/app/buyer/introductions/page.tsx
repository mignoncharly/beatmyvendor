import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { reportDealOutcome, consentPublicWin } from "@/app/actions/outcomes";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Buyer introductions" }; export const dynamic = "force-dynamic";
type Win = { buyer_consented_at: string | null; vendor_consented_at: string | null; published_at: string | null; revoked_at: string | null };
type Outcome = { introduction_id: string; outcome: string; final_annual_price: number | null; vendor_response: string; confirmed_at: string | null; public_wins: Win | Win[] | null };
function one<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }

export default async function BuyerIntroductionsPage({ searchParams }: { searchParams: Promise<{ outcome?: string; consent?: string; error?: string }> }) {
  const { organization } = await requireOrganization("buyer"); const supabase = await createClient(); const notice = await searchParams;
  const { data: introductions } = await supabase.from("introductions").select("id,status,vendor_organization_id,introduced_at,created_at").eq("buyer_organization_id", organization.organizationId).order("created_at", { ascending: false });
  const unlocked = (introductions ?? []).filter((item) => item.status === "paid" || item.status === "introduced"); const ids = unlocked.map((item) => item.vendor_organization_id); const introIds = (introductions ?? []).map((item) => item.id);
  const [{ data: companies }, { data: profiles }, { data: outcomes }] = ids.length ? await Promise.all([
    supabase.from("organizations").select("id,name,website_url").in("id", ids),
    supabase.from("vendor_profiles").select("organization_id,contact_name,contact_email").in("organization_id", ids),
    supabase.from("deal_outcomes").select("introduction_id,outcome,final_annual_price,vendor_response,confirmed_at,public_wins(buyer_consented_at,vendor_consented_at,published_at,revoked_at)").in("introduction_id", introIds)
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const outcomeByIntro = new Map((outcomes ?? []).map((row) => [row.introduction_id, row as Outcome]));

  return <DashboardShell area="Buyer" organization={organization.name}><div className="page-back"><Link href="/buyer">← Buyer dashboard</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Introductions</span><h1>Selected conversations.</h1></div></div>
    {notice.outcome === "recorded" && <p className="notice-success" role="status">Outcome recorded. The vendor will confirm or dispute it.</p>}
    {notice.consent === "recorded" && <p className="notice-success" role="status">Publication consent recorded. An admin will verify before any win goes public.</p>}
    {notice.consent === "withdrawn" && <p className="notice-success" role="status">Publication consent withdrawn.</p>}
    {notice.error && <p className="form-error" role="alert">That action could not be completed. Check the details and try again.</p>}
    <div className="introduction-grid">{introductions?.map((intro) => {
      const company = companies?.find((item) => item.id === intro.vendor_organization_id); const profile = profiles?.find((item) => item.organization_id === intro.vendor_organization_id);
      const visible = intro.status === "paid" || intro.status === "introduced"; const outcome = outcomeByIntro.get(intro.id); const win = outcome ? one(outcome.public_wins) : undefined;
      const verified = Boolean(outcome?.confirmed_at); const isSaving = Boolean(outcome?.final_annual_price);
      return <article className="introduction-card" key={intro.id}><span className={`badge badge-${intro.status}`}>{intro.status.replaceAll("_", " ")}</span><h2>{visible ? company?.name : "Selected vendor"}</h2>
        {visible ? <><p>{profile?.contact_name ?? "Vendor contact"}</p><a href={`mailto:${profile?.contact_email}`}>{profile?.contact_email}</a>{company?.website_url && <a href={company.website_url} target="_blank" rel="noreferrer">Visit website ↗</a>}</> : <p>The vendor is completing the introduction payment. Contact details unlock immediately afterward.</p>}
        {intro.status === "introduced" && <div className="outcome-block">
          {!outcome || (!verified && outcome.vendor_response !== "confirmed") ? <form action={reportDealOutcome} className="outcome-form">
            <input type="hidden" name="introductionId" value={intro.id} />
            <span className="outcome-title">{outcome ? "Update the outcome" : "Report the outcome"}</span>
            {outcome?.vendor_response === "disputed" && <small className="form-error">The vendor disputed the reported outcome. Please review and re-report.</small>}
            <select name="outcome" required defaultValue=""><option value="" disabled>Select outcome…</option><option value="selected_vendor">Signed with this vendor</option><option value="another_vendor">Chose another vendor</option><option value="stayed_current">Stayed on current software</option><option value="still_discussing">Still in discussion</option><option value="no_decision">No decision</option></select>
            <input name="finalAnnualPrice" type="number" min="1" step="0.01" placeholder="Final annual price (if signed)" />
            <input name="contractMonths" type="number" min="1" placeholder="Contract length (months)" />
            <button className="button button-secondary">Save outcome</button>
          </form> : !verified ? <p className="outcome-status">Outcome reported — vendor {outcome.vendor_response === "confirmed" ? "confirmed. Awaiting BeatMyVendor verification." : "response pending."}</p> : <div className="outcome-status">
            <p>Outcome verified ✓</p>
            {isSaving && (!win || win.revoked_at || !win.buyer_consented_at ? <form action={consentPublicWin} className="consent-form"><input type="hidden" name="introductionId" value={intro.id} /><input type="hidden" name="backTo" value="buyer" /><input type="hidden" name="consent" value="true" /><input name="displayName" placeholder="Public display name (e.g. A 40-seat fintech)" required maxLength={120} /><button className="button button-primary">Consent to publish win</button></form> : <div className="consent-status"><p>{win.published_at ? "Published as a verified win." : "Consent recorded — awaiting admin publication."}</p><form action={consentPublicWin}><input type="hidden" name="introductionId" value={intro.id} /><input type="hidden" name="backTo" value="buyer" /><input type="hidden" name="consent" value="false" /><input type="hidden" name="displayName" value="" /><button className="text-link">Withdraw consent</button></form></div>)}
          </div>}
        </div>}
      </article>; })}{!introductions?.length && <div className="empty-panel"><h2>No introductions yet.</h2><p>Select a challenge after comparing offers.</p><Link href="/buyer/offers" className="button button-primary">View offers</Link></div>}</div></DashboardShell>;
}
