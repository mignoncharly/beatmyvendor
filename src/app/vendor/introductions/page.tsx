import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { respondDealOutcome, consentPublicWin } from "@/app/actions/outcomes";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Vendor introductions" }; export const dynamic = "force-dynamic";
type Win = { buyer_consented_at: string | null; vendor_consented_at: string | null; published_at: string | null; revoked_at: string | null };
type Outcome = { introduction_id: string; outcome: string; final_annual_price: number | null; vendor_response: string; confirmed_at: string | null; public_wins: Win | Win[] | null };
function one<T>(value: T | T[] | null | undefined): T | undefined { return Array.isArray(value) ? value[0] : value ?? undefined; }
const outcomeLabels: Record<string, string> = { selected_vendor: "Signed with you", another_vendor: "Chose another vendor", stayed_current: "Stayed on current software", still_discussing: "Still in discussion", no_decision: "No decision" };

export default async function VendorIntroductionsPage({ searchParams }: { searchParams: Promise<{ outcome?: string; consent?: string; error?: string }> }) {
  const { organization } = await requireOrganization("vendor"); const supabase = await createClient(); const notice = await searchParams;
  const { data: introductions } = await supabase.from("introductions").select("id,status,buyer_organization_id,introduced_at,created_at").eq("vendor_organization_id", organization.organizationId).order("created_at", { ascending: false });
  const unlocked = (introductions ?? []).filter((item) => item.status === "paid" || item.status === "introduced"); const ids = unlocked.map((item) => item.buyer_organization_id); const introIds = (introductions ?? []).map((item) => item.id);
  const [{ data: companies }, { data: profiles }, { data: outcomes }] = ids.length ? await Promise.all([
    supabase.from("organizations").select("id,name,website_url").in("id", ids),
    supabase.from("buyer_profiles").select("organization_id,contact_name,contact_email").in("organization_id", ids),
    supabase.from("deal_outcomes").select("introduction_id,outcome,final_annual_price,vendor_response,confirmed_at,public_wins(buyer_consented_at,vendor_consented_at,published_at,revoked_at)").in("introduction_id", introIds)
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const outcomeByIntro = new Map((outcomes ?? []).map((row) => [row.introduction_id, row as Outcome]));

  return <DashboardShell area="Vendor" organization={organization.name}><div className="page-back"><Link href="/vendor">← Vendor dashboard</Link></div><div className="dashboard-heading"><div><span className="eyebrow">Introductions</span><h1>Buyers who picked you.</h1></div></div>
    {notice.outcome === "confirmed" && <p className="notice-success" role="status">Outcome confirmed. BeatMyVendor will verify it.</p>}
    {notice.outcome === "disputed" && <p className="notice-success" role="status">Outcome disputed. The buyer can re-report.</p>}
    {notice.consent === "recorded" && <p className="notice-success" role="status">Publication consent recorded.</p>}
    {notice.consent === "withdrawn" && <p className="notice-success" role="status">Publication consent withdrawn.</p>}
    {notice.error && <p className="form-error" role="alert">That action could not be completed. Try again.</p>}
    <div className="introduction-grid">{introductions?.map((intro) => {
      const company = companies?.find((item) => item.id === intro.buyer_organization_id); const profile = profiles?.find((item) => item.organization_id === intro.buyer_organization_id);
      const visible = intro.status === "paid" || intro.status === "introduced"; const outcome = outcomeByIntro.get(intro.id); const win = outcome ? one(outcome.public_wins) : undefined; const verified = Boolean(outcome?.confirmed_at); const isSaving = Boolean(outcome?.final_annual_price);
      return <article className="introduction-card" key={intro.id}><span className={`badge badge-${intro.status}`}>{intro.status.replaceAll("_", " ")}</span><h2>{visible ? company?.name : "Buyer identity locked"}</h2>
        {visible ? <><p>{profile?.contact_name ?? "Buyer contact"}</p><a href={`mailto:${profile?.contact_email}`}>{profile?.contact_email}</a>{company?.website_url && <a href={company.website_url} target="_blank" rel="noreferrer">Visit website ↗</a>}</> : <p>Pay the one-time introduction fee to unlock buyer contact details.</p>}
        {intro.status === "introduced" && outcome && <div className="outcome-block">
          <span className="outcome-title">Buyer reported: {outcomeLabels[outcome.outcome] ?? outcome.outcome.replaceAll("_", " ")}</span>
          {!verified && outcome.vendor_response === "pending" ? <div className="outcome-actions"><form action={respondDealOutcome}><input type="hidden" name="introductionId" value={intro.id} /><input type="hidden" name="agree" value="true" /><button className="button button-primary">Confirm outcome</button></form><form action={respondDealOutcome}><input type="hidden" name="introductionId" value={intro.id} /><input type="hidden" name="agree" value="false" /><button className="button button-secondary">Dispute</button></form></div>
            : !verified ? <p className="outcome-status">You {outcome.vendor_response} the outcome. Awaiting verification.</p>
            : <div className="outcome-status"><p>Outcome verified ✓</p>{isSaving && (win?.buyer_consented_at && !win.revoked_at ? (win.vendor_consented_at ? <p>{win.published_at ? "Published — your company name is shown." : "You consented to show your company name."}</p> : <form action={consentPublicWin} className="consent-form"><input type="hidden" name="introductionId" value={intro.id} /><input type="hidden" name="backTo" value="vendor" /><input type="hidden" name="consent" value="true" /><input name="displayName" placeholder="Your company name for the public win" required maxLength={120} /><button className="button button-primary">Consent to be named</button></form>) : <p className="outcome-status">The buyer has not yet consented to publish this win.</p>)}</div>}
        </div>}
      </article>; })}{!introductions?.length && <div className="empty-panel"><h2>No introductions yet.</h2><p>Selected challenges will appear here.</p></div>}</div></DashboardShell>;
}
