import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "@/components/admin-frame";
import s from "../admin.module.css";

export const metadata: Metadata={title:"Audit log"}; export const dynamic="force-dynamic";
export default async function AuditPage(){await requireAdmin();const supabase=await createClient();const {data:logs}=await supabase.from("audit_logs").select("id,actor_user_id,action,table_name,record_id,organization_id,old_data,new_data,created_at").order("created_at",{ascending:false}).limit(200);return <AdminFrame><div className={s.navSpace}/><div className="dashboard-heading"><div><span className="eyebrow">Forensic trail</span><h1>Audit log</h1></div><span className="badge">Latest 200</span></div><div className={s.tableWrap}><table className={s.table}><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Record</th><th>Change</th></tr></thead><tbody>{logs?.map((log)=><tr key={log.id}><td>{new Date(log.created_at).toLocaleString("en")}</td><td><span className={s.code}>{log.actor_user_id||"System"}</span></td><td>{log.action}<br/><small>{log.table_name}</small></td><td><span className={s.code}>{log.record_id||log.organization_id||"—"}</span></td><td><div className={s.code} title={JSON.stringify({old:log.old_data,new:log.new_data})}>{JSON.stringify({old:log.old_data,new:log.new_data})}</div></td></tr>)}</tbody></table></div></AdminFrame>}
