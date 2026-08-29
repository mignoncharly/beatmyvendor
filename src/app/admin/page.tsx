import type { Metadata } from "next";
import { reviewVendor } from "@/app/actions/admin-operations";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "@/components/admin-frame";
import s from "./admin.module.css";

export const metadata: Metadata = { title: "Vendor approvals" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: vendors } = await supabase.from("vendor_profiles").select("organization_id,created_at,description,contact_email,organizations!inner(name,website_url,country_code)").eq("approval_status", "pending").order("created_at");
  return <AdminFrame><div className={s.navSpace}/><div className="dashboard-heading"><div><span className="eyebrow">Trust operations</span><h1>Vendor approvals</h1></div><span className="badge badge-warning">{vendors?.length ?? 0} pending</span></div>{vendors?.length?<div className={s.queue}>{vendors.map((vendor)=>{const organization=Array.isArray(vendor.organizations)?vendor.organizations[0]:vendor.organizations;return <article className={s.item} key={vendor.organization_id}><div><h2>{organization.name}</h2><p>{organization.website_url??"Website not provided"} · {organization.country_code??"Country not provided"}</p></div><div className={s.meta}><span>{vendor.contact_email||"No contact email"}</span><small>{vendor.description||"No company description supplied."}</small></div><div className={s.actions}><form action={reviewVendor}><input type="hidden" name="id" value={vendor.organization_id}/><input type="hidden" name="decision" value="rejected"/><input name="reason" required minLength={3} placeholder="Rejection reason"/><button className="button button-secondary">Reject</button></form><form action={reviewVendor}><input type="hidden" name="id" value={vendor.organization_id}/><input type="hidden" name="decision" value="approved"/><button className="button button-primary">Approve</button></form></div></article>})}</div>:<div className={s.empty}>Approval queue cleared.</div>}</AdminFrame>;
}
