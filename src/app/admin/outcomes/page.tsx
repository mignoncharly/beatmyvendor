import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { verifyDealOutcome, publishWin } from "@/app/actions/admin-operations";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "@/components/admin-frame";
import s from "../admin.module.css";

export const metadata: Metadata = { title: "Deal outcomes" }; export const dynamic = "force-dynamic";
type Win = { id: string; slug: string; published_at: string | null; revoked_at: string | null; buyer_consented_at: string | null; vendor_consented_at: string | null };

export default async function OutcomesPage() {
  await requireAdmin(); const supabase = await createClient();
  const [{ data: outcomes }, { data: introductions }] = await Promise.all([
    supabase.from("deal_outcomes").select("id,introduction_id,outcome,final_annual_price,currency,contract_months,vendor_response,confirmed_at,created_at,public_wins(id,slug,published_at,revoked_at,buyer_consented_at,vendor_consented_at)").order("created_at", { ascending: false }).limit(100),
    supabase.from("introductions").select("id,status,created_at").in("status", ["introduced", "paid"]).order("created_at", { ascending: false }).limit(100)
  ]);
  const recorded = new Set(outcomes?.map((o) => o.introduction_id)); const pending = introductions?.filter((i) => !recorded.has(i.id)) || [];
  return <AdminFrame><div className={s.navSpace} /><div className="dashboard-heading"><div><span className="eyebrow">Marketplace outcomes</span><h1>Deal outcomes</h1></div><span className="badge badge-warning">{pending.length} awaiting</span></div>{pending.length > 0 && <div className="notice-success">{pending.length} paid or introduced deal{pending.length === 1 ? " is" : "s are"} awaiting buyer outcome report.</div>}
    <div className={s.tableWrap}><table className={s.table}><thead><tr><th>Recorded</th><th>Outcome</th><th>Final price</th><th>Vendor</th><th>Verification</th><th>Public win</th><th>Action</th></tr></thead><tbody>{outcomes?.map((outcome) => {
      const win = (Array.isArray(outcome.public_wins) ? outcome.public_wins[0] : outcome.public_wins) as Win | undefined;
      const canVerify = outcome.vendor_response === "confirmed" && !outcome.confirmed_at;
      const canPublish = win && win.buyer_consented_at && !win.revoked_at && !win.published_at && Boolean(outcome.confirmed_at);
      return <tr key={outcome.id}>
        <td>{new Date(outcome.created_at).toLocaleDateString("en")}</td>
        <td>{outcome.outcome.replaceAll("_", " ")}</td>
        <td>{outcome.final_annual_price && outcome.currency ? new Intl.NumberFormat("en", { style: "currency", currency: outcome.currency, maximumFractionDigits: 0 }).format(Number(outcome.final_annual_price)) : "—"}</td>
        <td><span className={`badge badge-${outcome.vendor_response === "confirmed" ? "success" : outcome.vendor_response === "disputed" ? "warning" : "neutral"}`}>{outcome.vendor_response}</span></td>
        <td>{outcome.confirmed_at ? `Verified ${new Date(outcome.confirmed_at).toLocaleDateString("en")}` : canVerify ? "Ready" : "Pending vendor"}</td>
        <td>{win?.published_at ? <a className="text-link" href={`/wins/${win.slug}`}>Published</a> : win?.revoked_at ? "Revoked" : win?.buyer_consented_at ? "Consent given" : "Not created"}</td>
        <td>{canVerify ? <div className={s.actions}><form action={verifyDealOutcome}><input type="hidden" name="id" value={outcome.id} /><input type="hidden" name="decision" value="verified" /><button className="button button-primary">Verify</button></form><form action={verifyDealOutcome}><input type="hidden" name="id" value={outcome.id} /><input type="hidden" name="decision" value="rejected" /><input name="reason" required minLength={3} placeholder="Reason" /><button className="button button-secondary">Reject</button></form></div>
          : canPublish && win ? <form action={publishWin}><input type="hidden" name="id" value={win.id} /><input type="hidden" name="decision" value="publish" /><button className="button button-primary">Publish win</button></form>
          : win?.published_at ? <form action={publishWin}><input type="hidden" name="id" value={win.id} /><input type="hidden" name="decision" value="unpublish" /><button className="button button-secondary">Unpublish</button></form>
          : "—"}</td>
      </tr>;
    })}</tbody></table></div></AdminFrame>;
}
