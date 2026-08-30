import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";
import { DuelForm } from "@/components/duel-form";

export const metadata: Metadata = { title: "Start a Duel" };
export const dynamic = "force-dynamic";

export default async function NewDuelPage() {
  const { organization } = await requireOrganization("buyer");
  const supabase = await createClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("categories").select("id,name").eq("is_active", true).order("name"),
    supabase.from("software_products").select("id,category_id,name").eq("is_active", true).order("name")
  ]);
  return <DashboardShell area="Buyer" organization={organization.name}>
    <div className="page-back"><Link href="/buyer">← Buyer dashboard</Link></div>
    <div className="dashboard-heading"><div><span className="eyebrow">Start a Duel</span><h1>Turn your current contract into leverage.</h1><p className="heading-copy">Save a draft at any time. Submitted duels stay private while BeatMyVendor verifies the opportunity.</p></div><span className="badge">About 5 minutes</span></div>
    {categories?.length && products?.length ? <DuelForm categories={categories} products={products} /> : <div className="empty-panel"><h2>The catalog is not ready.</h2><p>Ask an administrator to add an active software category and product.</p></div>}
  </DashboardShell>;
}
