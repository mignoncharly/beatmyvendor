import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = { title: "Duel details" };
export const dynamic = "force-dynamic";

const statusCopy: Record<string, string> = {
  draft: "Finish the brief and submit it when you are ready.", pending_verification: "BeatMyVendor is checking the opportunity before it goes live.",
  open: "Qualified vendors can now submit structured offers.", reviewing: "Submissions are closed. Your offers are ready to compare.",
  selected: "You selected an offer. The vendor introduction is next.", introduced: "The buyer and selected vendor have been introduced.",
  converted: "This duel produced a confirmed deal.", closed: "This duel is closed.", expired: "The offer window ended without a selection.",
  rejected: "BeatMyVendor needs updated information before this can proceed."
};

function namedRelation(value: { name: string } | { name: string }[] | null) { return Array.isArray(value) ? value[0]?.name : value?.name; }

export default async function DuelDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  const saved = (await searchParams).saved;
  const { organization } = await requireOrganization("buyer");
  const supabase = await createClient();
  const { data: duel } = await supabase.from("duels")
    .select("*,categories(name),software_products(name),duel_requirements(id,kind,label,is_required),duel_verifications(id,verification_type,status),duel_documents(id,original_filename,size_bytes,created_at)")
    .eq("id", id).eq("buyer_organization_id", organization.organizationId).maybeSingle();
  if (!duel) notFound();
  const editable = duel.status === "draft" || duel.status === "pending_verification";
  const requirements = (duel.duel_requirements ?? []) as { id: string; kind: string; label: string; is_required: boolean }[];
  const verifications = (duel.duel_verifications ?? []) as { id: string; verification_type: string; status: string }[];
  const documents = (duel.duel_documents ?? []) as { id: string; original_filename: string; size_bytes: number }[];

  return <DashboardShell area="Buyer" organization={organization.name}>
    <div className="page-back"><Link href="/buyer">← Buyer dashboard</Link></div>
    {saved && <div className="notice-success">{saved === "submit" ? "Duel submitted for verification." : "Draft saved."}</div>}
    <div className="dashboard-heading"><div><span className="eyebrow">Duel #{duel.public_id}</span><h1>{namedRelation(duel.software_products) ?? "Software duel"}</h1><p className="heading-copy">{statusCopy[duel.status]}</p></div><div className="heading-actions"><span className={`badge badge-${duel.status}`}>{String(duel.status).replaceAll("_", " ")}</span>{editable && <Link href={`/buyer/duels/${duel.id}/edit`} className="button button-secondary">Edit duel</Link>}{["open","reviewing","selected","introduced","converted","closed"].includes(duel.status) && <Link href={`/buyer/duels/${duel.id}/compare`} className="button button-primary">View offers</Link>}</div></div>
    <div className="metric-grid">
      <article><span>Annual spend</span><strong>{new Intl.NumberFormat("en", { style: "currency", currency: duel.currency, maximumFractionDigits: 0 }).format(Number(duel.annual_spend))}</strong></article>
      <article><span>Seats</span><strong>{duel.seats}</strong></article><article><span>Category</span><strong>{namedRelation(duel.categories)}</strong></article>
      <article><span>Offer deadline</span><strong>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(duel.submission_deadline))}</strong></article>
    </div>
    <div className="detail-grid">
      <section className="detail-card"><span className="card-kicker">Requirements</span><h2>What vendors must cover</h2>{requirements.length ? <ul className="requirement-list">{requirements.map((requirement) => <li key={requirement.id}><span>{requirement.kind}</span>{requirement.label}</li>)}</ul> : <p>No requirements added yet.</p>}</section>
      <section className="detail-card"><span className="card-kicker">Trust checks</span><h2>Verification</h2>{verifications.length ? <ul className="verification-list">{verifications.map((verification) => <li key={verification.id}><span>{verification.verification_type.replaceAll("_", " ")}</span><strong>{verification.status}</strong></li>)}</ul> : <p>Submit the duel to begin verification.</p>}{documents.map((document) => <p className="document-row" key={document.id}>↳ {document.original_filename} <span>{Math.ceil(Number(document.size_bytes) / 1024)} KB</span></p>)}</section>
    </div>
    {duel.private_comment && <section className="private-note"><span className="card-kicker">Private note</span><p>{duel.private_comment}</p></section>}
  </DashboardShell>;
}
