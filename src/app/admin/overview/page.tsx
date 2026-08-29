import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "@/components/admin-frame";
import s from "../admin.module.css";

export const metadata: Metadata = { title: "Operations overview" };
export const dynamic = "force-dynamic";
type Metrics = { users:number; qualified_duels:number; open_duels:number; submitted_offers:number; introductions:number; revenue_cents:number; confirmed_savings:number; pending_vendors:number; pending_verifications:number; open_reports:number };

export default async function AdminOverviewPage() {
  await requireAdmin(); const supabase=await createClient();
  const [{ data }, { data: actions }] = await Promise.all([supabase.rpc("admin_dashboard_metrics"), supabase.from("admin_actions").select("id,action,target_type,reason,created_at,users!admin_actions_admin_user_id_fkey(email)").order("created_at",{ascending:false}).limit(8)]);
  const m=(data || {}) as Metrics; const currency=(c:number)=>new Intl.NumberFormat("en",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(c);
  const cards: Array<[string,string|number]>=[["Users",m.users||0],["Qualified Duels",m.qualified_duels||0],["Open Duels",m.open_duels||0],["Submitted offers",m.submitted_offers||0],["Introductions",m.introductions||0],["Revenue",currency((m.revenue_cents||0)/100)],["Confirmed savings",currency(m.confirmed_savings||0)],["Open operations",(m.pending_vendors||0)+(m.pending_verifications||0)+(m.open_reports||0)]];
  return <AdminFrame><div className={s.navSpace}/><div className="dashboard-heading"><div><span className="eyebrow">Control room</span><h1>Marketplace health</h1></div><span className="badge badge-success">Live metrics</span></div><div className={s.metrics}>{cards.map(([label,value])=><article className={s.metric} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div><div className="dashboard-toolbar"><div><strong>Recent operator actions</strong><span>Administrative ledger</span></div></div>{actions?.length?<div className={s.tableWrap}><table className={s.table}><thead><tr><th>Time</th><th>Operator</th><th>Action</th><th>Target</th><th>Reason</th></tr></thead><tbody>{actions.map((action)=>{const operator=Array.isArray(action.users)?action.users[0]:action.users;return <tr key={action.id}><td>{new Date(action.created_at).toLocaleString("en")}</td><td>{operator?.email||"System"}</td><td>{action.action.replaceAll("_"," ")}</td><td>{action.target_type}</td><td>{action.reason||"—"}</td></tr>})}</tbody></table></div>:<div className={s.empty}>No operator actions recorded yet.</div>}</AdminFrame>;
}
