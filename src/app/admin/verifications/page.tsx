import type { Metadata } from "next";
import { reviewVerification, signVerificationDocument } from "@/app/actions/admin-operations";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminFrame } from "@/components/admin-frame";
import s from "../admin.module.css";

export const metadata: Metadata = { title: "Spend verifications" }; export const dynamic = "force-dynamic";
type Doc = { id: string; duel_id: string; original_filename: string; size_bytes: number; deleted_at: string | null };

export default async function VerificationsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: items } = await supabase.from("duel_verifications").select("id,verification_type,created_at,duel_id,duels!inner(public_id,annual_spend,currency,software_products!duels_current_software_product_id_fkey(name))").eq("status", "pending").order("created_at");
  const duelIds = [...new Set((items ?? []).map((item) => item.duel_id))];
  const { data: docs } = duelIds.length ? await supabase.from("duel_documents").select("id,duel_id,original_filename,size_bytes,deleted_at").in("duel_id", duelIds).is("deleted_at", null) : { data: [] };
  const documentsByDuel = new Map<string, Doc[]>();
  for (const doc of (docs ?? []) as Doc[]) { const list = documentsByDuel.get(doc.duel_id) ?? []; list.push(doc); documentsByDuel.set(doc.duel_id, list); }

  return <AdminFrame><div className={s.navSpace} /><div className="dashboard-heading"><div><span className="eyebrow">Trust operations</span><h1>Spend verification</h1></div><span className="badge badge-warning">{items?.length || 0} pending</span></div>{items?.length ? <div className={s.queue}>{items.map((item) => {
    const duel = Array.isArray(item.duels) ? item.duels[0] : item.duels;
    const product = Array.isArray(duel.software_products) ? duel.software_products[0] : duel.software_products;
    const evidence = documentsByDuel.get(item.duel_id) ?? [];
    return <article className={s.item} key={item.id}>
      <div><h2>VD-{duel.public_id} · {product?.name}</h2><p>{item.verification_type.replaceAll("_", " ")} submitted {new Date(item.created_at).toLocaleDateString("en")}</p>
        <div className={s.evidence}>{evidence.length ? evidence.map((doc) => <form key={doc.id} action={signVerificationDocument}><input type="hidden" name="verificationId" value={item.id} /><input type="hidden" name="documentId" value={doc.id} /><button className="text-link" type="submit">📄 {doc.original_filename} ({Math.max(1, Math.round(doc.size_bytes / 1024))} KB)</button></form>) : <small>No evidence uploaded — verify only against out-of-band proof.</small>}</div>
      </div>
      <div className={s.meta}><strong>{new Intl.NumberFormat("en", { style: "currency", currency: duel.currency, maximumFractionDigits: 0 }).format(Number(duel.annual_spend))}/year</strong><small>Review the evidence above against annual spend and account ownership before deciding.</small></div>
      <div className={s.actions}><form action={reviewVerification}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="decision" value="rejected" /><input name="reason" required minLength={3} placeholder="Rejection reason" /><button className="button button-secondary">Reject</button></form><form action={reviewVerification}><input type="hidden" name="id" value={item.id} /><input type="hidden" name="decision" value="verified" /><input type="hidden" name="verifiedFields" value="annual_spend" /><button className="button button-primary">Verify</button></form></div>
    </article>;
  })}</div> : <div className={s.empty}>Verification queue cleared.</div>}</AdminFrame>;
}
